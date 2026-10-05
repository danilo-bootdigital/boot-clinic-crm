import { NextRequest, NextResponse } from 'next/server';
import { contractByToken } from '@/lib/contracts/public';
import { clinicalSignedUrl } from '@/lib/storage/clinical-storage';

// GET /api/public/contracts/[token]/pdf — cópia do contrato assinado para o
// paciente, enquanto o link estiver na validade.
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const c = await contractByToken(params.token);
    if (!c || c.status !== 'SIGNED' || !c.signedPdfPath) {
      return NextResponse.json({ error: 'Cópia indisponível.' }, { status: 404 });
    }
    const url = await clinicalSignedUrl(c.signedPdfPath, 300);
    if (!url) return NextResponse.json({ error: 'Armazenamento indisponível' }, { status: 503 });
    return NextResponse.redirect(url);
  } catch (err) {
    console.error('Erro ao baixar cópia do contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
