// Backfill: dá nome aos contatos "Sem nome · 1234" da mensageria.
//
// Contexto: na 1ª sincronização de uma clínica, o WhatsApp entrega boa parte
// dos contatos como `@lid` (identidade opaca, sem telefone) e ainda SEM nome —
// o pushName chega depois, num CONTACTS_UPSERT/CONTACTS_UPDATE. O webhook só
// assina CONTACTS_SET, então esse nome tardio nunca chegou ao CRM e o contato
// ficou com o rótulo de fallback "Sem nome · <4 últimos dígitos do lid>".
//
// A Evolution guardou o nome (findContacts → pushName) e, para mensagens
// recentes, o telefone (`key.remoteJidAlt`). Este script copia isso de volta.
//
// Regras (mesmas do resolveContact/enrichContact):
//  - só toca contatos com nameSource CHANNEL (nome digitado no CRM é soberano);
//  - só toca contatos cujo nome ainda é o fallback "Sem nome";
//  - pushName igual ao próprio lid ou só dígitos NÃO é nome;
//  - telefone só entra se o contato ainda não tem um;
//  - NÃO funde contatos: se o telefone já pertence a outro contato, apenas
//    reporta (fusão é ação manual — diretriz §4.4).
//
// SEGURO POR PADRÃO: dry-run. Para gravar, passe --apply.
//
//   node --env-file=.env scripts/backfill-lid-contact-names.mjs <companyId>
//   node --env-file=.env scripts/backfill-lid-contact-names.mjs <companyId> --apply

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const companyId = process.argv.slice(2).find((a) => !a.startsWith('--'));

const API = process.env.WHATSAPP_API_URL;
const KEY = process.env.WHATSAPP_API_KEY;

async function evo(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Evolution ${path} → HTTP ${res.status}`);
  return res.json();
}

const isPhoneJid = (jid) => typeof jid === 'string' && jid.endsWith('@s.whatsapp.net');

async function main() {
  if (!companyId) throw new Error('Informe o companyId.');
  if (!API || !KEY) throw new Error('WHATSAPP_API_URL / WHATSAPP_API_KEY ausentes.');
  console.log(APPLY ? '== MODO APLICAÇÃO (--apply) ==' : '== DRY-RUN (use --apply para gravar) ==');

  const account = await prisma.channelAccount.findFirst({
    where: { companyId, channel: 'WHATSAPP' },
    select: { providerConfig: true },
  });
  const instance = account?.providerConfig?.instanceName;
  if (!instance) throw new Error('Clínica sem instância WhatsApp.');

  const evoContacts = await evo(`/chat/findContacts/${instance}`, { where: {} });
  const byJid = new Map(evoContacts.map((c) => [c.remoteJid, c]));

  const contacts = await prisma.contact.findMany({
    where: { companyId, deletedAt: null, nameSource: 'CHANNEL', name: { startsWith: 'Sem nome' } },
    select: {
      id: true,
      name: true,
      phone: true,
      identities: { where: { channel: 'WHATSAPP' }, select: { id: true, externalId: true, avatarUrl: true } },
    },
  });

  let named = 0, phoned = 0, semDados = 0;
  const duplicados = [];
  for (const c of contacts) {
    const ident = c.identities[0];
    if (!ident) continue;
    const lid = ident.externalId;
    const evoContact = byJid.get(`${lid}@lid`);

    const push = evoContact?.pushName?.trim();
    const name = push && push !== lid && !/^\d+$/.test(push) ? push : undefined;

    // Telefone: só a Evolution afirma, via remoteJidAlt das mensagens do lid.
    let phone;
    if (!c.phone) {
      const msgs = await evo(`/chat/findMessages/${instance}`, { where: { key: { remoteJid: `${lid}@lid` } }, limit: 20 });
      const alt = (msgs?.messages?.records || []).map((m) => m.key?.remoteJidAlt).find(isPhoneJid);
      phone = alt?.split('@')[0];
    }

    if (!name && !phone) {
      semDados++;
      console.log(`  - ${c.name} (lid ${lid}): Evolution não tem nome nem telefone`);
      continue;
    }

    if (phone) {
      const other = await prisma.contact.findFirst({
        where: { companyId, deletedAt: null, phone: { endsWith: phone.slice(-8) }, NOT: { id: c.id } },
        select: { id: true, name: true },
      });
      if (other) duplicados.push(`${name ?? c.name} (${phone}) ↔ já existe "${other.name}" [${other.id}]`);
    }

    console.log(`  ✓ ${c.name} → ${name ?? '(mantém)'}${phone ? ` · tel ${phone}` : ''}`);
    if (name) named++;
    if (phone) phoned++;

    if (APPLY) {
      await prisma.contact.update({
        where: { id: c.id },
        data: { ...(name ? { name } : {}), ...(phone ? { phone } : {}) },
      });
      const avatar = evoContact?.profilePicUrl;
      if (avatar && !ident.avatarUrl) {
        await prisma.contactIdentity.update({ where: { id: ident.id }, data: { avatarUrl: avatar } });
      }
    }
  }

  console.log(`\nContatos "Sem nome": ${contacts.length} · com nome: ${named} · com telefone: ${phoned} · sem dados na Evolution: ${semDados}`);
  if (duplicados.length) {
    console.log('\nMesma pessoa já cadastrada com telefone (fusão manual):');
    for (const d of duplicados) console.log(`  • ${d}`);
  }
  if (!APPLY) console.log('\nNada foi gravado. Rode com --apply para aplicar.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
