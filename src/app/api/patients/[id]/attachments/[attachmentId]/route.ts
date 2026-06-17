import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolvePatientAccess } from '@/lib/api/patient-access';
import { writeAudit } from '@/lib/api/audit';
import { removeAttachment } from '@/lib/storage/supabase-storage';

// DELETE /api/patients/[id]/attachments/[attachmentId] - remove o anexo (storage + banco).
export async function DELETE(request: NextRequest, { params }: { params: { id: string; attachmentId: string } }) {
  try {
    const { dbUser, patient, error } = await resolvePatientAccess(params.id, 'edit');
    if (error) return error;

    const att = await prisma.patientAttachment.findFirst({
      where: { id: params.attachmentId, patientId: patient!.id },
    });
    if (!att) return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 });

    await removeAttachment(att.url); // url guarda o path no storage
    await prisma.patientAttachment.delete({ where: { id: att.id } });

    await writeAudit({
      dbUser: dbUser!, action: 'DELETE_ATTACHMENT', entityType: 'PATIENT', entityId: patient!.id,
      oldValues: { file: att.originalName }, request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao remover anexo:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
