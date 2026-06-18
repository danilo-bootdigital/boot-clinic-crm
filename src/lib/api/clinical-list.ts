import { prisma } from '@/lib/db/prisma';

// Enriquece uma lista de registros clínicos com o nome do paciente. Como os
// modelos clínicos usam patientId escalar (padrão Deal/Appointment), fazemos o
// "join" manualmente, escopado por empresa.
export async function attachPatientNames<T extends { patientId: string }>(
  rows: T[],
  companyId: string,
): Promise<(T & { patientName: string | null })[]> {
  const ids = Array.from(new Set(rows.map((r) => r.patientId)));
  if (ids.length === 0) return rows.map((r) => ({ ...r, patientName: null }));
  const patients = await prisma.patient.findMany({
    where: { id: { in: ids }, companyId },
    select: { id: true, name: true },
  });
  const map = new Map(patients.map((p) => [p.id, p.name]));
  return rows.map((r) => ({ ...r, patientName: map.get(r.patientId) ?? null }));
}
