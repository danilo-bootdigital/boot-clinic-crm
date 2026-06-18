import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveClinicalPatientAccess } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { uploadClinicalFile, clinicalSignedUrl, isClinicalStorageConfigured } from '@/lib/storage/clinical-storage';
import { DOCUMENT_CATEGORIES } from '@/lib/validations/clinical';

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

// GET /api/patients/[id]/documents - documentos clínicos do paciente (com URL assinada).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { patient, error } = await resolveClinicalPatientAccess(params.id, 'imagens', 'view');
    if (error) return error;
    const rows = await prisma.patientDocument.findMany({
      where: { patientId: patient!.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const data = await Promise.all(rows.map(async (doc) => ({
      id: doc.id, title: doc.title, category: doc.category, originalName: doc.originalName,
      mimeType: doc.mimeType, size: doc.size, createdAt: doc.createdAt,
      url: await clinicalSignedUrl(doc.url),
    })));
    return NextResponse.json(data);
  } catch (err) {
    console.error('Erro ao listar documentos:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/patients/[id]/documents - upload (multipart: file, title?, category?).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, patient, error } = await resolveClinicalPatientAccess(params.id, 'imagens', 'edit');
    if (error) return error;
    if (!isClinicalStorageConfigured())
      return NextResponse.json({ error: 'Upload indisponível: configure SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 });

    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string')
      return NextResponse.json({ error: 'Arquivo não enviado (campo "file").' }, { status: 400 });
    const blob = file as File;
    if (blob.size === 0) return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });
    if (blob.size > MAX_SIZE) return NextResponse.json({ error: 'Arquivo excede o limite de 20 MB.' }, { status: 400 });

    const categoryRaw = String(form.get('category') || 'OTHER');
    const category = (DOCUMENT_CATEGORIES as readonly string[]).includes(categoryRaw) ? categoryRaw : 'OTHER';
    const title = (form.get('title') as string) || blob.name || 'Documento';

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { path } = await uploadClinicalFile({
      companyId: dbUser!.companyId, patientId: patient!.id, kind: 'documents',
      fileName: blob.name || 'documento', contentType: blob.type || 'application/octet-stream', bytes,
    });

    const doc = await prisma.patientDocument.create({
      data: {
        companyId: dbUser!.companyId, patientId: patient!.id,
        category: category as any, title, originalName: blob.name || 'documento',
        url: path, mimeType: blob.type || 'application/octet-stream', size: blob.size,
        uploadedBy: dbUser!.id,
      },
    });

    await writeAudit({
      dbUser: dbUser!, action: 'UPLOAD_ATTACHMENT', entityType: 'PATIENT_DOCUMENT', entityId: doc.id,
      newValues: { patientId: patient!.id, title: doc.title, category: doc.category }, request,
    });

    return NextResponse.json(
      { id: doc.id, title: doc.title, category: doc.category, size: doc.size, url: await clinicalSignedUrl(path) },
      { status: 201 },
    );
  } catch (err: any) {
    console.error('Erro ao enviar documento:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
