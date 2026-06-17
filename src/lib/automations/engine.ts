import { prisma } from '@/lib/db/prisma';

// Eventos internos suportados pelo motor de automações.
export type AutoEvent = 'PATIENT_CREATED' | 'DEAL_WON' | 'APPOINTMENT_CREATED';

export const EVENT_LABELS: Record<AutoEvent, string> = {
  PATIENT_CREATED: 'Paciente criado',
  DEAL_WON: 'Oportunidade ganha',
  APPOINTMENT_CREATED: 'Consulta agendada',
};

export const EVENT_ENTITY: Record<AutoEvent, 'PATIENT' | 'DEAL' | 'APPOINTMENT'> = {
  PATIENT_CREATED: 'PATIENT',
  DEAL_WON: 'DEAL',
  APPOINTMENT_CREATED: 'APPOINTMENT',
};

function safeParse(s: string) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

// Executa as regras ativas cujo gatilho corresponde ao evento. Nunca lança
// (falha de automação não pode quebrar a ação que a disparou).
export async function runAutomations(
  event: AutoEvent,
  ctx: { companyId: string; patientId?: string | null; dealId?: string | null; summary?: string }
) {
  try {
    const triggers = await prisma.automationTrigger.findMany({ where: { companyId: ctx.companyId, event } });
    if (!triggers.length) return;

    const rules = await prisma.automationRule.findMany({
      where: { id: { in: triggers.map((t) => t.ruleId) }, companyId: ctx.companyId, isActive: true, deletedAt: null },
    });
    if (!rules.length) return;

    // Ator "do sistema": primeiro gestor da empresa (para FKs createdById/userId).
    const actor = await prisma.user.findFirst({
      where: { companyId: ctx.companyId, deletedAt: null, role: { in: ['OWNER', 'SUPER_ADMIN', 'MANAGER'] } },
      orderBy: { createdAt: 'asc' },
    });
    if (!actor) return;

    for (const rule of rules) {
      const actions = await prisma.automationAction.findMany({
        where: { ruleId: rule.id, companyId: ctx.companyId }, orderBy: { order: 'asc' },
      });
      for (const a of actions) {
        const cfg = safeParse(a.config);
        try {
          if (a.actionType === 'CREATE_FOLLOW_UP' || a.actionType === 'CREATE_TASK') {
            const due = new Date();
            due.setDate(due.getDate() + Number(cfg.dueInDays ?? 1));
            due.setHours(12, 0, 0, 0);
            await prisma.followUpTask.create({
              data: {
                title: cfg.title || rule.name, dueDate: due, status: 'PENDING', priority: 'MEDIUM', type: 'FOLLOW_UP',
                companyId: ctx.companyId, patientId: ctx.patientId || null, dealId: ctx.dealId || null, createdById: actor.id,
              },
            });
          } else if (a.actionType === 'SEND_NOTIFICATION') {
            await prisma.notificationEvent.create({
              data: {
                title: cfg.title || rule.name, message: cfg.message || ctx.summary || 'Automação executada', type: 'INFO',
                userId: actor.id, companyId: ctx.companyId, patientId: ctx.patientId || null, dealId: ctx.dealId || null,
              },
            });
          }
        } catch (e) {
          console.error('Ação de automação falhou:', a.actionType, e);
        }
      }
      const trig = triggers.find((t) => t.ruleId === rule.id);
      await prisma.automationExecution.create({
        data: {
          ruleId: rule.id, triggerId: trig?.id ?? rule.id, status: 'SUCCESS', completedAt: new Date(),
          companyId: ctx.companyId, patientId: ctx.patientId || null, dealId: ctx.dealId || null,
        },
      }).catch(() => {});
    }
  } catch (e) {
    console.error('runAutomations error:', e);
  }
}
