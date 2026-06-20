import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { uploadCompanyLogo, removeCompanyLogoByUrl, isStorageConfigured } from '@/lib/storage/company-logo-storage';

// Logo da clínica: sempre escopado pela empresa do usuário autenticado (dbUser.companyId).
// Nunca recebe companyId do cliente — impossível trocar o logo de outra clínica.

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

// POST /api/company/logo - envia/substitui o logotipo da clínica (multipart: campo "file")
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'configuracoes', 'edit');
    if (forbidden) return forbidden;

    if (!isStorageConfigured()) {
      return NextResponse.json({ error: 'Armazenamento de imagens não configurado.' }, { status: 503 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: 'Formato inválido. Use PNG, JPG ou WEBP.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Arquivo muito grande. Máximo 2MB.' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { url } = await uploadCompanyLogo({
      companyId: dbUser!.companyId,
      fileName: file.name || 'logo',
      contentType: file.type,
      bytes,
    });

    // Apaga o arquivo anterior (best-effort) antes de salvar a nova URL.
    const prev = await prisma.company.findUnique({ where: { id: dbUser!.companyId }, select: { logo: true } });
    const company = await prisma.company.update({ where: { id: dbUser!.companyId }, data: { logo: url } });
    await removeCompanyLogoByUrl(prev?.logo, dbUser!.companyId);

    return NextResponse.json(company);
  } catch (err) {
    console.error('Erro ao enviar logo da empresa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE /api/company/logo - remove o logotipo da clínica
export async function DELETE() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'configuracoes', 'edit');
    if (forbidden) return forbidden;

    const prev = await prisma.company.findUnique({ where: { id: dbUser!.companyId }, select: { logo: true } });
    const company = await prisma.company.update({ where: { id: dbUser!.companyId }, data: { logo: null } });
    await removeCompanyLogoByUrl(prev?.logo, dbUser!.companyId);

    return NextResponse.json(company);
  } catch (err) {
    console.error('Erro ao remover logo da empresa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
