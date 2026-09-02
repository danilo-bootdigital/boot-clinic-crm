// Origem ATENDIMENTO nas contas a receber (Agenda → Financeiro).
//
// O ponto sensível: abrir uma origem cujo valor vem do payload (o Appointment
// não tem preço) sem afrouxar a regra antiga — orçamento/contrato continuam
// tendo o valor DERIVADO da origem no servidor. E o clique repetido em
// "Faturar atendimento" não pode duplicar cobrança sozinho.
import { describe, it, expect, beforeEach } from 'vitest';
import { billAppointment, createReceivable, resolveSourceType, FinancialError } from '@/lib/api/financial-service';
import type { TxClient } from '@/lib/db/financeTenant';
import { financialCan } from '@/lib/financial-caps';

const EMPRESA = 'clinica-A';
const OUTRA = 'clinica-B';

type Store = {
  patients: any[];
  appointments: any[];
  quotes: any[];
  contracts: any[];
  receivables: any[];
  professionals: any[];
  specialties: any[];
  installments: any[];
  payments: any[];
};

let db: Store;
let criado: any;

// `where` dos serviços é sempre igualdade escalar + `{ not: ... }` — o fake
// cobre exatamente isso; nada além do que o código sob teste usa.
function bate(rec: any, where: any): boolean {
  return Object.entries(where).every(([k, v]: [string, any]) => {
    if (v === undefined) return true;
    if (v === null) return rec[k] === null || rec[k] === undefined;
    if (v && typeof v === 'object' && 'not' in v) return rec[k] !== v.not;
    return rec[k] === v;
  });
}

const colecao = (linhas: () => any[]) => ({
  findFirst: async ({ where }: any) => linhas().find((r) => bate(r, where)) ?? null,
});

function fakeTx(): TxClient {
  return {
    patient: colecao(() => db.patients),
    appointment: colecao(() => db.appointments),
    clinicalQuote: colecao(() => db.quotes),
    patientContract: colecao(() => db.contracts),
    professional: colecao(() => db.professionals),
    specialty: colecao(() => db.specialties),
    revenueCategory: colecao(() => []),
    receivable: {
      ...colecao(() => db.receivables),
      create: async ({ data }: any) => {
        const id = `rec_${db.receivables.length + 1}`;
        const parcelas = (data.installments?.create ?? []).map((i: any, idx: number) => ({
          id: `${id}_inst_${idx + 1}`,
          receivableId: id,
          paidAmount: 0,
          paidAt: null,
          ...i,
        }));
        db.installments.push(...parcelas);
        criado = { id, ...data, installments: parcelas };
        db.receivables.push({ ...criado });
        return criado;
      },
      update: async ({ where, data }: any) => {
        const rec = db.receivables.find((r) => r.id === where.id);
        Object.assign(rec, data);
        return rec;
      },
    },
    receivableInstallment: {
      findFirst: async ({ where, include }: any) => {
        const inst = db.installments.find((i) => bate(i, where));
        if (!inst) return null;
        return {
          ...inst,
          ...(include?.payments
            ? { payments: db.payments.filter((p) => p.installmentId === inst.id && !p.reversedAt) }
            : {}),
          ...(include?.receivable
            ? { receivable: db.receivables.find((r) => r.id === inst.receivableId) }
            : {}),
        };
      },
      findMany: async ({ where }: any) => db.installments.filter((i) => bate(i, where)),
      update: async ({ where, data }: any) => {
        const inst = db.installments.find((i) => i.id === where.id);
        Object.assign(inst, data);
        return inst;
      },
    },
    installmentPayment: {
      create: async ({ data }: any) => {
        const pago = { id: `pay_${db.payments.length + 1}`, reversedAt: null, ...data };
        db.payments.push(pago);
        return pago;
      },
    },
    $queryRaw: async () => [],
  } as unknown as TxClient;
}

const base = {
  patientId: 'pac1',
  description: 'Consulta avulsa',
  discountAmount: 0,
  installmentsCount: 1,
  firstDueDate: new Date('2026-09-10T00:00:00Z'),
  intervalDays: 30,
  allowDuplicate: false,
};

beforeEach(() => {
  criado = null;
  db = {
    patients: [{ id: 'pac1', companyId: EMPRESA, name: 'João Silva', deletedAt: null }],
    appointments: [
      {
        id: 'ag1', companyId: EMPRESA, patientId: 'pac1', professionalId: 'prof1',
        specialtyId: 'esp1', type: 'Consulta', status: 'ATTENDED',
        startAt: new Date('2026-09-02T13:00:00Z'), deletedAt: null,
      },
      {
        id: 'ag_pendente', companyId: EMPRESA, patientId: 'pac1', professionalId: 'prof1',
        specialtyId: 'esp1', type: 'Consulta', status: 'CONFIRMED',
        startAt: new Date('2026-09-03T13:00:00Z'), deletedAt: null,
      },
      {
        id: 'ag_outra_clinica', companyId: OUTRA, patientId: 'pac1', professionalId: 'prof1',
        specialtyId: 'esp1', type: 'Consulta', status: 'ATTENDED',
        startAt: new Date('2026-09-02T13:00:00Z'), deletedAt: null,
      },
    ],
    quotes: [{ id: 'orc1', companyId: EMPRESA, patientId: 'pac1', status: 'APPROVED', total: 900, deletedAt: null }],
    contracts: [],
    receivables: [],
    professionals: [{ id: 'prof1', companyId: EMPRESA, name: 'Dra. Fernanda' }],
    specialties: [{ id: 'esp1', companyId: EMPRESA, name: 'Ortopedia' }],
    installments: [],
    payments: [],
  };
});

