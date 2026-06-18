import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { resolveTelemedicineSession } from '@/lib/api/telemedicine';

const Schema = z.object({
  body: z.string().min(1, 'Mensagem vazia').max(4000),
});

// GET /api/telemedicine/sessions/[id]/chat
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await resolveTelemedicineSession(params.id, 'view');
  if (error) return error;
  const messages = await prisma.telemedicineChat.findMany({
    where: { sessionId: session!.id }, orderBy: { createdAt: 'asc' }, take: 500,
  });
  return NextResponse.json(messages);
}

// POST /api/telemedicine/sessions/[id]/chat — mensagem do staff/médico na sala.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, session, error } = await resolveTelemedicineSession(params.id, 'join_room');
    if (error) return error;
    const data = Schema.parse(await request.json());
    const msg = await prisma.telemedicineChat.create({
      data: {
        companyId: dbUser!.companyId, sessionId: session!.id, patientId: session!.patientId,
        senderRole: 'DOCTOR', senderName: dbUser!.name, senderUserId: dbUser!.id, body: data.body,
      },
    });
    return NextResponse.json(msg, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro no chat:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
