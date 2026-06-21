import { prisma } from '@/lib/db/prisma';
import { sendWhatsappForCompany } from '@/lib/whatsapp/evolution';

// Notificações da teleconsulta por WhatsApp + registro na timeline do paciente.
// Best-effort: se a Evolution API não estiver configurada, a mensagem é apenas
// registrada na timeline (pronto-para-conectar), sem quebrar o fluxo.

export type TeleNotifyEvent =
  | 'CREATED' // link inicial ao agendar
  | 'REMINDER_24H'
  | 'REMINDER_1H'
  | 'REMINDER_15M'
  | 'STARTING' // link no início
  | 'LATE' // atraso
  | 'FOLLOW_UP'; // após a consulta

function fmtTime(d: Date): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function buildMessage(event: TeleNotifyEvent, ctx: { patientName: string; link: string; startAt: Date }): string {
  const when = fmtTime(ctx.startAt);
  const first = ctx.patientName.split(' ')[0] || ctx.patientName;
  switch (event) {
    case 'CREATED':
      return `Olá, ${first}! Sua teleconsulta foi agendada para ${when}. No horário, acesse pelo link: ${ctx.link}`;
    case 'REMINDER_24H':
      return `Olá, ${first}! Lembrete: sua teleconsulta é amanhã (${when}). Link de acesso: ${ctx.link}`;
    case 'REMINDER_1H':
      return `Olá, ${first}! Sua teleconsulta começa em 1 hora (${when}). Link: ${ctx.link}`;
    case 'REMINDER_15M':
      return `Olá, ${first}! Faltam 15 minutos para sua teleconsulta. Já pode acessar a sala: ${ctx.link}`;
    case 'STARTING':
      return `Olá, ${first}! Sua teleconsulta está começando. Entre na sala agora: ${ctx.link}`;
    case 'LATE':
      return `Olá, ${first}! Notamos que você ainda não entrou na teleconsulta. O profissional está aguardando: ${ctx.link}`;
    case 'FOLLOW_UP':
      return `Olá, ${first}! Obrigado por sua teleconsulta. Qualquer dúvida, estamos à disposição. 💙`;
  }
}

const EVENT_TITLE: Record<TeleNotifyEvent, string> = {
  CREATED: 'Teleconsulta agendada — link enviado',
  REMINDER_24H: 'Lembrete de teleconsulta (24h)',
  REMINDER_1H: 'Lembrete de teleconsulta (1h)',
  REMINDER_15M: 'Lembrete de teleconsulta (15min)',
  STARTING: 'Teleconsulta iniciando — link enviado',
  LATE: 'Paciente em atraso — notificação enviada',
  FOLLOW_UP: 'Follow-up pós-teleconsulta',
};

export async function notifyTeleconsultation(
  event: TeleNotifyEvent,
  ctx: {
    companyId: string;
    patientId: string;
    sessionId: string;
    phone?: string | null;
    patientName: string;
    link: string;
    startAt: Date;
    userId?: string | null;
  },
): Promise<{ sent: boolean; configured: boolean }> {
  const message = buildMessage(event, ctx);
  let result = { configured: false, ok: false } as { configured: boolean; ok: boolean };
  if (ctx.phone) {
    result = await sendWhatsappForCompany(ctx.companyId, ctx.phone, message);
  }

  // Registra na timeline do paciente (sempre — mesmo se o WhatsApp não enviou).
  try {
    await prisma.timelineEvent.create({
      data: {
        title: EVENT_TITLE[event],
        content: result.ok ? message : `${message}\n\n(WhatsApp não configurado — registrado para envio.)`,
        type: 'WHATSAPP',
        patientId: ctx.patientId,
        userId: ctx.userId || null,
      },
    });
  } catch (e) {
    console.error('[tele/notify] falha ao registrar timeline:', e);
  }

  return { sent: result.ok, configured: result.configured };
}
