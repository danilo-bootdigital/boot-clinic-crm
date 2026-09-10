// Recorrência sem cron: concluir uma tarefa recorrente gera a próxima
// ocorrência já na mesma requisição, com o prazo somado à dueDate concluída
// (não à data de hoje) — a série não "escorrega" com atrasos acumulados, e o
// histórico da ocorrência concluída não é tocado.
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
import { PUT } from '@/app/api/followup/tasks/[id]/route';
import { resolveModuleUser } from '@/lib/api/session';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;

const putReq = (body: any) =>
  new NextRequest('http://localhost/api/followup/tasks/x', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(async () => {
  db.__reset();
  vi.mocked(resolveModuleUser).mockResolvedValue({ dbUser: { id: 'u1', role: 'MANAGER', companyId: 'A' } } as any);
});

describe('conclusão de tarefa recorrente — próxima ocorrência', () => {
  it('semanal: concluir gera a próxima 7 dias após o prazo concluído', async () => {
    const original = await db.followUpTask.create({
      data: {
        title: 'Revisar campanhas', dueDate: new Date('2026-09-14T12:00:00'), status: 'PENDING', priority: 'MEDIUM', type: 'TASK',
        companyId: 'A', createdById: 'u1', assignedToId: 'u1',
        isRecurring: true, recurrenceType: 'WEEKLY', recurrenceEvery: 1,
      },
    });

    const res = await PUT(putReq({ status: 'COMPLETED' }), { params: { id: original.id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nextOccurrenceId).toBeTruthy();

    const proxima = await db.followUpTask.findFirst({ where: { id: body.nextOccurrenceId } });
    expect(proxima!.title).toBe('Revisar campanhas');
    expect(proxima!.status).toBe('PENDING');
    expect(proxima!.dueDate.toISOString().slice(0, 10)).toBe('2026-09-21');
    expect(proxima!.recurrenceParentId).toBe(original.id);
    expect(proxima!.assignedToId).toBe('u1');

    // A ocorrência concluída não é retocada.
    const concluida = await db.followUpTask.findFirst({ where: { id: original.id } });
    expect(concluida!.dueDate.toISOString().slice(0, 10)).toBe('2026-09-14');
    expect(concluida!.status).toBe('COMPLETED');
  });

  it('mensal "todo dia 5": concluir em setembro gera outubro no mesmo dia', async () => {
    const original = await db.followUpTask.create({
      data: {
        title: 'Conferir contas a pagar', dueDate: new Date('2026-09-05T12:00:00'), status: 'PENDING', priority: 'MEDIUM', type: 'TASK',
        companyId: 'A', createdById: 'u1', assignedToId: 'u1',
        isRecurring: true, recurrenceType: 'MONTHLY', recurrenceEvery: 1,
      },
    });
    const res = await PUT(putReq({ status: 'COMPLETED' }), { params: { id: original.id } });
    const body = await res.json();
    const proxima = await db.followUpTask.findFirst({ where: { id: body.nextOccurrenceId } });
    expect(proxima!.dueDate.toISOString().slice(0, 10)).toBe('2026-10-05');
  });

  it('encadeia pela tarefa ORIGINAL da série, não pela anterior', async () => {
    const original = await db.followUpTask.create({
      data: {
        title: 'Confirmar agenda de amanhã', dueDate: new Date('2026-09-10T12:00:00'), status: 'PENDING', priority: 'MEDIUM', type: 'TASK',
        companyId: 'A', createdById: 'u1', assignedToId: 'u1',
        isRecurring: true, recurrenceType: 'DAILY', recurrenceEvery: 1,
      },
    });
    const r1 = await PUT(putReq({ status: 'COMPLETED' }), { params: { id: original.id } });
    const { nextOccurrenceId: segunda } = await r1.json();
    const r2 = await PUT(putReq({ status: 'COMPLETED' }), { params: { id: segunda } });
    const { nextOccurrenceId: terceira } = await r2.json();

    const t3 = await db.followUpTask.findFirst({ where: { id: terceira } });
    expect(t3!.recurrenceParentId).toBe(original.id); // não aponta pra "segunda"
  });

  it('tarefa não recorrente concluída não gera ocorrência nenhuma', async () => {
    const t = await db.followUpTask.create({
      data: { title: 'Comprar papel higiênico', dueDate: new Date(), status: 'PENDING', priority: 'MEDIUM', type: 'TASK', companyId: 'A', createdById: 'u1', assignedToId: 'u1' },
    });
    const res = await PUT(putReq({ status: 'COMPLETED' }), { params: { id: t.id } });
    const body = await res.json();
    expect(body.nextOccurrenceId).toBeNull();
    expect(await db.followUpTask.count()).toBe(1);
  });
});
