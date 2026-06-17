import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { ownsPatient, ownsDeal } from '@/lib/api/ownership';

// Datas "YYYY-MM-DD" são interpretadas ao meio-dia LOCAL (evita que a meia-noite
// UTC caia no dia anterior em fusos negativos, jogando a tarefa para "atrasada").
function parseDueDate(s: string) {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s);
}

const CreateSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional(),
  dueDate: z.string().min(1, 'Vencimento é obrigatório'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  type: z.enum(['FOLLOW_UP', 'REMINDER', 'ALERT', 'TASK']).optional(),
  patientId: z.string().optional().or(z.literal('')),
  dealId: z.string().optional().or(z.literal('')),
});

// GET /api/followup/tasks?status= — lista (enriquecida com paciente)
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

    const denied = requirePermission(dbUser!, 'followup', 'view');
    if (denied) return denied;

    const where: any = { companyId: dbUser!.companyId, deletedAt: null };
    const status = request.nextUrl.searchParams.get('status');
    if (status) where.status = status;

    const tasks = await prisma.followUpTask.findMany({ where, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] });

    const patientIds = Array.from(new Set(tasks.map((t) => t.patientId).filter(Boolean) as string[]));
    const patients = patientIds.length
      ? await prisma.patient.findMany({ where: { id: { in: patientIds }, companyId: dbUser!.companyId }, select: { id: true, name: true } })
      : [];
    const pm = new Map(patients.map((p) => [p.id, p]));

    return NextResponse.json(tasks.map((t) => ({ ...t, patient: t.patientId ? pm.get(t.patientId) ?? null : null })));
  } catch (err) {
    console.error('Erro ao listar tarefas:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/followup/tasks
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'followup', 'edit');
    if (forbidden) return forbidden;

    const d = CreateSchema.parse(await request.json());

    // Paciente/deal vinculados precisam pertencer à empresa.
    if (!(await ownsPatient(dbUser!.companyId, d.patientId || null)) ||
        !(await ownsDeal(dbUser!.companyId, d.dealId || null))) {
      return NextResponse.json({ error: 'Paciente ou oportunidade inválidos' }, { status: 400 });
    }

    const task = await prisma.followUpTask.create({
      data: {
        title: d.title,
        description: d.description || null,
        dueDate: parseDueDate(d.dueDate),
        status: 'PENDING',
        priority: d.priority || 'MEDIUM',
        type: d.type || 'FOLLOW_UP',
        patientId: d.patientId || null,
        dealId: d.dealId || null,
        createdById: dbUser!.id,
        companyId: dbUser!.companyId,
      },
    });
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar tarefa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
