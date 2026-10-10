import { prisma } from '@/lib/db/prisma';
import { writeAudit } from '@/lib/api/audit';
import { brTodayStart } from '@/lib/followup/dates';
import { MOVEMENT_LABELS } from '@/lib/stock-caps';
import type { Actor, RejectedExit } from '@/lib/stock/movements';

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

// Marca na descrição da tarefa: dedup "uma tarefa aberta por item×local" sem
// coluna nova em FollowUpTask (mesmo padrão de alertas sem cron de Tarefas).
export const ruptureMarker = (itemId: string, locationId: string) => `[estoque:ruptura:${itemId}:${locationId}]`;

// Saída recusada por falta de saldo (§5.3). Roda FORA da transação da
// movimentação (que foi desfeita): auditoria + sino da gestão + tarefa
// ADMINISTRATIVO para regularizar. Best-effort — nunca derruba a resposta.
export async function reportRejectedExit(actor: Actor, info: RejectedExit, request?: Request) {
  await writeAudit({
    dbUser: actor,
    action: 'REJECTED_NO_BALANCE',
    entityType: 'STOCK_MOVEMENT',
    entityId: info.itemId,
    newValues: info,
    request,
  });

  try {
    const what = `${info.itemName} em ${info.locationName}${info.lotNumber ? ` (lote ${info.lotNumber})` : ''}`;
    const detail =
      `${MOVEMENT_LABELS[info.type] ?? info.type}: pedido ${fmt(info.requested)} ${info.baseUnit}, ` +
      `disponível ${fmt(info.available)} ${info.baseUnit}. Tentativa de ${actor.name}.`;

    const managers = await prisma.user.findMany({
      where: { companyId: actor.companyId, role: { in: ['OWNER', 'MANAGER'] }, deletedAt: null },
      select: { id: true },
    });
    if (managers.length > 0) {
      await prisma.notificationEvent.createMany({
        data: managers.map((m) => ({
          title: 'Saída recusada por falta de saldo',
          message: `${what}. ${detail}`,
          type: 'WARNING' as const,
          priority: 'HIGH' as const,
          userId: m.id,
          companyId: actor.companyId,
          patientId: info.patientId ?? null,
          metadata: JSON.stringify({ module: 'estoque', itemId: info.itemId, locationId: info.locationId }),
        })),
      });
    }

    const marker = ruptureMarker(info.itemId, info.locationId);
    const open = await prisma.followUpTask.findFirst({
      where: {
        companyId: actor.companyId,
        deletedAt: null,
        status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
        description: { contains: marker },
      },
      select: { id: true },
    });
    if (!open) {
      await prisma.followUpTask.create({
        data: {
          title: `Regularizar saldo: ${info.itemName} · ${info.locationName}`,
          description: `Saída recusada por falta de saldo. ${detail}\nRegistre a entrada, transfira de outro local ou corrija o lote.\n${marker}`,
          dueDate: brTodayStart(),
          priority: 'HIGH',
          type: 'ALERT',
          category: 'ADMINISTRATIVO',
          createdById: actor.id,
          companyId: actor.companyId,
          patientId: info.patientId ?? null,
        },
      });
    }
  } catch (e) {
    console.error('[estoque] falha ao emitir alerta de saída recusada:', e);
  }
}
