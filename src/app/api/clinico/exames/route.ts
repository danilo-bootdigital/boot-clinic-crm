import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ExamRequestOrigin } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { ownsPatient } from '@/lib/api/ownership';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';

// GET  /api/clinico/exames?patientId=  — pedidos do paciente (mais recentes 1º)
// POST /api/clinico/exames             — emite um pedido
//
// O pedido é DOCUMENTO: grava snapshot do nome/CRM do profissional e do
// nome/nascimento do paciente, e o nome de cada exame. Correção posterior no
// cadastro não reescreve o que já foi entregue ao paciente.

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  patientId: z.string().min(1),
  professionalId: z.string().min(1),
  // Ids do catálogo. A validação de posse é feita no servidor.
  itemIds: z.array(z.string().min(1)).default([]),
  // Exames digitados à mão: o que não está no catálogo. Entram na mesma lista
  // do documento, sob um grupo próprio, para o médico não ficar preso ao painel.
  freeItems: z.array(z.string().trim().min(1).max(180)).default([]),
  // Opcional: pedido em branco não tem indicação, só a lista digitada.
  clinicalIndication: z.string().trim().max(2000).optional(),
  observations: z.string().max(4000).optional(),
  origin: z.nativeEnum(ExamRequestOrigin).default(ExamRequestOrigin.PATIENT_CHART),
  teleconsultationId: z.string().optional(),
}).refine((d) => d.itemIds.length > 0 || d.freeItems.length > 0, {
  message: 'Selecione ao menos um exame',
  path: ['itemIds'],
});

// Grupo dos exames digitados fora do catálogo.
const GRUPO_LIVRE = 'Outros exames';

export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('clinico');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'clinico', 'view');
    if (denied) return denied;

    const patientId = request.nextUrl.searchParams.get('patientId');
    const where = {
      companyId: dbUser!.companyId,
      deletedAt: null,
      ...(patientId ? { patientId } : {}),
    };

    const pedidos = await prisma.examRequest.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: 100,
      include: { items: { select: { id: true } } },
    });

    return NextResponse.json(
      pedidos.map((p) => ({
        id: p.id,
        patientId: p.patientId,
        patientName: p.patientNameSnapshot,
        professionalName: p.professionalNameSnapshot,
        professionalCrm: p.professionalCrmSnapshot,
        clinicalIndication: p.clinicalIndication,
        origin: p.origin,
        issuedAt: p.issuedAt,
        totalExames: p.items.length,
      }))
    );
  } catch (err) {
    console.error('Erro ao listar pedidos de exame:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('clinico');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'clinico', 'edit');
    if (denied) return denied;

    const d = CreateSchema.parse(await request.json());

    // Paciente tem que ser da clínica.
    if (!(await ownsPatient(dbUser!.companyId, d.patientId))) {
      return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 });
    }
    const patient = await prisma.patient.findFirst({
      where: { id: d.patientId, companyId: dbUser!.companyId, deletedAt: null },
      select: { name: true, birthDate: true },
    });
    if (!patient) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 });

    // Profissional tem que ser da clínica e estar ativo.
    const professional = await prisma.professional.findFirst({
      where: { id: d.professionalId, companyId: dbUser!.companyId, deletedAt: null },
      select: { id: true, name: true, crm: true, isActive: true },
    });
    if (!professional) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 });
    if (!professional.isActive) {
      return NextResponse.json({ error: 'Profissional inativo' }, { status: 400 });
    }
    // CRM é o que dá validade ao pedido: sem ele o documento sai inútil, então
    // bloqueia aqui em vez de emitir um papel com o campo em branco.
    if (!professional.crm?.trim()) {
      return NextResponse.json(
        { error: `${professional.name} está sem CRM no cadastro. Informe o CRM antes de emitir o pedido.` },
        { status: 409 }
      );
    }

    // Itens: só os do catálogo DESTA clínica, na ordem do catálogo.
    const doCatalogo = d.itemIds.length
      ? await prisma.examCatalogItem.findMany({
          where: { id: { in: d.itemIds }, companyId: dbUser!.companyId, deletedAt: null },
          orderBy: { order: 'asc' },
          select: { name: true, group: true, subgroup: true },
        })
      : [];

    // Digitados: normaliza e remove duplicata contra o que já veio do catálogo.
    const jaSelecionados = new Set(doCatalogo.map((i) => i.name.toLowerCase()));
    const livres = Array.from(
      new Map(
        d.freeItems
          .map((nome) => nome.trim())
          .filter((nome) => nome && !jaSelecionados.has(nome.toLowerCase()))
          .map((nome) => [nome.toLowerCase(), nome])
      ).values()
    ).map((name) => ({ name, group: GRUPO_LIVRE, subgroup: null as string | null }));

    const itens = [...doCatalogo, ...livres];
    if (itens.length === 0) {
      return NextResponse.json({ error: 'Nenhum exame válido selecionado' }, { status: 400 });
    }

    const pedido = await prisma.examRequest.create({
      data: {
        companyId: dbUser!.companyId,
        patientId: d.patientId,
        professionalId: professional.id,
        // Snapshot — ver comentário no topo.
        professionalNameSnapshot: professional.name,
        professionalCrmSnapshot: professional.crm.trim(),
        patientNameSnapshot: patient.name,
        patientBirthDateSnapshot: patient.birthDate,
        clinicalIndication: d.clinicalIndication?.trim() || null,
        observations: d.observations?.trim() || null,
        origin: d.origin,
        teleconsultationId: d.teleconsultationId || null,
        createdByUserId: dbUser!.id,
        items: {
          create: itens.map((item, i) => ({
            name: item.name,
            group: item.group,
            subgroup: item.subgroup,
            order: i,
          })),
        },
      },
      select: { id: true, issuedAt: true },
    });

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.CREATE,
      entityType: EntityType.EXAM_REQUEST,
      entityId: pedido.id,
      newValues: {
        patientId: d.patientId,
        profissional: professional.name,
        crm: professional.crm.trim(),
        exames: itens.length,
        origem: d.origin,
      },
      request,
    });

    return NextResponse.json({ id: pedido.id, issuedAt: pedido.issuedAt }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao emitir pedido de exame:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
