import { waConfig, waConfigPatch } from '@/lib/messaging/adapters/whatsapp/account';
import { NextResponse } from 'next/server';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { getPrimaryInstance, findChats, findContacts, findMessages, isEvolutionConfigured } from '@/lib/messaging/adapters/whatsapp/evolution';
import { Channel, MessageSource } from '@prisma/client';
import { upsertConversationThread, ingestMessage, upsertContactProfile } from '@/lib/messaging/ingest';
import { extractText, jidToExternalId, jidToPhone, classifyMessage } from '@/lib/messaging/adapters/whatsapp/classify';

// Import síncrono é LIMITADO para caber no tempo do serverless. Re-rodar importa mais.
const CHAT_LIMIT = 120;

// POST /api/mensageria/accounts/sync — importa histórico (chats + página recente de
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
    if (!isEvolutionConfigured() || !waConfig(instance).evolutionInstanceId) {
      return NextResponse.json({ error: 'Evolution não configurada' }, { status: 400 });
    }
    if (instance.status !== 'CONNECTED') {
      return NextResponse.json({ error: 'Instância não conectada', status: instance.status }, { status: 409 });
    }

    // 0) Contatos → nomes. Vem ANTES dos chats de propósito: assim a thread já
    // nasce com o nome certo em vez de ficar com o número até alguém escrever.
    // É a fonte em LOTE do pushName (o nome que a própria pessoa pôs no perfil).
    const contactsRes = await findContacts(instance);
    const rawContacts: any[] = Array.isArray(contactsRes.data)
      ? contactsRes.data
      : (contactsRes.data as any)?.contacts || [];
    let contactsNamed = 0;
    for (const c of rawContacts) {
      const jid = c?.remoteJid || c?.id;
      const externalId = jidToExternalId(jid);
      if (!externalId || String(jid || '').includes('@g.us')) continue;
      const nome = c?.pushName || c?.name || c?.notify || c?.verifiedName;
      if (!nome) continue;
      await upsertContactProfile({
        companyId: dbUser!.companyId,
        channel: Channel.WHATSAPP,
        externalId,
        name: nome,
        avatarUrl: c?.profilePicUrl || c?.profilePictureUrl || null,
      });
      contactsNamed++;
    }

    // 1) Chats → conversas (threads). Bounded por CHAT_LIMIT (mais recentes primeiro).
    const chatsRes = await findChats(instance);
    const allChats: any[] = Array.isArray(chatsRes.data) ? chatsRes.data : (chatsRes.data as any)?.chats || [];
    const chats = allChats
      .filter((c) => !String(c?.remoteJid || c?.id || '').includes('@g.us')) // grupos fora por ora
      .sort((a, b) => new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime())
      .slice(0, CHAT_LIMIT);

    let chatsCreated = 0;
    for (const c of chats) {
      const jid = c?.remoteJid || c?.id;
      const externalId = jidToExternalId(jid);
      if (!externalId) continue;
      const phone = jidToPhone(jid);
      const lm = c?.lastMessage;
      const lmText = extractText(lm?.message);
      const lmAt = lm?.messageTimestamp ? new Date(Number(lm.messageTimestamp) * 1000) : (c?.updatedAt ? new Date(c.updatedAt) : null);
      const r = await upsertConversationThread({
        companyId: dbUser!.companyId,
        channel: Channel.WHATSAPP,
        accountId: instance.id,
        // `name` do chat é o nome do contato; `pushName` num registro de chat
        // pode ser o do dono do número — por isso não é usado aqui.
        contact: { externalId, name: c?.pushName || c?.name, avatarUrl: c?.profilePicUrl, phone },
        nameIsFromContact: true,
        lastMessage: lmText ?? null,
        lastMessageAt: lmText ? lmAt : null,
      });
      if (r === 'created') chatsCreated++;
    }

    // 2) Página recente de mensagens (global) → ingestão deduplicada (isHistory).
    const msgRes = await findMessages(instance);
    const records: any[] = (msgRes.data as any)?.messages?.records || (Array.isArray(msgRes.data) ? (msgRes.data as any) : []);
    let msgCreated = 0, msgDup = 0;
    for (const rec of records) {
      const externalId = jidToExternalId(rec?.key?.remoteJid);
      if (!externalId || String(rec?.key?.remoteJid || '').includes('@g.us')) continue;
      const phone = jidToPhone(rec?.key?.remoteJid);
      const text = extractText(rec?.message);
      const ts = rec?.messageTimestamp ? new Date(Number(rec.messageTimestamp) * 1000) : undefined;
      const fromMe = rec?.key?.fromMe === true;
      const r = await ingestMessage({
        companyId: dbUser!.companyId,
        // Etiqueta de procedência (§4.3): histórico do próprio número da clínica.
        // fromMe=true veio do celular, fora do CRM — não da tela.
        provenance: {
          channel: Channel.WHATSAPP,
          accountId: instance.id,
          source: fromMe ? MessageSource.MOBILE : MessageSource.CONTACT,
        },
        contact: { externalId, name: rec?.pushName, phone },
        text,
        messageKind: classifyMessage(rec?.message),
        externalId: rec?.key?.id ?? null,
        createdAt: ts,
        isHistory: true,
      });
      if (r === 'created' || r === 'placeholder') msgCreated++; else if (r === 'duplicate') msgDup++;
    }

    return NextResponse.json({
      ok: true,
      contacts: { total: rawContacts.length, named: contactsNamed },
      chats: { total: allChats.length, imported: chats.length, created: chatsCreated, truncated: allChats.length > CHAT_LIMIT },
      messages: { page: records.length, created: msgCreated, duplicate: msgDup },
      note: 'Importação limitada por execução (chats recentes + página recente de mensagens). Re-execute para importar mais; o histórico profundo por conversa é paginado.',
    });
  } catch (err) {
    console.error('Erro no sync WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
