import { prisma } from '@/lib/db/prisma';

// Retorna um agendamento que conflita (mesmo profissional, janela sobreposta,
// não cancelado/faltou), ou null. `excludeId` ignora o próprio agendamento ao editar.
export async function findAppointmentConflict(args: {
  companyId: string;
  professionalId: string;
  startAt: Date;
  endAt: Date;
  excludeId?: string;
}) {
  const { companyId, professionalId, startAt, endAt, excludeId } = args;
  return prisma.appointment.findFirst({
    where: {
      companyId,
      professionalId,
      deletedAt: null,
      status: { notIn: ['CANCELED', 'NO_SHOW'] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(excludeId && { id: { not: excludeId } }),
    },
  });
}
