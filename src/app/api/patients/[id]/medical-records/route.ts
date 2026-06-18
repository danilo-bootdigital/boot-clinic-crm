import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveClinicalPatientAccess } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { CreateMedicalRecordSchema } from '@/lib/validations/clinical';

// GET /api/patients/[id]/medical-records - registros de prontuário do paciente.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { patient, error } = await resolveClinicalPatientAccess(params.id, 'prontuario', 'view');
    if (error) return error;
    const rows = await prisma.medicalRecord.findMany({
      where: { patientId: patient!.id, deletedAt: null },
      include: { attachments: true },
      orderBy: { createdAt: 'desc' },
    });
    // Enriquecer com nome do autor e do profissional.
    const userIds = Array.from(new Set(rows.map((r) => r.createdById)));
    const profIds = Array.from(new Set(rows.map((r) => r.professionalId).filter(Boolean) as string[]));
    const [users, profs] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      profIds.length ? prisma.professional.findMany({ where: { id: { in: profIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u.name]));
    const pMap = new Map(profs.map((p) => [p.id, p.name]));
    return NextResponse.json(rows.map((r) => ({
      ...r,
      createdByName: uMap.get(r.createdById) ?? null,
      professionalName: r.professionalId ? pMap.get(r.professionalId) ?? null : null,
    })));
  } catch (err) {
    console.error('Erro ao listar prontuário:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/patients/[id]/medical-records - cria registro de evolução/observação/histórico.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, patient, error } = await resolveClinicalPatientAccess(params.id, 'prontuario', 'edit');
    if (error) return error;
    const d = CreateMedicalRecordSchema.parse(await request.json());

    if (d.professionalId) {
      const prof = await prisma.professional.findFirst({ where: { id: d.professionalId, companyId: dbUser!.companyId } });
      if (!prof) return NextResponse.json({ error: 'Profissional inválido' }, { status: 400 });
    }

    const record = await prisma.medicalRecord.create({
      data: {
        companyId: dbUser!.companyId,
        patientId: patient!.id,
        type: d.type,
        title: d.title,
        content: d.content,
        professionalId: d.professionalId || null,
        createdById: dbUser!.id,
      },
    });

    await writeAudit({
      dbUser: dbUser!, action: 'CREATE', entityType: 'MEDICAL_RECORD', entityId: record.id,
      newValues: { patientId: patient!.id, type: record.type, title: record.title }, request,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar registro de prontuário:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
