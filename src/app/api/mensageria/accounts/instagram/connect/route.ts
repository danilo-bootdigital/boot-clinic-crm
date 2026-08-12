import { NextRequest, NextResponse } from 'next/server';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { authorizeUrl, isInstagramConfigured } from '@/lib/messaging/adapters/instagram/graph';
import { isSecretBoxConfigured } from '@/lib/crypto/secret-box';
import { callbackUrl, signState } from '@/lib/messaging/adapters/instagram/oauth';

// GET /api/mensageria/accounts/instagram/connect
//
// Início do OAuth: devolve a URL da Meta para a clínica autorizar. O usuário
// digita a senha DELE no site da Meta — o CRM nunca vê credencial, só recebe
// no callback um token com escopo limitado, revogável a qualquer momento.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    if (!isInstagramConfigured()) {
      return NextResponse.json(
        { error: 'Integração com a Meta não configurada (META_APP_ID / META_APP_SECRET).' },
        { status: 503 }
      );
    }
    // Fail-closed: sem a chave de cifra não há como guardar o token com
    // segurança, então nem começamos o fluxo.
    if (!isSecretBoxConfigured()) {
      return NextResponse.json(
        { error: 'MESSAGING_SECRET_KEY ausente: não é possível guardar a credencial do canal com segurança.' },
        { status: 503 }
      );
    }

    const origin = new URL(request.url).origin;
    const url = authorizeUrl(callbackUrl(origin), signState(dbUser!.companyId, dbUser!.id));
    return NextResponse.json({ url });
  } catch (err) {
    console.error('Erro ao iniciar conexão do Instagram:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
