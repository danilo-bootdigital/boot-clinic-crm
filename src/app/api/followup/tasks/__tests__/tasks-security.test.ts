// Tarefas — segurança e regras de posse (CLAUDE.md do pedido, seções 21/25/27).
//
// Cobre o que a UI não pode ser a única a impedir: responsável tem que ser da
// mesma clínica, vínculos (paciente/deal/agendamento) não podem vazar entre
// empresas, quem não é gestão só vê/edita o que criou ou o que lhe foi
// atribuído, e cancelar/excluir é ação de gestão.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});
vi.mock('@/lib/api/session', () => ({
  resolveModuleUser: vi.fn(),
  ADMIN_ROLES: ['SUPER_ADMIN', 'OWNER', 'MANAGER'],
}));
vi.mock('@/lib/api/permissions', () => ({ requirePermission: vi.fn(() => null) }));

import { prisma } from '@/lib/db/prisma';
import { GET, POST } from '@/app/api/followup/tasks/route';
import { PUT, DELETE } from '@/app/api/followup/tasks/[id]/route';
import { resolveModuleUser } from '@/lib/api/session';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;

function asUser(id: string, role: string, companyId = 'A') {
  vi.mocked(resolveModuleUser).mockResolvedValue({ dbUser: { id, role, companyId } } as any);
}

const getReq = (qs = '') => new NextRequest(`http://localhost/api/followup/tasks${qs}`);
const postReq = (body: any) =>
  new NextRequest('http://localhost/api/followup/tasks', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const putReq = (body: any) =>
  new NextRequest('http://localhost/api/followup/tasks/x', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

let recepcao: any, gestor: any, outroStaff: any;

beforeEach(async () => {
  db.__reset();
  recepcao = await db.user.create({ data: { id: 'u-recepcao', name: 'Recepção', role: 'RECEPTION', companyId: 'A' } });
  gestor = await db.user.create({ data: { id: 'u-gestor', name: 'Gestora', role: 'MANAGER', companyId: 'A' } });
  outroStaff = await db.user.create({ data: { id: 'u-outro', name: 'Comercial', role: 'ATTENDANCE', companyId: 'A' } });
  await db.user.create({ data: { id: 'u-outra-clinica', name: 'Fulano', role: 'RECEPTION', companyId: 'B' } });
});

describe('POST /followup/tasks — validação de vínculos', () => {
  it('sem responsável → 400', async () => {
    asUser(recepcao.id, 'RECEPTION');
    const res = await POST(postReq({ title: 'Comprar papel', dueDate: '2026-09-20' }));
    expect(res.status).toBe(400);
    expect(await db.followUpTask.count()).toBe(0);
  });

  it('responsável de outra clínica → 400 (não cria)', async () => {
    asUser(recepcao.id, 'RECEPTION');
    const res = await POST(postReq({ title: 'Tarefa', dueDate: '2026-09-20', assignedToId: 'u-outra-clinica' }));
    expect(res.status).toBe(400);
    expect(await db.followUpTask.count()).toBe(0);
  });

  it('paciente de outra clínica não pode ser vinculado', async () => {
    asUser(recepcao.id, 'RECEPTION');
    const pacienteB = await db.patient.create({ data: { companyId: 'B', name: 'Paciente de outra clínica' } });
    const res = await POST(postReq({ title: 'Tarefa', dueDate: '2026-09-20', assignedToId: recepcao.id, patientId: pacienteB.id }));
    expect(res.status).toBe(400);
    expect(await db.followUpTask.count()).toBe(0);
  });

  it('responsável + prazo válidos → cria como PENDING, criador = sessão (nunca o corpo da requisição)', async () => {
    asUser(recepcao.id, 'RECEPTION');
    const res = await POST(postReq({ title: 'Comprar papel higiênico', dueDate: '2026-09-20', assignedToId: gestor.id, createdById: 'ALGUEM_INVENTADO' }));
    expect(res.status).toBe(201);
    const salvo = await db.followUpTask.findFirst({ where: { companyId: 'A' } });
    expect(salvo!.status).toBe('PENDING');
    expect(salvo!.assignedToId).toBe(gestor.id);
    expect(salvo!.createdById).toBe(recepcao.id); // não veio do body
  });
});

describe('GET /followup/tasks — visibilidade por papel', () => {
  beforeEach(async () => {
    await db.followUpTask.create({ data: { title: 'Da recepção', dueDate: new Date(), status: 'PENDING', priority: 'MEDIUM', type: 'TASK', companyId: 'A', createdById: recepcao.id, assignedToId: recepcao.id } });
    await db.followUpTask.create({ data: { title: 'Do comercial', dueDate: new Date(), status: 'PENDING', priority: 'MEDIUM', type: 'TASK', companyId: 'A', createdById: outroStaff.id, assignedToId: outroStaff.id } });
  });

  it('usuário comum só vê o que criou ou o que lhe foi atribuído', async () => {
    asUser(recepcao.id, 'RECEPTION');
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.tasks.map((t: any) => t.title)).toEqual(['Da recepção']);
  });

  it('gestão vê a clínica toda', async () => {
    asUser(gestor.id, 'MANAGER');
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.tasks.map((t: any) => t.title).sort()).toEqual(['Da recepção', 'Do comercial']);
  });

  it('tarefa de outra empresa nunca aparece, nem para gestão', async () => {
    await db.followUpTask.create({ data: { title: 'De outra clínica', dueDate: new Date(), status: 'PENDING', priority: 'MEDIUM', type: 'TASK', companyId: 'B', createdById: 'x', assignedToId: 'x' } });
    asUser(gestor.id, 'MANAGER');
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.tasks.some((t: any) => t.title === 'De outra clínica')).toBe(false);
  });
});

