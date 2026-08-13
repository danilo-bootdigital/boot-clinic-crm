import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

// DELETE /api/specialties/[id] - soft delete
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'agenda', 'edit');
    if (forbidden) return forbidden;

    const item = await prisma.specialty.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!item) return NextResponse.json({ error: 'Especialidade não encontrada' }, { status: 404 });

    // Trava de uso: sem ela, apagar uma especialidade deixava agendamentos
    // apontando para um registro excluído (specialtyId é obrigatório em
    // Appointment) e médicos vinculados a algo que não existe mais na lista.
    const [medicos, agendamentos] = await Promise.all([
      prisma.professionalSpecialty.count({ where: { specialtyId: item.id, companyId: dbUser!.companyId } }),
      prisma.appointment.count({ where: { specialtyId: item.id, companyId: dbUser!.companyId, deletedAt: null } }),
    ]);

    if (medicos > 0 || agendamentos > 0) {
      const partes = [
        medicos > 0 ? `${medicos} ${medicos === 1 ? 'médico(a)' : 'médicos(as)'}` : null,
        agendamentos > 0 ? `${agendamentos} ${agendamentos === 1 ? 'agendamento' : 'agendamentos'}` : null,
      ].filter(Boolean);
      return NextResponse.json(
        {
          error: `"${item.name}" está em uso por ${partes.join(' e ')}. Desvincule antes de excluir.`,
          emUso: { medicos, agendamentos },
        },
        { status: 409 }
      );
    }

    await prisma.specialty.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir especialidade:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