const faturarAtendimento = (extra: any = {}) =>
  createReceivable(fakeTx(), EMPRESA, 'user1', {
    ...base,
    sourceType: 'APPOINTMENT',
    appointmentId: 'ag1',
    originalAmount: 350,
    ...extra,
  } as any);

describe('resolveSourceType', () => {
  it('infere a origem de payloads antigos, sem sourceType', () => {
    expect(resolveSourceType({ quoteId: 'orc1' })).toBe('BUDGET');
    expect(resolveSourceType({ contractId: 'ct1' })).toBe('CONTRACT');
    expect(resolveSourceType({ appointmentId: 'ag1' })).toBe('APPOINTMENT');
    expect(resolveSourceType({})).toBe('MANUAL');
  });

  it('mantém a precedência do orçamento quando as duas origens vêm juntas', () => {
    expect(resolveSourceType({ quoteId: 'orc1', contractId: 'ct1' })).toBe('BUDGET');
  });
});

describe('cobrança com origem ATENDIMENTO', () => {
  it('cria a cobrança com o valor informado e grava o snapshot da origem', async () => {
    const rec = await faturarAtendimento();

    expect(rec.sourceType).toBe('APPOINTMENT');
    expect(rec.appointmentId).toBe('ag1');
    expect(rec.status).toBe('PENDENTE'); // cobrança nasce EM ABERTO, sem pagamento
    expect(Number(rec.finalAmount.toString())).toBe(350);
    // Snapshot congela nome do profissional e procedimento no momento do faturamento.
    expect(rec.sourceSnapshot).toMatchObject({
      kind: 'APPOINTMENT',
      professionalName: 'Dra. Fernanda',
      procedure: 'Consulta',
      patientName: 'João Silva',
    });
    expect(rec.installments).toHaveLength(1);
  });

  it('recusa atendimento que ainda não foi realizado', async () => {
    await expect(faturarAtendimento({ appointmentId: 'ag_pendente' })).rejects.toThrow(
      /marcado como realizado/,
    );
  });

  it('não enxerga atendimento de outra clínica', async () => {
    await expect(faturarAtendimento({ appointmentId: 'ag_outra_clinica' })).rejects.toThrow(
      /não encontrado/,
    );
  });

  it('recusa faturar atendimento de outro paciente', async () => {
    db.patients.push({ id: 'pac2', companyId: EMPRESA, name: 'Maria', deletedAt: null });
    await expect(faturarAtendimento({ patientId: 'pac2' })).rejects.toThrow(/outro paciente/);
  });

  it('exige valor — o atendimento não tem preço cadastrado', async () => {
    await expect(faturarAtendimento({ originalAmount: undefined })).rejects.toThrow(/Informe o valor/);
  });

  it('bloqueia a segunda cobrança do mesmo atendimento por padrão', async () => {
    await faturarAtendimento();
    await expect(faturarAtendimento()).rejects.toThrow(/já possui uma cobrança/);
    await expect(faturarAtendimento()).rejects.toMatchObject({ status: 409 });
  });

  it('permite cobrança adicional quando o usuário pede explicitamente', async () => {
    await faturarAtendimento();
    const extra = await faturarAtendimento({ allowDuplicate: true, description: 'Material' });
    expect(extra.appointmentId).toBe('ag1');
    expect(db.receivables).toHaveLength(2);
  });

  it('não bloqueia refaturamento quando a cobrança anterior foi cancelada', async () => {
    await faturarAtendimento();
    db.receivables[0].status = 'CANCELADO';
    const nova = await faturarAtendimento();
    expect(nova.sourceType).toBe('APPOINTMENT');
  });
});