describe('PUT/DELETE /followup/tasks/[id] — posse e ações de gestão', () => {
  it('quem não criou nem é responsável não pode editar', async () => {
    const t = await db.followUpTask.create({ data: { title: 'Tarefa do comercial', dueDate: new Date(), status: 'PENDING', priority: 'MEDIUM', type: 'TASK', companyId: 'A', createdById: outroStaff.id, assignedToId: outroStaff.id } });
    asUser(recepcao.id, 'RECEPTION');
    const res = await PUT(putReq({ title: 'Invadido' }), { params: { id: t.id } });
    expect(res.status).toBe(403);
  });

  it('responsável pode concluir a própria tarefa', async () => {
    const t = await db.followUpTask.create({ data: { title: 'Confirmar agenda', dueDate: new Date(), status: 'PENDING', priority: 'MEDIUM', type: 'TASK', companyId: 'A', createdById: gestor.id, assignedToId: recepcao.id } });
    asUser(recepcao.id, 'RECEPTION');
    const res = await PUT(putReq({ status: 'COMPLETED' }), { params: { id: t.id } });
    expect(res.status).toBe(200);
    const salvo = await db.followUpTask.findFirst({ where: { id: t.id } });
    expect(salvo!.status).toBe('COMPLETED');
    expect(salvo!.completedById).toBe(recepcao.id);
  });

  it('usuário comum não pode cancelar — só gestão', async () => {
    const t = await db.followUpTask.create({ data: { title: 'Minha tarefa', dueDate: new Date(), status: 'PENDING', priority: 'MEDIUM', type: 'TASK', companyId: 'A', createdById: recepcao.id, assignedToId: recepcao.id } });
    asUser(recepcao.id, 'RECEPTION');
    const res = await PUT(putReq({ status: 'CANCELED' }), { params: { id: t.id } });
    expect(res.status).toBe(403);
    const salvo = await db.followUpTask.findFirst({ where: { id: t.id } });
    expect(salvo!.status).toBe('PENDING');
  });

  it('gestão pode cancelar', async () => {
    const t = await db.followUpTask.create({ data: { title: 'Tarefa', dueDate: new Date(), status: 'PENDING', priority: 'MEDIUM', type: 'TASK', companyId: 'A', createdById: recepcao.id, assignedToId: recepcao.id } });
    asUser(gestor.id, 'MANAGER');
    const res = await PUT(putReq({ status: 'CANCELED', canceledReason: 'Não é mais necessário' }), { params: { id: t.id } });
    expect(res.status).toBe(200);
  });

  it('quem não é gestão nem criou a tarefa não pode reatribuir para outra pessoa', async () => {
    const t = await db.followUpTask.create({ data: { title: 'Tarefa', dueDate: new Date(), status: 'PENDING', priority: 'MEDIUM', type: 'TASK', companyId: 'A', createdById: gestor.id, assignedToId: recepcao.id } });
    asUser(recepcao.id, 'RECEPTION');
    const res = await PUT(putReq({ assignedToId: outroStaff.id }), { params: { id: t.id } });
    expect(res.status).toBe(403);
  });

  it('quem criou pode reatribuir mesmo sem ser gestão', async () => {
    const t = await db.followUpTask.create({ data: { title: 'Tarefa', dueDate: new Date(), status: 'PENDING', priority: 'MEDIUM', type: 'TASK', companyId: 'A', createdById: recepcao.id, assignedToId: recepcao.id } });
    asUser(recepcao.id, 'RECEPTION');
    const res = await PUT(putReq({ assignedToId: outroStaff.id }), { params: { id: t.id } });
    expect(res.status).toBe(200);
    const salvo = await db.followUpTask.findFirst({ where: { id: t.id } });
    expect(salvo!.assignedToId).toBe(outroStaff.id);
  });

  it('excluir é ação de gestão — usuário comum recebe 403 e a tarefa continua', async () => {
    const t = await db.followUpTask.create({ data: { title: 'Tarefa', dueDate: new Date(), status: 'PENDING', priority: 'MEDIUM', type: 'TASK', companyId: 'A', createdById: recepcao.id, assignedToId: recepcao.id } });
    asUser(recepcao.id, 'RECEPTION');
    const res = await DELETE(new NextRequest('http://localhost/api/followup/tasks/x', { method: 'DELETE' }), { params: { id: t.id } });
    expect(res.status).toBe(403);
    const salvo = await db.followUpTask.findFirst({ where: { id: t.id } });
    expect(salvo!.deletedAt).toBeNull();
  });
});
