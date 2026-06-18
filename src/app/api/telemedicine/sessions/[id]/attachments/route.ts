import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveTelemedicineSession, teleEvent } from '@/lib/api/telemedicine';
import { uploadClinicalFile, clinicalSignedUrl, isClinicalStorageConfigured } from '@/lib/storage/clinical-storage';
import { writeAudit } from '@/lib/api/audit';

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
const CATEGORIES = ['EXAM', 'REPORT', 'CLINICAL_PHOTO', 'DOCUMENT', 'CONTRACT', 'OTHER'] as const;
const PHASES = ['BEFORE', 'DURING', 'AFTER'] as const;

// GET — anexos da teleconsulta com URL assinada.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await resolveTelemedicineSession(params.id, 'view');
  if (error) return error;
  const rows = await prisma.telemedicineAttachment.findMany({
    where: { sessionId: session!.id, deletedAt: null }, orderBy: { createdAt: 'desc' },
  });
  const data = await Promise.all(rows.map(async (a) => ({
    id: a.id, title: a.title, category: a.category, phase: a.phase, mimeType: a.mimeType,
    size: a.size, createdAt: a.createdAt, url: await clinicalSignedUrl(a.url),
  })));
  return NextResponse.json(data);
}

// POST — upload de anexo (multipart: file, category?, phase?, title?). Vinculado à
// sessão E ao paciente. Disponível antes/durante/depois da consulta.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, session, error } = await resolveTelemedicineSession(params.id, 'join_room');
    if (error) return error;
    if (!isClinicalStorageConfigured())
      return NextResponse.json({ error: 'Upload indisponível: configure SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 });

    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string')
      return NextResponse.json({ error: 'Arquivo não enviado (campo "file").' }, { status: 400 });
    const blob = file as File;
    if (blob.size === 0) return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });
    if (blob.size > MAX_SIZE) return NextResponse.json({ error: 'Arquivo excede o limite de 15 MB.' }, { status: 400 });

    const categoryRaw = String(form.get('category') || 'OTHER');
    const category = (CATEGORIES as readonly string[]).includes(categoryRaw) ? categoryRaw : 'OTHER';
    const phaseRaw = String(form.get('phase') || 'DURING');
    const phase = (PHASES as readonly string[]).includes(phaseRaw) ? phaseRaw : 'DURING';
    const title = (form.get('title') as string) || blob.name || 'Anexo';

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { path } = await uploadClinicalFile({
      companyId: dbUser!.companyId, patientId: session!.patientId, kind: 'documents',
      fileName: blob.name || 'anexo', contentType: blob.type || 'application/octet-stream', bytes,
    });

    const att = await prisma.telemedicineAttachment.create({
      data: {
        companyId: dbUser!.companyId, sessionId: session!.id, patientId: session!.patientId,
        category: category as any, phase: phase as any, title,
        originalName: blob.name || 'anexo', url: path,
        mimeType: blob.type || 'application/octet-stream', size: blob.size, uploadedBy: dbUser!.id,
      },
    });

    await teleEvent(session!.id, dbUser!.companyId, 'ATTACHMENT_ADDED', { actorId: dbUser!.id, actorName: dbUser!.name, metadata: { attachmentId: att.id, phase } });
    await writeAudit({
      dbUser: dbUser!, action: 'UPLOAD_ATTACHMENT', entityType: 'TELEMEDICINE_ATTACHMENT', entityId: att.id,
      newValues: { sessionId: session!.id, category, phase, size: att.size }, request,
    });

    return NextResponse.json({ id: att.id, title: att.title, category: att.category, phase: att.phase, size: att.size, url: await clinicalSignedUrl(path) }, { status: 201 });
  } catch (err: any) {
    console.error('Erro no upload de anexo (telemedicina):', err);
    return NextResponse.json({ error: err?.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
