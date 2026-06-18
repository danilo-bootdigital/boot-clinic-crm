import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { resolveTelemedicineSession, teleEvent } from '@/lib/api/telemedicine';
import { hasClinicalArea } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';

const Schema = z.object({
  type: z.enum(['EVOLUTION', 'OBSERVATION', 'HISTORY', 'PROCEDURE']).optional(),
  title: z.string().min(1, 'Título obrigatório').max(200),
  content: z.string().min(1, 'Conteúdo obrigatório'),
});

// POST /api/telemedicine/sessions/[id]/record — registra a evolução clínica DA
// teleconsulta no Prontuário (vínculo teleconsultationId + appointmentId). Exige
// poder atender (médico) E acesso de edição à área 'prontuario'.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, session, error } = await resolveTelemedicineSession(params.id, 'attend');
    if (error) return error;
    if (!hasClinicalArea(dbUser!, 'prontuario', 'edit')) {
      return NextResponse.json({ error: 'Sem permissão para editar prontuário' }, { status: 403 });
    }
    const d = Schema.parse(await request.json());

    const record = await prisma.medicalRecord.create({
      data: {
        companyId: dbUser!.companyId,
        patientId: session!.patientId,
        type: (d.type as any) || 'EVOLUTION',
        title: d.title,
        content: d.content,
        professionalId: session!.professionalId,
        appointmentId: session!.appointmentId,
        teleconsultationId: session!.id,
        createdById: dbUser!.id,
      },
    });

    // Liga o registro à sessão (atalho p/ exibição).
    await prisma.telemedicineSession.update({
      where: { id: session!.id }, data: { medicalRecordId: record.id },
    }).catch(() => {});

    await teleEvent(session!.id, dbUser!.companyId, 'RECORD_CREATED', { actorId: dbUser!.id, actorName: dbUser!.name, metadata: { recordId: record.id } });
    await writeAudit({
      dbUser: dbUser!, action: 'CREATE', entityType: 'MEDICAL_RECORD', entityId: record.id,
      newValues: { patientId: session!.patientId, teleconsultationId: session!.id, title: record.title }, request,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao registrar prontuário (telemedicina):', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
