import { NextResponse } from 'next/server';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { getPrimaryInstance, findChats, findMessages, isEvolutionConfigured } from '@/lib/whatsapp/evolution';
import { upsertChatThread, ingestMessage, extractText, jidToPhone, classifyMessage } from '@/lib/whatsapp/ingest';

// Import síncrono é LIMITADO para caber no tempo do serverless. Re-rodar importa mais.
const CHAT_LIMIT = 120;

// POST /api/whatsapp/instance/sync — importa histórico (chats + página recente de
// mensagens) da instância primária da clínica logada, via Evolution findChats/findMessages.
// Tudo escopado por companyId/instanceId; deduplicado por externalId; sem apagar nada.
export async function POST() {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    const instance = await getPrimaryInstance(dbUser!.companyId);
    if (!instance) return NextResponse.json({ error: 'Sem instância' }, { status: 404 });
    if (!isEvolutionConfigured() || !instance.evolutionInstanceId) {
      return NextResponse.json({ error: 'Evolution não configurada' }, { status: 400 });
    }
    if (instance.status !== 'CONNECTED') {
      return NextResponse.json({ error: 'Instância não conectada', status: instance.status }, { status: 409 });
    }

    // 1) Chats → conversas (threads). Bounded por CHAT_LIMIT (mais recentes primeiro).
    const chatsRes = await findChats({ instanceName: instance.instanceName });
    const allChats: any[] = Array.isArray(chatsRes.data) ? chatsRes.data : (chatsRes.data as any)?.chats || [];
    const chats = allChats
      .filter((c) => !String(c?.remoteJid || c?.id || '').includes('@g.us')) // grupos fora por ora
      .sort((a, b) => new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime())
      .slice(0, CHAT_LIMIT);

    let chatsCreated = 0;
    for (const c of chats) {
      const phone = jidToPhone(c?.remoteJid || c?.id);
      if (!phone) continue;
      const lm = c?.lastMessage;
      const lmText = extractText(lm?.message);
      const lmAt = lm?.messageTimestamp ? new Date(Number(lm.messageTimestamp) * 1000) : (c?.updatedAt ? new Date(c.updatedAt) : null);
      const r = await upsertChatThread({
        companyId: dbUser!.companyId,
        instanceId: instance.id,
        phone,
        name: c?.pushName,
        avatar: c?.profilePicUrl,
        lastMessage: lmText ?? null,
        lastMessageAt: lmText ? lmAt : null,
      });
      if (r === 'created') chatsCreated++;
    }

    // 2) Página recente de mensagens (global) → ingestão deduplicada (isHistory).
    const msgRes = await findMessages({ instanceName: instance.instanceName });
    const records: any[] = (msgRes.data as any)?.messages?.records || (Array.isArray(msgRes.data) ? (msgRes.data as any) : []);
    let msgCreated = 0, msgDup = 0;
    for (const rec of records) {
      const phone = jidToPhone(rec?.key?.remoteJid);
      if (!phone || String(rec?.key?.remoteJid || '').includes('@g.us')) continue;
      const text = extractText(rec?.message);
      const ts = rec?.messageTimestamp ? new Date(Number(rec.messageTimestamp) * 1000) : undefined;
      const r = await ingestMessage({
        companyId: dbUser!.companyId,
        instanceId: instance.id,
        phone,
        name: rec?.pushName,
        text,
        messageType: classifyMessage(rec?.message),
        externalId: rec?.key?.id ?? null,
        fromMe: rec?.key?.fromMe === true,
        createdAt: ts,
        isHistory: true,
      });
      if (r === 'created' || r === 'placeholder') msgCreated++; else if (r === 'duplicate') msgDup++;
    }

    return NextResponse.json({
      ok: true,
      chats: { total: allChats.length, imported: chats.length, created: chatsCreated, truncated: allChats.length > CHAT_LIMIT },
      messages: { page: records.length, created: msgCreated, duplicate: msgDup },
      note: 'Importação limitada por execução (chats recentes + página recente de mensagens). Re-execute para importar mais; o histórico profundo por conversa é paginado.',
    });
  } catch (err) {
    console.error('Erro no sync WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
