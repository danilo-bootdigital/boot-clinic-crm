// Mock de Prisma em memória — cobre APENAS os caminhos usados pelo módulo WhatsApp
// (conversas, mensagens, instâncias, company, auditLog). Não é um emulador geral.
// Objetivo: exercitar dedup, isolamento por companyId e resolução de conversa de
// verdade nos testes, sem banco real. Sem rede, sem Supabase, sem Evolution.

type Rec = Record<string, any>;

let seq = 0;
const nextId = (p: string) => `${p}_${(++seq).toString(36)}`;

// Casa um registro contra um `where` simples: igualdade escalar, { contains },
// null explícito e o par (instanceId, externalId). Ignora chaves undefined.
function matches(rec: Rec, where: Rec): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    if (v === null) {
      if (rec[k] !== null && rec[k] !== undefined) return false;
    } else if (typeof v === 'object' && 'contains' in v) {
      if (typeof rec[k] !== 'string' || !rec[k].includes(v.contains)) return false;
    } else if (typeof v === 'object' && 'endsWith' in v) {
      if (typeof rec[k] !== 'string' || !rec[k].endsWith(v.endsWith)) return false;
    } else if (typeof v === 'object' && 'not' in v) {
      if (v.not === null ? rec[k] === null || rec[k] === undefined : rec[k] === v.not) return false;
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      // where aninhado não suportado aqui — trata como igualdade de referência
      if (rec[k] !== v) return false;
    } else if (rec[k] !== v) {
      return false;
    }
  }
  return true;
}

// Prisma expõe unique composta como UMA chave (companyId_channel_externalId).
// Achata para os campos reais antes de casar.
function flattenWhere(where: Rec): Rec {
  const out: Rec = {};
  for (const [k, v] of Object.entries(where)) {
    if (k.includes('_') && v && typeof v === 'object' && !Array.isArray(v) && !('contains' in v) && !('endsWith' in v) && !('not' in v)) {
      Object.assign(out, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function applyData(rec: Rec, data: Rec) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in v) {
      rec[k] = (rec[k] ?? 0) + v.increment;
    } else {
      rec[k] = v;
    }
  }
}

class Table {
  rows: Rec[] = [];
  constructor(private prefix: string, private opts: { unique?: string[] } = {}) {}

  private uniqueKey(rec: Rec): string | null {
    if (!this.opts.unique) return null;
    // NULLs são distintos no Postgres → só há colisão quando TODOS os campos são não-nulos.
    if (this.opts.unique.some((f) => rec[f] === null || rec[f] === undefined)) return null;
    return this.opts.unique.map((f) => String(rec[f])).join('|');
  }

  // Relações usadas pelo include das rotas. Declaradas em makePrismaMock.
  relations: Record<string, { table: Table; localKey?: string; foreignKey?: string; many?: boolean }> = {};

  private hydrate(rec: Rec | null, include?: Rec): Rec | null {
    if (!rec || !include) return rec;
    const out = { ...rec };
    for (const [name, spec] of Object.entries(include)) {
      const rel = this.relations[name];
      if (!rel || !spec) continue;
      if (rel.many) {
        const fk = rel.foreignKey!;
        out[name] = rel.table.rows.filter((r) => r[fk] === rec.id && r.deletedAt == null);
      } else {
        const lk = rel.localKey!;
        out[name] = rec[lk] ? rel.table.rows.find((r) => r.id === rec[lk]) ?? null : null;
      }
    }
    return out;
  }

  async findFirst({ where = {}, include }: { where?: Rec; include?: Rec } = {}) {
    const w = flattenWhere(where);
    return this.hydrate(this.rows.find((r) => matches(r, w)) ?? null, include);
  }
  async findUnique({ where = {}, include }: { where?: Rec; include?: Rec } = {}) {
    const w = flattenWhere(where);
    return this.hydrate(this.rows.find((r) => matches(r, w)) ?? null, include);
  }
  async findMany({ where = {}, include }: { where?: Rec; include?: Rec } = {}) {
    const w = flattenWhere(where);
    return this.rows.filter((r) => matches(r, w)).map((r) => this.hydrate(r, include)!);
  }
  async count({ where = {} }: { where?: Rec } = {}) {
    return this.rows.filter((r) => matches(r, where)).length;
  }
  async create({ data }: { data: Rec }) {
    const rec: Rec = {
      id: data.id ?? nextId(this.prefix),
      createdAt: data.createdAt ?? new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...data,
    };
    const uk = this.uniqueKey(rec);
    if (uk && this.rows.some((r) => this.uniqueKey(r) === uk)) {
      const err: any = new Error('Unique constraint failed');
      err.code = 'P2002';
      throw err;
    }
    this.rows.push(rec);
    return rec;
  }
  async update({ where, data }: { where: Rec; data: Rec }) {
    const rec = this.rows.find((r) => matches(r, where));
    if (!rec) {
      const err: any = new Error('Record to update not found');
      err.code = 'P2025';
      throw err;
    }
    applyData(rec, data);
    rec.updatedAt = new Date();
    return rec;
  }
}

export interface PrismaMock {
  // Mensageria: nomes dos models canal-agnósticos.
  channelAccount: Table;
  conversation: Table;
  message: Table;
  messageAttachment: Table;
  channelWebhookEvent: Table;
  contact: Table;
  contactIdentity: Table;
  company: Table;
  auditLog: Table;
  __reset(): void;
}

export function makePrismaMock(): PrismaMock {
  const mock: PrismaMock = {
    channelAccount: new Table('acc'),
    conversation: new Table('conv'),
    // Dedup da mensageria é por (accountId, externalId).
    message: new Table('msg', { unique: ['accountId', 'externalId'] }),
    messageAttachment: new Table('att'),
    channelWebhookEvent: new Table('chev'),
    contact: new Table('contact'),
    // Uma identidade por (clínica, canal, id externo) — o que impede duplicar contato.
    contactIdentity: new Table('ident', { unique: ['companyId', 'channel', 'externalId'] }),
    company: new Table('company'),
    auditLog: new Table('audit'),
    __reset() {
      for (const t of [
        mock.channelAccount, mock.conversation, mock.message,
        mock.messageAttachment, mock.channelWebhookEvent, mock.contact,
        mock.contactIdentity, mock.company, mock.auditLog,
      ]) t.rows = [];
    },
  };

  // Relações necessárias para os `include` das rotas da mensageria.
  mock.conversation.relations = {
    contact: { table: mock.contact, localKey: 'contactId' },
    account: { table: mock.channelAccount, localKey: 'accountId' },
    messages: { table: mock.message, foreignKey: 'conversationId', many: true },
  };
  mock.message.relations = {
    account: { table: mock.channelAccount, localKey: 'accountId' },
    attachments: { table: mock.messageAttachment, foreignKey: 'messageId', many: true },
  };
  mock.contact.relations = {
    identities: { table: mock.contactIdentity, foreignKey: 'contactId', many: true },
  };

  return mock;
}