describe('origens existentes não regridem', () => {
  it('orçamento continua derivando o valor da origem e ignorando o payload', async () => {
    const rec = await createReceivable(fakeTx(), EMPRESA, 'user1', {
      ...base,
      quoteId: 'orc1',
      originalAmount: 5, // tentativa de "mintar" valor — deve ser ignorada
    } as any);

    expect(rec.sourceType).toBe('BUDGET');
    expect(Number(rec.originalAmount.toString())).toBe(900);
  });

  it('orçamento continua com no máximo uma receita ativa', async () => {
    await createReceivable(fakeTx(), EMPRESA, 'user1', { ...base, quoteId: 'orc1' } as any);
    await expect(
      createReceivable(fakeTx(), EMPRESA, 'user1', { ...base, quoteId: 'orc1' } as any),
    ).rejects.toThrow(/já possui uma receita ativa/);
  });

  it('cobrança sem nenhuma origem continua barrada', async () => {
    await expect(createReceivable(fakeTx(), EMPRESA, 'user1', { ...base } as any)).rejects.toBeInstanceOf(
      FinancialError,
    );
  });
});


describe('"Faturar" x "Faturar e receber" (cobrança ≠ pagamento)', () => {
  const dadosBase = {
    description: 'Consulta',
    amount: 350,
    dueDate: new Date('2026-09-10T00:00:00Z'),
    allowDuplicate: false,
  };

  it('sem pagamento: nasce EM ABERTO e nada entra em recebido', async () => {
    const { receivable, payment } = await billAppointment(
      fakeTx(), EMPRESA, 'user1', { id: 'ag1', patientId: 'pac1' }, dadosBase as any,
    );

    expect(payment).toBeNull();
    expect(receivable.status).toBe('PENDENTE');
    expect(db.payments).toHaveLength(0);
  });

  it('com pagamento: registra a baixa pela infra existente e quita a parcela', async () => {
    const tx = fakeTx();
    const { receivable, payment } = await billAppointment(
      tx, EMPRESA, 'user1', { id: 'ag1', patientId: 'pac1' },
      { ...dadosBase, payment: { amount: 350, method: 'PIX' } } as any,
    );

    expect(payment).not.toBeNull();
    expect(payment!.method).toBe('PIX');
    expect(db.installments[0].status).toBe('PAGO');
    expect(db.receivables.find((r) => r.id === receivable.id)!.status).toBe('PAGO');
  });

  it('recebimento parcial deixa a cobrança em PARCIAL, não em PAGO', async () => {
    await billAppointment(
      fakeTx(), EMPRESA, 'user1', { id: 'ag1', patientId: 'pac1' },
      { ...dadosBase, payment: { amount: 100, method: 'DINHEIRO' } } as any,
    );

    expect(db.installments[0].status).toBe('PARCIAL');
    expect(db.receivables[0].status).toBe('PARCIAL');
  });

  it('baixa maior que a parcela é recusada — e não deixa cobrança órfã na transação real', async () => {
    await expect(
      billAppointment(
        fakeTx(), EMPRESA, 'user1', { id: 'ag1', patientId: 'pac1' },
        { ...dadosBase, payment: { amount: 500, method: 'PIX' } } as any,
      ),
    ).rejects.toThrow(/excede o saldo/);
  });
});


describe('cobrança MANUAL (sem origem vinculada)', () => {
  const manual = (extra: any = {}) =>
    createReceivable(fakeTx(), EMPRESA, 'user1', {
      ...base,
      sourceType: 'MANUAL',
      description: 'Taxa administrativa',
      originalAmount: 120,
      ...extra,
    } as any);

  it('cria com o valor do payload e sem vínculo de origem', async () => {
    const rec = await manual();
    expect(rec.sourceType).toBe('MANUAL');
    expect(rec.appointmentId).toBeUndefined();
    expect(rec.quoteId).toBeUndefined();
    expect(Number(rec.finalAmount.toString())).toBe(120);
  });

  it('recusa MANUAL com origem vinculada — seria uma origem mal rotulada', async () => {
    await expect(manual({ quoteId: 'orc1' })).rejects.toThrow(/não pode ter origem vinculada/);
  });

  it('exige valor', async () => {
    await expect(manual({ originalAmount: undefined })).rejects.toThrow(/Informe o valor/);
  });

  it('NÃO é alcançável por omissão: payload sem origem continua barrado', async () => {
    // Sem `sourceType: 'MANUAL'` explícito, um payload vazio cai na mensagem
    // antiga — não vira cobrança manual silenciosa de valor arbitrário.
    await expect(
      createReceivable(fakeTx(), EMPRESA, 'user1', { ...base, originalAmount: 999 } as any),
    ).rejects.toThrow(/atendimento realizado, orçamento aprovado ou contrato assinado/);
  });
});

describe('RBAC: quem pode criar cobrança manual', () => {
  it('gestão e financeiro podem; recepção e médico não', () => {
    for (const papel of ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'FINANCE']) {
      expect(financialCan(papel, 'create_manual')).toBe(true);
    }
    // RECEPTION mantém `create` (origem vinculada) mas não a manual.
    expect(financialCan('RECEPTION', 'create')).toBe(true);
    expect(financialCan('RECEPTION', 'create_manual')).toBe(false);
    expect(financialCan('DOCTOR', 'create_manual')).toBe(false);
    expect(financialCan('MARKETING', 'create_manual')).toBe(false);
  });
});
