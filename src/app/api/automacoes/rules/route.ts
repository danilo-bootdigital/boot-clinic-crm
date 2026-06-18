import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { EVENT_ENTITY } from '@/lib/automations/engine';

const CreateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  event: z.enum(['PATIENT_CREATED', 'DEAL_WON', 'APPOINTMENT_CREATED']),
  actions: z.array(z.object({
    actionType: z.enum(['CREATE_FOLLOW_UP', 'SEND_NOTIFICATION']),
    config: z.record(z.any()).optional(),
  })).min(1, 'Adicione ao menos uma ação'),
});

// GET /api/automacoes/rules - lista regras com gatilho e ações.
export async function GET() {
  try {
    const { dbUser, error } = await resolveModuleUser('automacoes');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'automacoes', 'view');
    if (denied) return denied;
    const companyId = dbUser!.companyId;

    const rules = await prisma.automationRule.findMany({
      where: { companyId, deletedAt: null }, orderBy: { createdAt: 'desc' },
    });
    const ids = rules.map((r) => r.id);
    const [triggers, actions] = await Promise.all([
      prisma.automationTrigger.findMany({ where: { ruleId: { in: ids }, companyId } }),
      prisma.automationAction.findMany({ where: { ruleId: { in: ids }, companyId }, orderBy: { order: 'asc' } }),
    ]);
    const out = rules.map((r) => ({
      id: r.id, name: r.name, isActive: r.isActive,
      event: triggers.find((t) => t.ruleId === r.id)?.event ?? null,
      actions: actions.filter((a) => a.ruleId === r.id).map((a) => ({ actionType: a.actionType, config: safe(a.config) })),
    }));
    return NextResponse.json(out);
  } catch (err) {
    console.error('Erro ao listar automações:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

function safe(s: string) { try { return JSON.parse(s || '{}'); } catch { return {}; } }

// POST /api/automacoes/rules - cria regra (gatilho + ações).
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('automacoes');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'automacoes', 'edit');
    if (forbidden) return forbidden;
    const companyId = dbUser!.companyId;

    const d = CreateSchema.parse(await request.json());
    const rule = await prisma.automationRule.create({ data: { name: d.name, companyId } });
    await prisma.automationTrigger.create({
      data: { ruleId: rule.id, entityType: EVENT_ENTITY[d.event], event: d.event, companyId },
    });
    await prisma.automationAction.createMany({
      data: d.actions.map((a, i) => ({ ruleId: rule.id, actionType: a.actionType as any, config: JSON.stringify(a.config ?? {}), order: i + 1, companyId })),
    });
    return NextResponse.json({ id: rule.id }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar automação:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
