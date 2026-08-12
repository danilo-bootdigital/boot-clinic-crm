import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';
import {
  isSignatureStorageConfigured,
  removeSignature,
  signatureSignedUrl,
  uploadSignature,
  validateSignatureFile,
} from '@/lib/storage/signature-storage';

// Assinatura digitalizada do profissional.
//
// GET    → URL assinada de curta duração para exibir a imagem
// POST   → anexa/substitui (multipart: file)
// DELETE → remove
//
// A imagem fica em bucket PRIVADO e o banco guarda só o caminho. Nunca
// devolvemos o caminho para o cliente: só a URL assinada, que expira.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function loadProfessional(id: string, companyId: string) {
  return prisma.professional.findFirst({ where: { id, companyId, deletedAt: null } });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'agenda', 'view');
    if (denied) return denied;

    const professional = await loadProfessional(params.id, dbUser!.companyId);
    if (!professional) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 });
    if (!professional.signaturePath) return NextResponse.json({ url: null });

    const url = await signatureSignedUrl(professional.signaturePath);
    return NextResponse.json({ url });
  } catch (err) {
    console.error('Erro ao gerar URL da assinatura:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'agenda', 'edit');
    if (denied) return denied;

    if (!isSignatureStorageConfigured()) {
      return NextResponse.json(
        { error: 'Storage indisponível: configure SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 503 }
      );
    }

    const professional = await loadProfessional(params.id, dbUser!.companyId);
    if (!professional) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 });

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Envie a imagem da assinatura', field: 'file' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateSignatureFile({
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: bytes.length,
    });
    if (!check.ok) return NextResponse.json({ error: check.error, field: 'file' }, { status: 400 });

    const up = await uploadSignature({
      companyId: dbUser!.companyId,
      professionalId: professional.id,
      ext: check.ext,
      contentType: (file.type || '').split(';')[0].trim().toLowerCase(),
      bytes,
    });

    const anterior = professional.signaturePath;
    const updated = await prisma.professional.update({
      where: { id: professional.id },
      data: { signaturePath: up.path },
    });

    // Só apaga a antiga DEPOIS de gravar a nova: se a remoção falhar sobra um
    // arquivo órfão (ruim), mas se apagássemos antes e o update falhasse o
    // profissional ficaria sem assinatura nenhuma (pior).
    if (anterior && anterior !== up.path) await removeSignature(anterior);

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.UPLOAD_ATTACHMENT,
      entityType: EntityType.PROFESSIONAL,
      entityId: professional.id,
      newValues: { assinatura: 'anexada', substituiu: Boolean(anterior) },
      request,
    });

    const url = await signatureSignedUrl(updated.signaturePath!);
    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    console.error('Erro ao anexar assinatura:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'agenda', 'edit');
    if (denied) return denied;

    const professional = await loadProfessional(params.id, dbUser!.companyId);
    if (!professional) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 });
    if (!professional.signaturePath) return NextResponse.json({ url: null });

    await prisma.professional.update({
      where: { id: professional.id },
      data: { signaturePath: null },
    });
    await removeSignature(professional.signaturePath);

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.DELETE,
      entityType: EntityType.PROFESSIONAL,
      entityId: professional.id,
      oldValues: { assinatura: 'presente' },
      newValues: { assinatura: 'removida' },
      request,
    });

    return NextResponse.json({ url: null });
  } catch (err) {
    console.error('Erro ao remover assinatura:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
