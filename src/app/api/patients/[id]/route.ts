import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@prisma/client';
import { requirePermission } from '@/lib/api/permissions';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';
import { writeAudit } from '@/lib/api/audit';

// Schema de atualização. CPF é IMUTÁVEL (não incluído — protegido conforme regra
// do sistema: nem aparece aqui, então qualquer cpf no payload é ignorado pelo zod).
// Não inclui id/companyId/createdById/relacionamentos — só campos demográficos/contato.
const UpdatePatientInputSchema = z.object({
  name: z.string().min(2).optional(),
  // Data de nascimento: precisa ser uma data válida (string inválida → 400, não 500).
  birthDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Data de nascimento inválida').optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional().nullable(),
  // E-mail validado igual ao create (aceita vazio/nulo p/ limpar).
  email: z.string().email('E-mail inválido').optional().or(z.literal('')).nullable(),
  origin: z.enum(['GOOGLE', 'FACEBOOK', 'INSTAGRAM', 'REFERRAL', 'WALK_IN', 'PHONE', 'WHATSAPP', 'OTHER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  insurance: z.string().optional().nullable(),
  insuranceNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Campos auditáveis (escalares editáveis). Usado p/ montar o diff old→new.
const AUDITABLE_FIELDS = [
  'name', 'birthDate', 'gender', 'phone', 'whatsapp', 'email', 'origin',
  'status', 'address', 'city', 'state', 'zipCode', 'insurance', 'insuranceNumber', 'notes',
] as const;

// Normaliza p/ comparação (Date → ISO) e detecta o que realmente mudou.
function diffPatient(before: Record<string, any>, after: Record<string, any>, keys: readonly string[]) {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const k of keys) {
    const b = before[k] instanceof Date ? before[k].toISOString() : before[k] ?? null;
    const a = after[k] instanceof Date ? after[k].toISOString() : after[k] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) { oldValues[k] = b; newValues[k] = a; }
  }
  return { oldValues, newValues, changed: Object.keys(newValues).length > 0 };
}

// Resolve o usuário do banco a partir da sessão Supabase e devolve o escopo de empresa.
async function resolveDbUser() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { error: NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 }) };

  const blocked = await subscriptionBlock(dbUser);
  if (blocked) return { error: blocked };

  const moduleOff = await requireModuleEnabled(dbUser, 'patients');
  if (moduleOff) return { error: moduleOff };

  return { dbUser };
}

// GET /api/patients/[id] - Visualizar um paciente
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'patients', 'view');
    if (denied) return denied;

    const patient = await prisma.patient.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      include: {
        tags: true,
        createdBy: { select: { name: true } },
        timeline: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });

    if (!patient) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 });

    return NextResponse.json(patient);
  } catch (err) {
    console.error('Erro ao buscar paciente:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT/PATCH /api/patients/[id] - Editar um paciente
async function updateHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

    const forbidden = requirePermission(dbUser!, 'patients', 'edit');
    if (forbidden) return forbidden;

    // Garante que o paciente pertence à empresa do usuário.
    const existing = await prisma.patient.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 });

    const body = await request.json();
    const data = UpdatePatientInputSchema.parse(body);

    const patient = await prisma.patient.update({
      where: { id: params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.birthDate !== undefined && { birthDate: new Date(data.birthDate) }),
        ...(data.gender !== undefined && { gender: data.gender }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp || null }),
        ...(data.email !== undefined && { email: data.email || null }),
        ...(data.origin !== undefined && { origin: data.origin }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.address !== undefined && { address: data.address || null }),
        ...(data.city !== undefined && { city: data.city || null }),
        ...(data.state !== undefined && { state: data.state || null }),
        ...(data.zipCode !== undefined && { zipCode: data.zipCode || null }),
        ...(data.insurance !== undefined && { insurance: data.insurance || null }),
        ...(data.insuranceNumber !== undefined && { insuranceNumber: data.insuranceNumber || null }),
        ...(data.notes !== undefined && { notes: data.notes || null }),
      },
      include: {
        tags: true,
        createdBy: { select: { name: true } },
      },
    });

    // Diff completo do que mudou (todos os campos editáveis, não só name/status).
    const { oldValues, newValues, changed } = diffPatient(existing, patient, AUDITABLE_FIELDS);

    // Timeline + auditoria só quando houve alteração real (evita ruído de "salvar sem mudar").
    if (changed) {
      const fieldsLabel = Object.keys(newValues).join(', ');
      await prisma.timelineEvent.create({
        data: {
          patientId: patient.id,
          type: 'STATUS_CHANGE',
          title: 'Paciente atualizado',
          content: `Dados de ${patient.name} atualizados por ${dbUser!.name} (${fieldsLabel})`,
          userId: dbUser!.id,
        },
      });

      await writeAudit({
        dbUser: dbUser!, action: 'UPDATE', entityType: 'PATIENT', entityId: patient.id,
        oldValues, newValues, request,
      });
    }

    return NextResponse.json(patient);
  } catch (err) {
    console.error('Erro ao atualizar paciente:', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export const PUT = updateHandler;
export const PATCH = updateHandler;

// DELETE /api/patients/[id] - Inativar (soft delete) um paciente
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

    const forbidden = requirePermission(dbUser!, 'patients', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.patient.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 });

    // Soft delete: marca deletedAt e arquiva o status.
    const patient = await prisma.patient.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });

    await prisma.timelineEvent.create({
      data: {
        patientId: patient.id,
        type: 'STATUS_CHANGE',
        title: 'Paciente inativado',
        content: `Paciente ${patient.name} foi inativado por ${dbUser!.name}`,
        userId: dbUser!.id,
      },
    });

    await writeAudit({
      dbUser: dbUser!, action: 'ARCHIVE', entityType: 'PATIENT', entityId: patient.id,
      oldValues: { status: existing.status }, newValues: { status: 'ARCHIVED' }, request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao inativar paciente:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
