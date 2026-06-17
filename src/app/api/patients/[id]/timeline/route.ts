import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolvePatientAccess } from '@/lib/api/patient-access';

// GET /api/patients/[id]/timeline - eventos da timeline do paciente (mais recentes).
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { patient, error } = await resolvePatientAccess(params.id, 'view');
    if (error) return error;

    const events = await prisma.timelineEvent.findMany({
      where: { patientId: patient!.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { name: true } } },
    });
    return NextResponse.json(events);
  } catch (err) {
    console.error('Erro ao listar timeline:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

const NoteSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  type: z.enum(['NOTE', 'PHONE_CALL', 'EMAIL', 'WHATSAPP', 'DOCUMENT']).optional(),
});

// POST /api/patients/[id]/timeline - adiciona um evento manual (anotação) à timeline.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, patient, error } = await resolvePatientAccess(params.id, 'edit');
    if (error) return error;

    const d = NoteSchema.parse(await request.json());
    const event = await prisma.timelineEvent.create({
      data: {
        patientId: patient!.id,
        type: d.type || 'NOTE',
        title: d.title || 'Anotação',
        content: d.content,
        userId: dbUser!.id,
      },
      include: { user: { select: { name: true } } },
    });
    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar evento de timeline:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
