import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveClinicalPatientAccess } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { uploadClinicalFile, clinicalSignedUrl, isClinicalStorageConfigured } from '@/lib/storage/clinical-storage';
import { IMAGE_CATEGORIES } from '@/lib/validations/clinical';

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

// GET /api/patients/[id]/images - imagens clínicas do paciente (com URL assinada).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { patient, error } = await resolveClinicalPatientAccess(params.id, 'imagens', 'view');
    if (error) return error;
    const rows = await prisma.patientImage.findMany({
      where: { patientId: patient!.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const data = await Promise.all(rows.map(async (img) => ({
      id: img.id, category: img.category, description: img.description,
      mimeType: img.mimeType, size: img.size, takenAt: img.takenAt, createdAt: img.createdAt,
      url: await clinicalSignedUrl(img.url),
    })));
    return NextResponse.json(data);
  } catch (err) {
    console.error('Erro ao listar imagens:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/patients/[id]/images - upload (multipart: file, category?, description?).
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
    if (blob.size > MAX_SIZE) return NextResponse.json({ error: 'Arquivo excede o limite de 15 MB.' }, { status: 400 });

    const categoryRaw = String(form.get('category') || 'OTHER');
    const category = (IMAGE_CATEGORIES as readonly string[]).includes(categoryRaw) ? categoryRaw : 'OTHER';
    const description = (form.get('description') as string) || null;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { path } = await uploadClinicalFile({
      companyId: dbUser!.companyId, patientId: patient!.id, kind: 'images',
      fileName: blob.name || 'imagem', contentType: blob.type || 'application/octet-stream', bytes,
    });

    const img = await prisma.patientImage.create({
      data: {
        companyId: dbUser!.companyId, patientId: patient!.id,
        category: category as any, description,
        url: path, mimeType: blob.type || 'application/octet-stream', size: blob.size,
        uploadedBy: dbUser!.id,
      },
    });

    await writeAudit({
      dbUser: dbUser!, action: 'UPLOAD_ATTACHMENT', entityType: 'PATIENT_IMAGE', entityId: img.id,
      newValues: { patientId: patient!.id, category: img.category, size: img.size }, request,
    });

    return NextResponse.json(
      { id: img.id, category: img.category, description: img.description, size: img.size, url: await clinicalSignedUrl(path) },
      { status: 201 },
    );
  } catch (err: any) {
    console.error('Erro ao enviar imagem:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
