import { prisma } from '@/lib/db/prisma';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { requireModuleEnabled } from '@/lib/api/modules';
import { brTodayStart } from '@/lib/followup/dates';
import { onAppointmentAttended, onAppointmentUnattended, type RunTx } from '@/lib/stock/appointments';
import { reportRejectedExit } from '@/lib/stock/alerts';
import type { Actor } from '@/lib/stock/movements';

// Ganchos da Agenda → Estoque (§6 Agenda). Regra de ouro: NADA aqui pode
// derrubar a operação da agenda — tudo é best-effort, com log, e só roda
// quando o módulo 'estoque' está habilitado para a clínica.

type AgendaUser = { id: string; name: string; companyId: string; role: string; company?: { plan?: string | null } | null };

const toActor = (u: AgendaUser): Actor => ({ id: u.id, name: u.name, companyId: u.companyId, role: u.role });
const runTxFor = (companyId: string): RunTx => (fn) => withFinanceTenant(companyId, fn, { timeout: 30_000 });

async function stockEnabled(u: AgendaUser) {
  // requireModuleEnabled busca o plano quando o usuário veio sem ele.
  return requireModuleEnabled(u, 'estoque').then((blocked) => blocked === null).catch(() => false);
}

// "Compareceu": modo automático baixa o kit; falta de saldo vira alerta + tarefa.
export async function stockOnAttend(u: AgendaUser, appointmentId: string, request?: Request) {
  try {
    if (!(await stockEnabled(u))) return;
    const actor = toActor(u);
    const { results } = await onAppointmentAttended(runTxFor(u.companyId), actor, appointmentId);
    for (const r of results) {
      if (!r.ok && r.rejected) await reportRejectedExit(actor, r.rejected, request);
    }
  } catch (e) {
    console.error('[estoque] baixa automática no atendimento falhou (atendimento mantido):', e);
  }
}

// Atendimento desfeito: estorna as baixas. Controlado que o usuário não pode
// estornar fica como tarefa para a gestão.
export async function stockOnUnattend(u: AgendaUser, appointmentId: string, newStatus: string) {
  try {
    if (!(await stockEnabled(u))) return;
    const actor = toActor(u);
    const { kept } = await onAppointmentUnattended(runTxFor(u.companyId), actor, appointmentId, `Atendimento desfeito (${newStatus}) por ${u.name}`);
    if (kept.length > 0) {
      await prisma.followUpTask.create({
        data: {
          title: `Estornar baixa de material: atendimento desfeito`,
          description:
            `O atendimento foi alterado para ${newStatus} por ${u.name}, mas estas baixas não puderam ser estornadas automaticamente:\n` +
            kept.map((k) => `• ${k.itemName}: ${k.error}`).join('\n') +
            `\nEstorne pela tela do item (Estoque → kardex).\n[estoque:desfazer:${appointmentId}]`,
          dueDate: brTodayStart(),
          priority: 'HIGH',
          type: 'ALERT',
          category: 'ADMINISTRATIVO',
          createdById: u.id,
          companyId: u.companyId,
          appointmentId,
        },
      });
    }
  } catch (e) {
    console.error('[estoque] estorno das baixas do atendimento desfeito falhou:', e);
  }
}
