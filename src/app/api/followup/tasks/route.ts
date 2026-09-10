import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { ownsPatient, ownsDeal, ownsConversation, ownsAppointment, ownsUser } from '@/lib/api/ownership';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';
import { canViewAllTasks } from '@/lib/followup/access';
import { parseDueDate, brTodayStart, brTomorrowStart, brWeekStart, brWeekEnd } from '@/lib/followup/dates';

const OPEN_STATUS = { in: ['PENDING', 'IN_PROGRESS'] as const };

const CreateSchema = z
  .object({
    title: z.string().min(1, 'Título é obrigatório'),
    description: z.string().optional(),
    dueDate: z.string().min(1, 'Prazo é obrigatório'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    category: z.string().max(40).optional().or(z.literal('')),
    type: z.enum(['FOLLOW_UP', 'REMINDER', 'ALERT', 'TASK']).optional(),
    assignedToId: z.string().min(1, 'Responsável é obrigatório'),
    patientId: z.string().optional().or(z.literal('')),
    dealId: z.string().optional().or(z.literal('')),
    appointmentId: z.string().optional().or(z.literal('')),
    conversationId: z.string().optional().or(z.literal('')),
    isRecurring: z.boolean().optional(),
    recurrenceType: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
    recurrenceEvery: z.number().int().min(1).max(365).optional(),
  })
  .refine((d) => !d.isRecurring || !!d.recurrenceType, {
    message: 'Selecione a frequência da recorrência',
    path: ['recurrenceType'],
  });

// GET /api/followup/tasks?filter=&search=&conversationId=&page=&pageSize=
//
// Visibilidade: SUPER_ADMIN/OWNER/MANAGER veem a clínica toda; os demais só
// veem tarefas que criaram ou das quais são responsáveis ("minhas tarefas" é
// o universo, não apenas um filtro, para quem não é gestão) — a identidade
// vem da sessão, nunca de um parâmetro do cliente. Exceção: quando filtra por
// `conversationId` (drawer da mensageria), mostra todas as tarefas daquela
// conversa independente de papel — é uma visão operacional compartilhada do
// atendimento, não uma lista pessoal.
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('followup');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'followup', 'view');
    if (denied) return denied;

    const params = request.nextUrl.searchParams;
    const conversationId = params.get('conversationId');
    const search = params.get('search')?.trim() || '';
    const filter = params.get('filter') || 'all';
    const page = Math.max(1, Number(params.get('page')) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.get('pageSize')) || 20));

    const companyScope = { companyId: dbUser!.companyId, deletedAt: null };
    const mineClause = { OR: [{ assignedToId: dbUser!.id }, { createdById: dbUser!.id }] };
    const admin = canViewAllTasks(dbUser!.role);

    const scopeClauses: any[] = [companyScope];
    if (conversationId) scopeClauses.push({ conversationId });
    else if (!admin) scopeClauses.push(mineClause);

    const now = new Date();
    const todayStart = brTodayStart(now);
    const tomorrowStart = brTomorrowStart(now);
    const weekStart = brWeekStart(now);
    const weekEnd = brWeekEnd(now);

    const FILTER_CLAUSES: Record<string, any> = {
      all: {},
      mine: mineClause,
      today: { status: OPEN_STATUS, dueDate: { gte: todayStart, lt: tomorrowStart } },
      week: { status: OPEN_STATUS, dueDate: { gte: weekStart, lt: weekEnd } },
      overdue: { status: OPEN_STATUS, dueDate: { lt: todayStart } },
      completed: { status: 'COMPLETED' },
      // Sem chip próprio — usado pelo widget "Pendências da semana" do
      // Dashboard: todas as tarefas abertas, ordenadas por prazo (atrasada
      // primeiro), sem cortar em uma janela de data fixa.
      open: { status: OPEN_STATUS },
    };
    const activeFilterClause = FILTER_CLAUSES[filter] ?? {};

    let searchClause: any = {};
    if (search) {
      const patients = await prisma.patient.findMany({
        where: { companyId: dbUser!.companyId, deletedAt: null, name: { contains: search, mode: 'insensitive' } },
        select: { id: true },
      });
      const patientIds = patients.map((p) => p.id);
      searchClause = {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          ...(patientIds.length ? [{ patientId: { in: patientIds } }] : []),
        ],
      };
    }

    const where: any = { AND: [...scopeClauses, activeFilterClause, ...(search ? [searchClause] : [])] };

    const paginate = !conversationId;
    const [total, tasks] = await Promise.all([
      prisma.followUpTask.count({ where }),
      prisma.followUpTask.findMany({
        where,
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        ...(paginate ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      }),
    ]);

    // Contadores dos chips de filtro rápido — computados junto (mesma
    // requisição), não uma chamada por filtro. Cada contagem usa os índices
    // (companyId,status,dueDate) / (companyId,assignedToId,status,dueDate).
    let counts: Record<string, number> | undefined;
    if (!conversationId) {
      const [all, mine, today, week, overdue, completed, open] = await Promise.all([
        prisma.followUpTask.count({ where: { AND: [...scopeClauses] } }),
        prisma.followUpTask.count({ where: { AND: [companyScope, mineClause] } }),
        prisma.followUpTask.count({ where: { AND: [...scopeClauses, FILTER_CLAUSES.today] } }),
        prisma.followUpTask.count({ where: { AND: [...scopeClauses, FILTER_CLAUSES.week] } }),
        prisma.followUpTask.count({ where: { AND: [...scopeClauses, FILTER_CLAUSES.overdue] } }),
        prisma.followUpTask.count({ where: { AND: [...scopeClauses, FILTER_CLAUSES.completed] } }),
        prisma.followUpTask.count({ where: { AND: [...scopeClauses, FILTER_CLAUSES.open] } }),
      ]);
      counts = { all, mine, today, week, overdue, completed, open };
    }

    // Enriquece com paciente + nomes de responsável/criador/quem concluiu —
    // sempre por lote (sem N+1 por tarefa).
    const patientIds = Array.from(new Set(tasks.map((t) => t.patientId).filter(Boolean) as string[]));
    const userIds = Array.from(
      new Set(
        tasks.flatMap((t) => [t.assignedToId, t.createdById, t.completedById]).filter(Boolean) as string[]
      )
    );
    const [patients, users] = await Promise.all([
      patientIds.length
        ? prisma.patient.findMany({ where: { id: { in: patientIds }, companyId: dbUser!.companyId }, select: { id: true, name: true } })
        : Promise.resolve([] as { id: string; name: string }[]),
      userIds.length
        ? prisma.user.findMany({ where: { id: { in: userIds }, companyId: dbUser!.companyId }, select: { id: true, name: true } })
        : Promise.resolve([] as { id: string; name: string }[]),
    ]);
    const pm = new Map(patients.map((p) => [p.id, p]));
    const um = new Map(users.map((u) => [u.id, u]));

    const enriched = tasks.map((t) => ({
      ...t,
      patient: t.patientId ? pm.get(t.patientId) ?? null : null,
      assignedTo: t.assignedToId ? um.get(t.assignedToId) ?? null : null,
      createdBy: um.get(t.createdById) ?? null,
      completedBy: t.completedById ? um.get(t.completedById) ?? null : null,
    }));

    return NextResponse.json({ tasks: enriched, total, page, pageSize, counts });
  } catch (err) {
    console.error('Erro ao listar tarefas:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/followup/tasks
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('followup');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'followup', 'edit');
    if (forbidden) return forbidden;

    const d = CreateSchema.parse(await request.json());

    // Paciente/deal/agendamento/conversa/responsável vinculados precisam
    // pertencer à empresa (nunca confiar em FK vinda do cliente).
    const [validPatient, validDeal, validAppointment, validConversation, validAssignee] = await Promise.all([
      ownsPatient(dbUser!.companyId, d.patientId || null),
      ownsDeal(dbUser!.companyId, d.dealId || null),
      ownsAppointment(dbUser!.companyId, d.appointmentId || null),
      ownsConversation(dbUser!.companyId, d.conversationId || null),
      ownsUser(dbUser!.companyId, d.assignedToId),
    ]);
    if (!validAssignee) return NextResponse.json({ error: 'Responsável inválido' }, { status: 400 });
    if (!validPatient || !validDeal || !validAppointment || !validConversation) {
      return NextResponse.json({ error: 'Paciente, oportunidade, agendamento ou conversa inválidos' }, { status: 400 });
    }

    const task = await prisma.followUpTask.create({
      data: {
        title: d.title,
        description: d.description || null,
        dueDate: parseDueDate(d.dueDate),
        status: 'PENDING',
        priority: d.priority || 'MEDIUM',
        category: (d.category || '').trim() || null,
        type: d.type || (d.conversationId ? 'FOLLOW_UP' : 'TASK'),
        assignedToId: d.assignedToId,
        patientId: d.patientId || null,
        dealId: d.dealId || null,
        appointmentId: d.appointmentId || null,
        conversationId: d.conversationId || null,
        isRecurring: d.isRecurring || false,
        recurrenceType: d.isRecurring ? d.recurrenceType : null,
        recurrenceEvery: d.isRecurring ? d.recurrenceEvery || 1 : null,
        createdById: dbUser!.id,
        companyId: dbUser!.companyId,
      },
    });

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.CREATE,
      entityType: EntityType.FOLLOW_UP_TASK,
      entityId: task.id,
      newValues: { title: task.title, assignedToId: task.assignedToId, dueDate: task.dueDate },
      request,
    });

    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar tarefa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
