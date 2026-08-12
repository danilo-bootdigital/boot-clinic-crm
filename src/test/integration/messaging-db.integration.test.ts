import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Channel, MessageSource } from '@prisma/client';

// Integração REAL contra PostgreSQL local (container descartável). Valida o que o
// mock NÃO garante: constraints, FK/cascade, @updatedAt e isolamento por companyId.
// Requer: `npm run db:migrate:local` aplicado + LOCAL_DATABASE_URL no .env.
// Rodar via `npm run test:integration` (carrega .env).

const url = process.env.LOCAL_DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: url || 'postgresql://invalid' } } });

const A = `itA_${Date.now()}`;
const B = `itB_${Date.now()}`;
let reachable = false;

beforeAll(async () => {
  if (!url) return;
  try { await prisma.$queryRaw`SELECT 1`; reachable = true; } catch { reachable = false; }
});

afterAll(async () => {
  if (reachable) {
    await prisma.messageAttachment.deleteMany({ where: { companyId: { in: [A, B] } } });
    await prisma.message.deleteMany({ where: { companyId: { in: [A, B] } } });
    await prisma.conversation.deleteMany({ where: { companyId: { in: [A, B] } } });
  }
  await prisma.$disconnect();
});

async function makeMessage(companyId: string, content = 'oi') {
  // Contato é entidade própria: a conversa aponta para ele (não guarda telefone).
  const contact = await prisma.contact.create({
    data: { companyId, name: 'Zé', phone: '5511999998888' },
  });
  await prisma.contactIdentity.create({
    data: { companyId, contactId: contact.id, channel: Channel.WHATSAPP, externalId: '5511999998888' },
  });
  const conv = await prisma.conversation.create({
    data: { companyId, channel: Channel.WHATSAPP, contactId: contact.id },
  });
  // channel + source são obrigatórios: é a etiqueta de procedência (§4.3).
  return prisma.message.create({
    data: {
      companyId,
      conversationId: conv.id,
      channel: Channel.WHATSAPP,
      source: MessageSource.CONTACT,
      content,
      direction: 'INCOMING',
      status: 'RECEIVED',
      messageType: 'IMAGE',
    },
  });
}

describe('integração PostgreSQL — mensageria (mídia + procedência)', () => {
  it('DB acessível (senão o suite é pulado com aviso)', () => {
    if (!reachable) console.warn('⚠️  Postgres local indisponível — testes de integração PULADOS. Suba o container + db:migrate:local.');
    expect(true).toBe(true);
  });

  it('cria mensagem + anexo e relaciona', async () => {
    if (!reachable) return;
    const msg = await makeMessage(A);
    const att = await prisma.messageAttachment.create({ data: { companyId: A, messageId: msg.id, storagePath: `${A}/c/m/uuid-x.jpg`, mimeType: 'image/jpeg', sizeBytes: 123 } });
    const withAtt = await prisma.message.findUnique({ where: { id: msg.id }, include: { attachments: true } });
    expect(withAtt?.attachments).toHaveLength(1);
    expect(withAtt?.attachments[0].id).toBe(att.id);
  });

  it('FK impede anexo órfão (messageId inexistente → erro)', async () => {
    if (!reachable) return;
    await expect(
      prisma.messageAttachment.create({ data: { companyId: A, messageId: 'nao-existe-xyz', storagePath: `${A}/x`, mimeType: 'image/png' } }),
    ).rejects.toThrow();
  });

  it('onDelete cascade: apagar mensagem apaga o anexo', async () => {
    if (!reachable) return;
    const msg = await makeMessage(A);
    await prisma.messageAttachment.create({ data: { companyId: A, messageId: msg.id, storagePath: `${A}/c/m/uuid-y.pdf`, mimeType: 'application/pdf' } });
    await prisma.message.delete({ where: { id: msg.id } });
    const remaining = await prisma.messageAttachment.count({ where: { messageId: msg.id } });
    expect(remaining).toBe(0);
  });

  it('@updatedAt muda ao atualizar a mensagem', async () => {
    if (!reachable) return;
    const msg = await makeMessage(A);
    const before = msg.updatedAt;
    await new Promise((r) => setTimeout(r, 15));
    const upd = await prisma.message.update({ where: { id: msg.id }, data: { status: 'DELIVERED' } });
    expect(upd.updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it('isolamento por companyId nas queries', async () => {
    if (!reachable) return;
    await makeMessage(A, 'da A');
    await makeMessage(B, 'da B');
    const onlyA = await prisma.message.findMany({ where: { companyId: A } });
    expect(onlyA.every((m) => m.companyId === A)).toBe(true);
    expect(onlyA.some((m) => m.content === 'da B')).toBe(false);
  });

  it('soft delete de anexo (deletedAt) preserva a linha', async () => {
    if (!reachable) return;
    const msg = await makeMessage(A);
    const att = await prisma.messageAttachment.create({ data: { companyId: A, messageId: msg.id, storagePath: `${A}/c/m/uuid-z.jpg`, mimeType: 'image/jpeg' } });
    await prisma.messageAttachment.update({ where: { id: att.id }, data: { deletedAt: new Date() } });
    const row = await prisma.messageAttachment.findUnique({ where: { id: att.id } });
    expect(row?.deletedAt).toBeTruthy();
  });
});
