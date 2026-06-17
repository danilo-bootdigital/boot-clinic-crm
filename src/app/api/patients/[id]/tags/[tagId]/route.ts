import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolvePatientAccess } from '@/lib/api/patient-access';
import { writeAudit } from '@/lib/api/audit';

// DELETE /api/patients/[id]/tags/[tagId] - remove a tag do paciente (desvincula).
export async function DELETE(request: NextRequest, { params }: { params: { id: string; tagId: string } }) {
  try {
    const { dbUser, patient, error } = await resolvePatientAccess(params.id, 'edit');
    if (error) return error;

    const link = await prisma.patientTag.findFirst({
      where: { patientId: patient!.id, tagId: params.tagId },
      include: { tag: true },
    });
    if (!link) return NextResponse.json({ error: 'Tag não vinculada a este paciente' }, { status: 404 });

    await prisma.patientTag.delete({ where: { id: link.id } });

    await writeAudit({
      dbUser: dbUser!, action: 'REMOVE_TAG', entityType: 'PATIENT', entityId: patient!.id,
      oldValues: { tag: link.tag.name }, request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao remover tag:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
