import { prisma } from '@/lib/db/prisma';

// Helpers de posse: confirmam que uma entidade referenciada pertence à empresa
// do usuário — barrando que escritas vinculem FKs de outra empresa (multi-tenant).

export async function ownsPatient(companyId: string, id?: string | null) {
  if (!id) return true;
  return !!(await prisma.patient.findFirst({ where: { id, companyId, deletedAt: null }, select: { id: true } }));
}

export async function ownsProfessional(companyId: string, id?: string | null) {
  if (!id) return true;
  return !!(await prisma.professional.findFirst({ where: { id, companyId, deletedAt: null }, select: { id: true } }));
}

export async function ownsSpecialty(companyId: string, id?: string | null) {
  if (!id) return true;
  return !!(await prisma.specialty.findFirst({ where: { id, companyId, deletedAt: null }, select: { id: true } }));
}

export async function ownsRoom(companyId: string, id?: string | null) {
  if (!id) return true;
  return !!(await prisma.room.findFirst({ where: { id, companyId, deletedAt: null }, select: { id: true } }));
}

export async function ownsUser(companyId: string, id?: string | null) {
  if (!id) return true;
  return !!(await prisma.user.findFirst({ where: { id, companyId, deletedAt: null }, select: { id: true } }));
}

export async function ownsDeal(companyId: string, id?: string | null) {
  if (!id) return true;
  return !!(await prisma.deal.findFirst({ where: { id, companyId, deletedAt: null }, select: { id: true } }));
}

export async function ownsStage(companyId: string, id?: string | null) {
  if (!id) return true;
  return !!(await prisma.pipelineStage.findFirst({ where: { id, companyId }, select: { id: true } }));
}
