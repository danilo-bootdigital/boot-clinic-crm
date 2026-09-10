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
  // Combinadores top-level (AND/OR/NOT) — usados pelas rotas de Tarefas para
  // combinar escopo de empresa + papel (admin vê tudo, os demais só "minhas").
  if (where.AND !== undefined) {
    const clauses = Array.isArray(where.AND) ? where.AND : [where.AND];
    if (!clauses.every((w: Rec) => matches(rec, w))) return false;
  }
  if (where.OR !== undefined) {
    const clauses = Array.isArray(where.OR) ? where.OR : [where.OR];
    if (!clauses.some((w: Rec) => matches(rec, w))) return false;
  }
  if (where.NOT !== undefined) {
    if (matches(rec, where.NOT)) return false;
  }
  for (const [k, v] of Object.entries(where)) {
    if (k === 'AND' || k === 'OR' || k === 'NOT') continue;
    if (v === undefined) continue;
    if (v === null) {
      if (rec[k] !== null && rec[k] !== undefined) return false;
    } else if (typeof v === 'object' && 'contains' in v) {
      if (typeof rec[k] !== 'string' || !rec[k].includes(v.contains)) return false;
    } else if (typeof v === 'object' && 'endsWith' in v) {
      if (typeof rec[k] !== 'string' || !rec[k].endsWith(v.endsWith)) return false;
    } else if (typeof v === 'object' && 'not' in v) {
      if (v.not === null ? rec[k] === null || rec[k] === undefined : rec[k] === v.not) return false;
    } else if (typeof v === 'object' && 'in' in v) {
      if (!Array.isArray(v.in) || !v.in.includes(rec[k])) return false;
    } else if (typeof v === 'object' && 'notIn' in v) {
      // Usado para "negócio ainda em aberto" (status notIn [WON, LOST]).
      if (Array.isArray(v.notIn) && v.notIn.includes(rec[k])) return false;
    } else if (typeof v === 'object' && 'equals' in v) {
      // `mode: 'insensitive'` do Postgres: comparação sem caixa.
      const a = rec[k];
      const b = v.equals;
      if (v.mode === 'insensitive' && typeof a === 'string' && typeof b === 'string') {
        if (a.toLowerCase() !== b.toLowerCase()) return false;
      } else if (a !== b) {
        return false;
      }
    } else if (typeof v === 'object' && ('gte' in v || 'gt' in v || 'lte' in v || 'lt' in v)) {
      // Comparação de faixa (usada na janela de idempotência do envio). Datas
      // viram número para não comparar objetos Date por referência.
      const n = (x: any) => (x instanceof Date ? x.getTime() : x);
      const val = n(rec[k]);
      if (val === undefined || val === null) return false;
      if ('gte' in v && !(val >= n(v.gte))) return false;
      if ('gt' in v && !(val > n(v.gt))) return false;
      if ('lte' in v && !(val <= n(v.lte))) return false;
      if ('lt' in v && !(val < n(v.lt))) return false;
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
  async findMany({
    where = {},
    include,
    orderBy,
    skip,
    take,
  }: { where?: Rec; include?: Rec; orderBy?: Rec | Rec[]; skip?: number; take?: number } = {}) {
    const w = flattenWhere(where);
    let rows = this.rows.filter((r) => matches(r, w));
    // orderBy: string/número/Date comparados na ordem natural. Não reproduz a
    // ordem de declaração de um enum do Postgres (ex.: TaskStatus) — os testes
    // que dependem de ordenação usam um recorte já homogêneo por status.
    if (orderBy) {
      const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
      rows = [...rows].sort((a, b) => {
        for (const spec of specs) {
          for (const [field, dir] of Object.entries(spec)) {
            const av = a[field];
            const bv = b[field];
            const an = av instanceof Date ? av.getTime() : av;
            const bn = bv instanceof Date ? bv.getTime() : bv;
            if (an === bn) continue;
            const cmp = an < bn ? -1 : 1;
            return dir === 'desc' ? -cmp : cmp;
          }
        }
        return 0;
      });
    }
    if (typeof skip === 'number' || typeof take === 'number') {
      rows = rows.slice(skip ?? 0, (skip ?? 0) + (take ?? rows.length));
    }
    return rows.map((r) => this.hydrate(r, include)!);
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
  async createMany({ data }: { data: Rec[] }) {
    for (const d of data) await this.create({ data: d });
    return { count: data.length };
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
  // Módulo de exames — usado pelos testes de isolamento multiempresa.
  examCatalogItem: Table;
  examTemplate: Table;
  examRequest: Table;
  // CRM — usado pelos testes do perdido com motivo.
  user: Table;
  deal: Table;
  dealActivity: Table;
  dealLossReason: Table;
  pipeline: Table;
  pipelineStage: Table;
  // Agenda — usado pelos testes de especialidade do médico.
  professional: Table;
  professionalSpecialty: Table;
  specialty: Table;
  appointment: Table;
  patient: Table;
  room: Table;
  // Módulo Tarefas (ex-Follow-up)
  followUpTask: Table;
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
    examCatalogItem: new Table('exam'),
    examTemplate: new Table('tpl'),
    examRequest: new Table('req'),
    user: new Table('user'),
    deal: new Table('deal'),
    dealActivity: new Table('dact'),
    dealLossReason: new Table('lr'),
    pipeline: new Table('pipe'),
    pipelineStage: new Table('stage'),
    professional: new Table('prof'),
    // Um vínculo por (médico, especialidade) — igual ao @@unique do schema.
    professionalSpecialty: new Table('psp', { unique: ['professionalId', 'specialtyId'] }),
    specialty: new Table('spec'),
    appointment: new Table('appt'),
    patient: new Table('pat'),
    room: new Table('room'),
    followUpTask: new Table('task'),
    __reset() {
      for (const t of [
        mock.channelAccount, mock.conversation, mock.message,
        mock.messageAttachment, mock.channelWebhookEvent, mock.contact,
        mock.contactIdentity, mock.company, mock.auditLog,
        mock.examCatalogItem, mock.examTemplate, mock.examRequest,
        mock.user, mock.deal, mock.dealActivity, mock.dealLossReason,
        mock.pipeline, mock.pipelineStage,
        mock.professional, mock.professionalSpecialty, mock.specialty,
        mock.appointment, mock.patient, mock.room,
        mock.followUpTask,
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
  // Caminho usado quando a identidade JÁ existe: resolveContact lê
  // identity.contact para devolver o dono da identidade.
  mock.contactIdentity.relations = {
    contact: { table: mock.contact, localKey: 'contactId' },
  };

  return mock;
}
