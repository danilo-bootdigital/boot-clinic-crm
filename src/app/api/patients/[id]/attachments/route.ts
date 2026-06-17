import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolvePatientAccess } from '@/lib/api/patient-access';
import { writeAudit } from '@/lib/api/audit';
import { uploadAttachment, signedUrl, isStorageConfigured } from '@/lib/storage/supabase-storage';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// GET /api/patients/[id]/attachments - anexos do paciente (com URL assinada).
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { patient, error } = await resolvePatientAccess(params.id, 'view');
    if (error) return error;

    const rows = await prisma.patientAttachment.findMany({
      where: { patientId: patient!.id },
      orderBy: { createdAt: 'desc' },
    });

    // Gera URL assinada para cada anexo (url guarda o path no storage).
    const data = await Promise.all(
      rows.map(async (a) => ({
        id: a.id,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: a.size,
        createdAt: a.createdAt,
        url: await signedUrl(a.url),
      }))
    );
    return NextResponse.json(data);
  } catch (err) {
    console.error('Erro ao listar anexos:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/patients/[id]/attachments - upload de anexo (multipart/form-data, campo "file").
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, patient, error } = await resolvePatientAccess(params.id, 'edit');
    if (error) return error;

    if (!isStorageConfigured()) {
      return NextResponse.json({ error: 'Upload indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor.' }, { status: 503 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Arquivo não enviado (campo "file").' }, { status: 400 });
    }
    const blob = file as File;
    if (blob.size === 0) {
      return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });
    }
    if (blob.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Arquivo excede o limite de 10 MB.' }, { status: 400 });
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { path } = await uploadAttachment({
      companyId: dbUser!.companyId,
      patientId: patient!.id,
      fileName: blob.name || 'arquivo',
      contentType: blob.type || 'application/octet-stream',
      bytes,
    });

    const attachment = await prisma.patientAttachment.create({
      data: {
        filename: path.split('/').pop() || path,
        originalName: blob.name || 'arquivo',
        mimeType: blob.type || 'application/octet-stream',
        size: blob.size,
        url: path, // guarda o path; a leitura gera signed URL
        patientId: patient!.id,
        uploadedBy: dbUser!.id,
      },
    });

    await writeAudit({
      dbUser: dbUser!, action: 'UPLOAD_ATTACHMENT', entityType: 'PATIENT', entityId: patient!.id,
      newValues: { file: attachment.originalName, size: attachment.size }, request,
    });

    return NextResponse.json(
      { id: attachment.id, originalName: attachment.originalName, size: attachment.size, url: await signedUrl(path) },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Erro ao enviar anexo:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
