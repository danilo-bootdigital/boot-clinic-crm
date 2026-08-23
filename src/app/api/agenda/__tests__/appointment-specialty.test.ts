// Especialidade do agendamento vem do cadastro do médico.
//
// Antes o formulário listava TODAS as especialidades da clínica e já vinha na
// primeira: dava para agendar o ortopedista como "Cardiologia" e o relatório por
// especialidade virava ficção. A regra tem que valer no servidor — se valesse só
// na tela, a API continuaria sendo porta aberta.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});
vi.mock('@/lib/api/session', () => ({ resolveModuleUser: vi.fn() }));
vi.mock('@/lib/api/permissions', () => ({ requirePermission: vi.fn(() => null) }));
vi.mock('@/lib/automations/engine', () => ({ runAutomations: vi.fn(async () => undefined) }));
vi.mock('@/lib/api/appointments', () => ({
  findAppointmentConflict: vi.fn(async () => null),
  provisionTeleconsultation: vi.fn(async () => undefined),
}));

import { prisma } from '@/lib/db/prisma';
import { POST } from '@/app/api/agenda/appointments/route';
import { resolveModuleUser } from '@/lib/api/session';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;

const postReq = (body: any) =>
  new NextRequest('http://localhost/api/agenda/appointments', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

let paciente: any;
let ortopedista: any;
let ortopedia: any;
let cardiologia: any;

beforeEach(async () => {
  db.__reset();
  vi.mocked(resolveModuleUser).mockResolvedValue({ dbUser: { id: 'u1', name: 'Recepção', companyId: 'A' } } as any);

  paciente = await db.patient.create({ data: { companyId: 'A', name: 'Agatha' } });
  ortopedista = await db.professional.create({ data: { companyId: 'A', name: 'Dra. Fernanda', isActive: true } });
  ortopedia = await db.specialty.create({ data: { companyId: 'A', name: 'Ortopedia' } });
  cardiologia = await db.specialty.create({ data: { companyId: 'A', name: 'Cardiologia' } });
  // A médica atende Ortopedia — e só.
  await db.professionalSpecialty.create({
    data: { companyId: 'A', professionalId: ortopedista.id, specialtyId: ortopedia.id },
  });
});

const base = () => ({
  patientId: paciente.id,
  professionalId: ortopedista.id,
  type: 'Consulta',
  startAt: '2026-09-01T13:00:00.000Z',
  durationMinutes: 30,
});

describe('POST /agenda/appointments — vínculo médico ↔ especialidade', () => {
  it('especialidade que não é do médico → 400 e nada agendado', async () => {
    const res = await POST(postReq({ ...base(), specialtyId: cardiologia.id }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cadastro deste\(a\) médico\(a\)/i);
    expect(await db.appointment.count()).toBe(0);
  });

  it('especialidade do próprio médico → agenda', async () => {
    const res = await POST(postReq({ ...base(), specialtyId: ortopedia.id }));
    expect(res.status).toBe(201);
    const salvo = await db.appointment.findFirst({ where: { companyId: 'A' } });
    expect(salvo!.specialtyId).toBe(ortopedia.id);
    expect(salvo!.professionalId).toBe(ortopedista.id);
  });

  it('médico SEM especialidade cadastrada não é agendável', async () => {
    const semEsp = await db.professional.create({ data: { companyId: 'A', name: 'Dr. Raul', isActive: true } });
    const res = await POST(postReq({ ...base(), professionalId: semEsp.id, specialtyId: ortopedia.id }));
    expect(res.status).toBe(400);
    expect(await db.appointment.count()).toBe(0);
  });

  it('vínculo de outra clínica não vale', async () => {
    // Mesmo par (médico, especialidade), gravado sob OUTRA empresa.
    const outro = await db.professional.create({ data: { companyId: 'B', name: 'Dr. Externo', isActive: true } });
    await db.professionalSpecialty.create({
      data: { companyId: 'B', professionalId: outro.id, specialtyId: ortopedia.id },
    });
    const res = await POST(postReq({ ...base(), professionalId: outro.id, specialtyId: ortopedia.id }));
    expect(res.status).toBe(400);
    expect(await db.appointment.count()).toBe(0);
  });
});
