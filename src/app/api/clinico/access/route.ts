import { NextResponse } from 'next/server';
import { resolveDbUser } from '@/lib/api/session';
import { CLINICAL_AREAS, clinicalAreaLevel } from '@/lib/api/clinical-access';

// GET /api/clinico/access - níveis efetivos do usuário por área clínica.
// Usado pelo frontend para gatear abas/botões (a API ainda valida no servidor).
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const out: Record<string, string> = {};
    for (const a of CLINICAL_AREAS) out[a] = clinicalAreaLevel(dbUser!, a);
    return NextResponse.json(out);
  } catch (err) {
    console.error('Erro ao resolver acesso clínico:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
