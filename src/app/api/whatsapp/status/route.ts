import { NextResponse } from 'next/server';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { isEvolutionConfigured } from '@/lib/whatsapp/evolution';

// GET /api/whatsapp/status - indica se a Evolution API está configurada.
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;
    return NextResponse.json({ configured: isEvolutionConfigured() });
  } catch (err) {
    console.error('Erro no status do WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
