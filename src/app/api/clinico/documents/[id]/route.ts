import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { removeClinicalFile } from '@/lib/storage/clinical-storage';

// DELETE /api/clinico/documents/[id] - remove documento (soft delete + remove do storage).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('imagens', 'edit');
    if (error) return error;
    const existing = await prisma.patientDocument.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });

    await prisma.patientDocument.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    await removeClinicalFile(existing.url);
    await writeAudit({
      dbUser: dbUser!, action: 'DELETE_ATTACHMENT', entityType: 'PATIENT_DOCUMENT', entityId: params.id, request,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao remover documento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
