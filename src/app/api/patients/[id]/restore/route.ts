import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth/server';
import { requirePermission } from '@/lib/api/permissions';
import { subscriptionBlock } from '@/lib/api/session';
import { writeAudit } from '@/lib/api/audit';

// POST /api/patients/[id]/restore - restaura um paciente inativado (soft delete).
// Reativa (deletedAt=null, status=ACTIVE). Bloqueia se já existir paciente ATIVO
// com o mesmo CPF na empresa (evita duplicidade ao restaurar).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    const blocked = await subscriptionBlock(dbUser);
    if (blocked) return blocked;
    const forbidden = requirePermission(dbUser, 'patients', 'edit');
    if (forbidden) return forbidden;

    // Só pacientes arquivados (deletedAt != null) da própria empresa.
    const archived = await prisma.patient.findFirst({
      where: { id: params.id, companyId: dbUser.companyId, deletedAt: { not: null } },
    });
    if (!archived) return NextResponse.json({ error: 'Paciente arquivado não encontrado' }, { status: 404 });

    // Conflito: já existe ativo com o mesmo CPF nesta empresa?
    const conflict = await prisma.patient.findFirst({
      where: { cpf: archived.cpf, companyId: dbUser.companyId, deletedAt: null },
    });
    if (conflict) {
      return NextResponse.json(
        { error: 'Já existe um paciente ativo com este CPF. Não é possível restaurar.' },
        { status: 400 }
      );
    }

    const patient = await prisma.patient.update({
      where: { id: params.id },
      data: { deletedAt: null, status: 'ACTIVE' },
    });

    await prisma.timelineEvent.create({
      data: {
        patientId: patient.id,
        type: 'STATUS_CHANGE',
        title: 'Paciente restaurado',
        content: `Paciente ${patient.name} foi restaurado por ${dbUser.name}`,
        userId: dbUser.id,
      },
    });

    await writeAudit({
      dbUser, action: 'RESTORE', entityType: 'PATIENT', entityId: patient.id,
      oldValues: { status: 'ARCHIVED' }, newValues: { status: 'ACTIVE' }, request,
    });

    return NextResponse.json(patient);
  } catch (err) {
    // Corrida: outro request reativou/criou o mesmo CPF entre a checagem e o
    // update → violação do unique (companyId, cpf). Responde 400, não 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe um paciente ativo com este CPF. Não é possível restaurar.' }, { status: 400 });
    }
    console.error('Erro ao restaurar paciente:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
