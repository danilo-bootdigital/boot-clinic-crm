// Cadastro do médico exige especialidade.
//
// É o dado de onde o agendamento tira a especialidade: médico salvo sem ela
// nasce não-agendável, e o erro só apareceria depois, para a recepção, no meio
// do atendimento. A trava vive na API porque a tela não é a única porta.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});
vi.mock('@/lib/api/session', () => ({ resolveDbUser: vi.fn() }));
vi.mock('@/lib/api/permissions', () => ({ requirePermission: vi.fn(() => null) }));

import { prisma } from '@/lib/db/prisma';
import { POST } from '@/app/api/professionals/route';
import { PUT } from '@/app/api/professionals/[id]/route';
import { resolveDbUser } from '@/lib/api/session';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;

const req = (body: any, method = 'POST') =>
  new NextRequest('http://localhost/api/professionals', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

let ortopedia: any;
let deOutraClinica: any;

beforeEach(async () => {
  db.__reset();
  vi.mocked(resolveDbUser).mockResolvedValue({ dbUser: { id: 'u1', name: 'Gerente', companyId: 'A' } } as any);
  ortopedia = await db.specialty.create({ data: { companyId: 'A', name: 'Ortopedia' } });
  deOutraClinica = await db.specialty.create({ data: { companyId: 'B', name: 'Ortopedia' } });
});

describe('POST /api/professionals', () => {
  it('sem especialidade → 400 e médico não é criado', async () => {
    const res = await POST(req({ name: 'Dra. Fernanda', crm: 'CRM/SP 123456' }));
    expect(res.status).toBe(400);
    expect(await db.professional.count()).toBe(0);
  });

  it('especialidade de outra clínica não conta como especialidade → 400', async () => {
    const res = await POST(
      req({ name: 'Dra. Fernanda', crm: 'CRM/SP 123456', specialtyIds: [deOutraClinica.id] })
    );
    expect(res.status).toBe(400);
    expect(await db.professional.count()).toBe(0);
  });

  it('com especialidade da clínica → cria e vincula', async () => {
    const res = await POST(
      req({ name: 'Dra. Fernanda', crm: 'CRM/SP 123456', specialtyIds: [ortopedia.id] })
    );
    expect(res.status).toBe(201);
    const vinculos = await db.professionalSpecialty.findMany({ where: { companyId: 'A' } });
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0].specialtyId).toBe(ortopedia.id);
  });
});

describe('PUT /api/professionals/[id]', () => {
  it('editar tirando todas as especialidades → 400, e o vínculo antigo fica de pé', async () => {
    const medico = await db.professional.create({ data: { companyId: 'A', name: 'Dra. Fernanda', isActive: true } });
    await db.professionalSpecialty.create({
      data: { companyId: 'A', professionalId: medico.id, specialtyId: ortopedia.id },
    });

    const res = await PUT(req({ name: 'Dra. Fernanda R.', specialtyIds: [] }, 'PUT'), {
      params: { id: medico.id },
    });
    expect(res.status).toBe(400);
    expect(await db.professionalSpecialty.count({ where: { professionalId: medico.id } })).toBe(1);
  });

  it('edição que não mexe em especialidade (ativar/desativar) segue livre', async () => {
    const medico = await db.professional.create({ data: { companyId: 'A', name: 'Dra. Fernanda', isActive: true } });
    const res = await PUT(req({ isActive: false }, 'PUT'), { params: { id: medico.id } });
    expect(res.status).toBe(200);
    expect((await db.professional.findUnique({ where: { id: medico.id } }))!.isActive).toBe(false);
  });
});
