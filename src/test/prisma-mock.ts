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
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      // where aninhado não suportado aqui — trata como igualdade de referência
      if (rec[k] !== v) return false;
    } else if (rec[k] !== v) {
      return false;
    }
  }
  return true;
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

  async findFirst({ where = {} }: { where?: Rec } = {}) {
    return this.rows.find((r) => matches(r, where)) ?? null;
  }
  async findUnique({ where = {} }: { where?: Rec } = {}) {
    return this.rows.find((r) => matches(r, where)) ?? null;
  }
  async findMany({ where = {} }: { where?: Rec } = {}) {
    return this.rows.filter((r) => matches(r, where));
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
  whatsAppInstance: Table;
  whatsAppConversation: Table;
  whatsAppMessage: Table;
  whatsAppWebhookEvent: Table;
  company: Table;
  auditLog: Table;
  __reset(): void;
}

export function makePrismaMock(): PrismaMock {
  const mock: PrismaMock = {
    whatsAppInstance: new Table('inst', { unique: ['instanceName'] }),
    whatsAppConversation: new Table('conv'),
    whatsAppMessage: new Table('msg', { unique: ['instanceId', 'externalId'] }),
    whatsAppWebhookEvent: new Table('whev'),
    company: new Table('company'),
    auditLog: new Table('audit'),
    __reset() {
      for (const t of [
        mock.whatsAppInstance, mock.whatsAppConversation, mock.whatsAppMessage,
        mock.whatsAppWebhookEvent, mock.company, mock.auditLog,
      ]) t.rows = [];
    },
  };
  return mock;
}
