import { NextRequest, NextResponse } from 'next/server';
import { resolveFinanceUser, requireFinanceCap } from '@/lib/api/financial-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { billAppointment, serializeReceivable, FinancialError } from '@/lib/api/financial-service';
import { BillAppointmentSchema } from '@/lib/validations/financial';
import { writeAudit } from '@/lib/api/audit';
import { prisma } from '@/lib/db/prisma';
import { ReceivableStatus } from '@prisma/client';

// Situação financeira de UM atendimento (Agenda → Financeiro).
//
// Escopo multiempresa em duas camadas, como no resto do módulo: o Appointment é
// buscado com companyId do usuário (1ª camada) e os recebíveis passam por
// withFinanceTenant, que fixa `app.company_id` e aciona a RLS (2ª camada).
// Um atendimento de outra clínica devolve 404, nunca dados.

async function loadAppointment(id: string, companyId: string) {
  return prisma.appointment.findFirst({
    where: { id, companyId, deletedAt: null },
    select: { id: true, patientId: true, professionalId: true, specialtyId: true, type: true, status: true, startAt: true },
  });
}

// GET /api/agenda/appointments/[id]/billing — cobranças + totais do atendimento.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveFinanceUser('view');
    if (error) return error;
    const companyId = dbUser!.companyId;

    const appointment = await loadAppointment(params.id, companyId);
    if (!appointment) return NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 });

    const rows = await withFinanceTenant(companyId, (tx) =>
      tx.receivable.findMany({
        where: { companyId, appointmentId: appointment.id, deletedAt: null },
        include: { installments: { orderBy: { number: 'asc' }, include: { payments: { orderBy: { paidAt: 'asc' } } } } },
        orderBy: { createdAt: 'asc' },
      }),
    );

    const now = new Date();
    const receivables = rows.map((r) => serializeReceivable(r, now));
    // Cancelados ficam de fora dos totais (mesma regra do resumo financeiro).
    const ativos = receivables.filter((r) => r.status !== ReceivableStatus.CANCELADO);

    return NextResponse.json({
      appointmentId: appointment.id,
      billable: appointment.status === 'ATTENDED',
      receivables,
      // "faturado" ≠ "recebido": a separação vale também neste resumo.
      totals: {
        faturado: Number(ativos.reduce((s, r) => s + r.finalAmount, 0).toFixed(2)),
        recebido: Number(ativos.reduce((s, r) => s + r.paidAmount, 0).toFixed(2)),
        emAberto: Number(ativos.reduce((s, r) => s + r.balance, 0).toFixed(2)),
        count: ativos.length,
      },
    });
  } catch (err) {
    console.error('Erro ao consultar cobranças do atendimento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/agenda/appointments/[id]/billing — "Faturar atendimento" e, com
// `payment` no corpo, "Faturar e receber" (cobrança + baixa na mesma transação).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveFinanceUser('create');
    if (error) return error;
    const companyId = dbUser!.companyId;

    const parsed = BillAppointmentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    // Registrar a baixa é outra capacidade: quem só pode faturar não recebe.
    if (parsed.data.payment) {
      const denied = requireFinanceCap(dbUser!, 'settle');
      if (denied) return denied;
    }

    const appointment = await loadAppointment(params.id, companyId);
    if (!appointment) return NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 });

    const { receivable, payment } = await withFinanceTenant(companyId, (tx) =>
      billAppointment(tx, companyId, dbUser!.id, appointment, parsed.data),
    );

    await writeAudit({
      dbUser: dbUser!,
      action: 'CREATE',
      entityType: 'RECEIVABLE',
      entityId: receivable.id,
      newValues: {
        id: receivable.id,
        sourceType: 'APPOINTMENT',
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        finalAmount: receivable.finalAmount,
        additional: parsed.data.allowDuplicate,
      },
      request,
    });
    if (payment) {
      await writeAudit({
        dbUser: dbUser!,
        action: 'SETTLE',
        entityType: 'INSTALLMENT_PAYMENT',
        entityId: payment.id,
        newValues: { receivableId: receivable.id, amount: payment.amount, method: payment.method },
        request,
      });
    }

    return NextResponse.json(
      { receivable: serializeReceivable(receivable), paymentId: payment?.id ?? null },
      { status: 201 },
    );
  } catch (err: any) {
    if (err instanceof FinancialError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Erro ao faturar atendimento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
