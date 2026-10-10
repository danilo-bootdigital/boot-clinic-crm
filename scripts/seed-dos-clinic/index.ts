// =====================================================================
// seed-dos-clinic — popula a clínica demonstrativa "DOS CLINIC".
//
// Uso (ver README.md nesta pasta):
//   npm run seed:dos-clinic                 # cria/complementa (idempotente)
//   npm run seed:dos-clinic -- --yes        # obrigatório quando o banco é remoto
//   npm run seed:dos-clinic -- --verify     # só validações (somente leitura)
//   npm run seed:dos-clinic -- --reset --yes  # apaga SÓ os dados da DOS CLINIC
//
// Princípios:
//  - Usa os serviços reais do app sempre que existem (createReceivable,
//    registerPayment, billAppointment, createPayable, registerPayablePayment,
//    createSessionForAppointment, buildSignedContractPdf, uploadClinicalFile,
//    uploadCompanyLogo, buildContractVariables/renderContractContent).
//  - Tudo escopado por companyId da DOS CLINIC; reset confere nome + CNPJ demo.
//  - Idempotente: cada registro é localizado pela chave natural antes de criar.
//  - NUNCA cria ChannelAccount (conta de WhatsApp/Instagram) para a clínica:
//    sem conta, sendWhatsappForCompany sai antes de chamar a Evolution API.
// =====================================================================
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '@/lib/db/prisma';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import {
  createReceivable, registerPayment, billAppointment, ensureRevenueCategories, decToNumber,
} from '@/lib/api/financial-service';
import { createPayable, registerPayablePayment, ensureExpenseCatalog } from '@/lib/api/payable-service';
import {
  CreateReceivableSchema, RegisterPaymentSchema, BillAppointmentSchema, CreatePayableSchema,
} from '@/lib/validations/financial';
import { getDefaultStages } from '@/lib/validations/crm';
import { renderContractContent } from '@/lib/validations/clinical';
import { DEFAULT_LOSS_REASONS } from '@/lib/crm/loss-reasons';
import { buildContractVariables, formatCpf, formatCnpj } from '@/lib/contracts/variables';
import { buildSignedContractPdf } from '@/lib/contracts/pdf';
import { contractContentHash } from '@/lib/contracts/signing';
import { uploadClinicalFile } from '@/lib/storage/clinical-storage';
import { uploadCompanyLogo } from '@/lib/storage/company-logo-storage';
import { createSessionForAppointment } from '@/lib/api/telemedicine';
import { EXAM_CATALOG_SEED } from '@/lib/clinical/exam-catalog-default';
import { sanitizePermissions } from '@/lib/api/permissions';
import * as D from './data';

// ---------------------------------------------------------------------
// Ambiente / argumentos
// ---------------------------------------------------------------------
const args = new Set(process.argv.slice(2));
const YES = args.has('--yes');
const RESET = args.has('--reset');
const VERIFY_ONLY = args.has('--verify');
const ASSETS = process.env.DOS_ASSETS_DIR || join(process.cwd(), 'scripts/seed-dos-clinic/assets');

const dbUrl = process.env.DATABASE_URL || '';
let dbHost = '(desconhecido)';
try { dbHost = new URL(dbUrl).host; } catch { /* noop */ }
const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(dbHost);
// Auth e Storage só fazem sentido contra o Supabase real do mesmo projeto do banco.
const REMOTE_SERVICES = !IS_LOCAL && !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([^.]+)\./)?.[1] ?? '—';

// ---------------------------------------------------------------------
// Datas (America/Sao_Paulo, UTC-3 fixo — sem horário de verão desde 2019)
// ---------------------------------------------------------------------
const DAY = 86_400_000;
const anchor = process.env.DEMO_ANCHOR_DATE || D.ANCHOR_REF;
if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) throw new Error('DEMO_ANCHOR_DATE deve ser YYYY-MM-DD');
const SHIFT = Math.round((Date.parse(`${anchor}T00:00:00Z`) - Date.parse(`${D.ANCHOR_REF}T00:00:00Z`)) / DAY);

function shiftYmd(ymd: string, opts: { weekday?: boolean } = {}): string {
  const t = new Date(Date.parse(`${ymd}T12:00:00Z`) + SHIFT * DAY);
  if (opts.weekday && SHIFT !== 0) {
    const w = t.getUTCDay();
    if (w === 6) t.setUTCDate(t.getUTCDate() + 2);
    if (w === 0) t.setUTCDate(t.getUTCDate() + 1);
  }
  return t.toISOString().slice(0, 10);
}
/** 'YYYY-MM-DD HH:MM' (ou só data) no fuso de São Paulo → Date. */
function T(s: string, opts: { weekday?: boolean } = {}): Date {
  const [ymd, hm = '12:00'] = s.split(' ');
  return new Date(`${shiftYmd(ymd, opts)}T${hm}:00-03:00`);
}
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

// ---------------------------------------------------------------------
// Dados sintéticos com dígito verificador INVÁLIDO (nunca colidem com reais)
// ---------------------------------------------------------------------
function cpfDv(nums: number[]): number {
  let s = 0;
  for (let i = 0; i < nums.length; i++) s += nums[i] * (nums.length + 1 - i);
  const r = (s * 10) % 11;
  return r === 10 ? 0 : r;
}
/** Dígitos determinísticos e bem espalhados a partir de uma semente (nome). */
function seedDigits(seed: string, n: number): number[] {
  const h = createHash('sha256').update(`dos-clinic:${seed}`).digest();
  return Array.from({ length: n }, (_, i) => h[i] % 10);
}
function fakeCpf(seed: string): string {
  const base = seedDigits(`cpf:${seed}`, 9);
  if (base[0] === 0) base[0] = 3;
  const d1 = cpfDv(base);
  const d2 = cpfDv([...base, d1]);
  const bad1 = (d1 + 1) % 10; // invalida de propósito
  const s = [...base, bad1, d2].join('');
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}
function fakeCnpj(base12: string): string {
  const n = base12.split('').map(Number);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const r1 = n.reduce((s, v, i) => s + v * w1[i], 0) % 11;
  const d1 = r1 < 2 ? 0 : 11 - r1;
  const s = [...n, (d1 + 1) % 10, 0].join(''); // DV inválido
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}
function fakePhone(seed: string, city = 'São Paulo'): string {
  const ddd = city === 'Campinas' ? '19' : city === 'Sorocaba' ? '15' : '11';
  const d = seedDigits(`tel:${seed}`, 8);
  if (d[0] < 6) d[0] += 4; // celulares 9 6xxx–9 9xxx
  return `${ddd}9${d.join('')}`;
}
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

// ---------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------
type Ctx = {
  companyId: string;
  company: { name: string; cnpj: string | null; address: string | null; phone: string | null; email: string | null };
  owner: { id: string; name: string };
  users: Record<string, { id: string; name: string }>;     // staff key → user
  profs: Record<string, { id: string; name: string; crm: string | null }>; // AND/BEA/LAR/CAR
  specialties: Record<string, string>;
  rooms: Record<string, string>;
  tags: Record<string, string>;
  patients: Record<string, any>;
  contacts: Record<string, string>;
  pipelineId: string;
  stages: Record<string, { id: string; finalType: string }>;
  lossReasons: Record<string, string>;
  deals: Record<string, string>;      // title → id
  dealByWho: Record<string, string>;  // patient/lead key → deal id
  appts: Map<string, any>;            // `${patient}|${iso}` → appointment
  quotes: Record<string, any>;
  contracts: Record<string, any>;
  revenueCats: Record<string, string>;
  stats: Record<string, number>;
};
const bump = (ctx: Ctx, k: string, n = 1) => { ctx.stats[k] = (ctx.stats[k] ?? 0) + n; };
const actor = (ctx: Ctx, key: string) => (key === 'OWNER' ? ctx.owner : ctx.users[key] ?? ctx.owner);

async function audit(ctx: Ctx, by: { id: string; name: string }, action: any, entityType: any, entityId: string, newValues: any, at: Date, oldValues?: any) {
  await prisma.auditLog.create({
    data: { userId: by.id, userName: by.name, action, entityType, entityId, newValues, oldValues, timestamp: at, companyId: ctx.companyId, ipAddress: null, userAgent: 'seed-dos-clinic' },
  });
}

// ---------------------------------------------------------------------
// 1) Clínica + dono
// ---------------------------------------------------------------------
const DEMO_CNPJ = fakeCnpj(D.COMPANY.cnpjBase);

async function findDemoCompany() {
  return prisma.company.findFirst({ where: { name: D.COMPANY.name, cnpj: DEMO_CNPJ, deletedAt: null } });
}

async function ensureCompany() {
  let company = await findDemoCompany();
  if (!company) {
    const sameName = await prisma.company.findFirst({ where: { name: D.COMPANY.name, deletedAt: null } });
    if (sameName) throw new Error(`Já existe uma empresa "${D.COMPANY.name}" (${sameName.id}) que NÃO tem o CNPJ demo ${DEMO_CNPJ}. Abortando para não tocar dados de terceiros.`);
    company = await prisma.company.create({
      data: {
        name: D.COMPANY.name, cnpj: DEMO_CNPJ, address: D.COMPANY.address, phone: D.COMPANY.phone, email: D.COMPANY.email,
        status: 'ACTIVE', plan: D.COMPANY.plan, createdAt: T('2026-09-01 08:00'),
      },
    });
    console.log(`  + empresa criada ${company.id}`);
  } else {
    company = await prisma.company.update({
      where: { id: company.id },
      data: { address: D.COMPANY.address, phone: D.COMPANY.phone, email: D.COMPANY.email, status: 'ACTIVE', plan: D.COMPANY.plan },
    });
    console.log(`  = empresa existente ${company.id}`);
  }
  return company;
}

async function authAdmin(path: string, init: RequestInit = {}) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const r = await fetch(`${base}/auth/v1/admin${path}`, {
    ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Supabase Auth ${path}: ${r.status} ${JSON.stringify(body)}`);
  return body;
}

/** Resolve o UID do dono no Supabase Auth. Nunca altera senha de conta existente. */
async function resolveOwnerUid(): Promise<{ uid: string; createdPassword?: string }> {
  if (!REMOTE_SERVICES) return { uid: 'local-demo-owner-dos-clinic' };
  for (let page = 1; page <= 20; page++) {
    const { users } = await authAdmin(`/users?page=${page}&per_page=1000`);
    const found = users.find((u: any) => (u.email || '').toLowerCase() === D.OWNER.email);
    if (found) return { uid: found.id };
    if (users.length < 1000) break;
  }
  // Não existe: cria (e-mail confirmado) com senha aleatória forte, exibida 1x.
  const password = process.env.DOS_OWNER_PASSWORD || `Dos-${randomBytes(9).toString('base64url')}!`;
  const created = await authAdmin('/users', { method: 'POST', body: JSON.stringify({ email: D.OWNER.email, password, email_confirm: true }) });
  return { uid: created.id, createdPassword: process.env.DOS_OWNER_PASSWORD ? '(definida via DOS_OWNER_PASSWORD)' : password };
}

async function ensureOwner(companyId: string) {
  const existing = await prisma.user.findUnique({ where: { email: D.OWNER.email } });
  if (existing) {
    if (existing.companyId !== companyId) {
      throw new Error(`${D.OWNER.email} já pertence à empresa ${existing.companyId}. O modelo atual tem 1 empresa por usuário — mover exige decisão manual. Abortando.`);
    }
    const u = await prisma.user.update({ where: { id: existing.id }, data: { role: 'OWNER', deletedAt: null } });
    console.log(`  = dono existente ${u.id}`);
    return { user: u, createdPassword: undefined as string | undefined };
  }
  const { uid, createdPassword } = await resolveOwnerUid();
  const user = await prisma.user.create({
    data: { id: uid, email: D.OWNER.email, name: D.OWNER.name, role: 'OWNER', companyId, createdAt: T('2026-09-01 08:05') },
  });
  console.log(`  + dono vinculado ${user.id}${createdPassword ? ' (conta Auth criada agora)' : ''}`);
  return { user, createdPassword };
}

// ---------------------------------------------------------------------
// 2) Equipe, especialidades, salas, agenda base
// ---------------------------------------------------------------------
async function ensureTeam(ctx: Ctx) {
  for (const s of D.SPECIALTIES) {
    const sp = await prisma.specialty.upsert({
      where: { companyId_name: { companyId: ctx.companyId, name: s.name } },
      update: { description: s.description, deletedAt: null },
      create: { companyId: ctx.companyId, name: s.name, description: s.description, createdAt: T('2026-09-01 08:10') },
    });
    ctx.specialties[s.name] = sp.id;
  }
  for (const r of D.ROOMS) {
    const room = await prisma.room.upsert({
      where: { companyId_name: { companyId: ctx.companyId, name: r.name } },
      update: { description: r.description, isActive: true, deletedAt: null },
      create: { companyId: ctx.companyId, name: r.name, description: r.description, createdAt: T('2026-09-01 08:12') },
    });
    ctx.rooms[r.name] = room.id;
  }

  for (const s of D.STAFF) {
    let u = await prisma.user.findUnique({ where: { email: s.email } });
    if (u && u.companyId !== ctx.companyId) throw new Error(`E-mail ${s.email} pertence a outra empresa — abortando.`);
    if (!u) {
      // Usuário de equipe SEM conta no Supabase Auth: aparece na equipe/agenda,
      // mas não faz login (a demo é conduzida pelo dono).
      u = await prisma.user.create({
        data: { email: s.email, name: s.name, role: s.role as any, companyId: ctx.companyId, permissions: sanitizePermissions(D.PERMISSIONS[s.role]), createdAt: T('2026-09-01 08:20') },
      });
      bump(ctx, 'users');
    }
    ctx.users[s.key] = { id: u.id, name: u.name };
    if ('prof' in s && s.prof) {
      const prof = await upsertProfessional(ctx, { name: s.name, email: s.email, phone: s.phone, crm: s.prof.crm, userId: u.id, specialties: [...s.prof.specialties] });
      ctx.profs[s.key] = prof;
    }
  }
  for (const p of D.PROF_ONLY) {
    ctx.profs[p.key] = await upsertProfessional(ctx, { name: p.name, email: p.email, phone: p.phone, crm: p.crm, userId: null, specialties: p.specialties });
  }

  // Horários de atendimento + bloqueios
  for (const [key, rows] of Object.entries(D.SCHEDULES)) {
    const profId = ctx.profs[key].id;
    for (const [dow, start, end] of rows) {
      const ex = await prisma.professionalSchedule.findFirst({ where: { companyId: ctx.companyId, professionalId: profId, dayOfWeek: dow, deletedAt: null } });
      if (!ex) await prisma.professionalSchedule.create({ data: { companyId: ctx.companyId, professionalId: profId, dayOfWeek: dow, startTime: start, endTime: end } });
    }
  }
  for (const b of D.SCHEDULE_BLOCKS) {
    const profId = ctx.profs[b.prof].id;
    const date = T(`${b.date} 00:00`);
    const ex = await prisma.scheduleBlock.findFirst({ where: { companyId: ctx.companyId, professionalId: profId, date, deletedAt: null } });
    if (!ex) { await prisma.scheduleBlock.create({ data: { companyId: ctx.companyId, professionalId: profId, date, startTime: b.start, endTime: b.end, reason: b.reason } }); bump(ctx, 'scheduleBlocks'); }
  }
}

async function upsertProfessional(ctx: Ctx, p: { name: string; email: string; phone: string; crm: string; userId: string | null; specialties: string[] }) {
  let prof = p.userId
    ? await prisma.professional.findUnique({ where: { userId: p.userId } })
    : await prisma.professional.findFirst({ where: { companyId: ctx.companyId, name: p.name, deletedAt: null } });
  if (!prof) {
    prof = await prisma.professional.create({
      data: { companyId: ctx.companyId, name: p.name, email: p.email, phone: p.phone, crm: p.crm, userId: p.userId, createdAt: T('2026-09-01 08:25') },
    });
    bump(ctx, 'professionals');
  }
  for (const sName of p.specialties) {
    await prisma.professionalSpecialty.upsert({
      where: { professionalId_specialtyId: { professionalId: prof.id, specialtyId: ctx.specialties[sName] } },
      update: {},
      create: { professionalId: prof.id, specialtyId: ctx.specialties[sName], companyId: ctx.companyId },
    });
  }
  return { id: prof.id, name: prof.name, crm: prof.crm };
}

// ---------------------------------------------------------------------
// 3) Catálogos (tags, CRM, financeiro, exames, mensagens, automações...)
// ---------------------------------------------------------------------
async function ensureCatalogs(ctx: Ctx) {
  for (const [name, color] of D.TAGS) {
    const t = await prisma.tag.upsert({
      where: { companyId_name: { companyId: ctx.companyId, name } }, update: { color }, create: { companyId: ctx.companyId, name, color },
    });
    ctx.tags[name] = t.id;
  }

  // Pipeline padrão — mesmas etapas do ensureDefaults da API.
  let pipeline = await prisma.pipeline.findFirst({ where: { companyId: ctx.companyId, deletedAt: null, isDefault: true } });
  if (!pipeline) {
    pipeline = await prisma.pipeline.create({ data: { name: 'Pipeline Padrão', isDefault: true, companyId: ctx.companyId, order: 0, createdAt: T('2026-09-01 08:30') } });
    await prisma.pipelineStage.createMany({ data: getDefaultStages().map((s) => ({ ...s, pipelineId: pipeline!.id, companyId: ctx.companyId })) });
  }
  ctx.pipelineId = pipeline.id;
  for (const s of await prisma.pipelineStage.findMany({ where: { pipelineId: pipeline.id } })) ctx.stages[s.name] = { id: s.id, finalType: s.finalType };

  if ((await prisma.dealLossReason.count({ where: { companyId: ctx.companyId } })) === 0) {
    await prisma.dealLossReason.createMany({ data: DEFAULT_LOSS_REASONS.map((name, order) => ({ name, order, companyId: ctx.companyId })) });
  }
  for (const r of await prisma.dealLossReason.findMany({ where: { companyId: ctx.companyId, deletedAt: null } })) ctx.lossReasons[r.name] = r.id;

  // Financeiro: categorias padrão do sistema + específicas da clínica.
  await withFinanceTenant(ctx.companyId, async (tx) => {
    await ensureRevenueCategories(tx, ctx.companyId);
    await ensureExpenseCatalog(tx, ctx.companyId);
    const extra = ['Material clínico', 'Laboratório', 'Software', 'Limpeza', 'Material de escritório'];
    for (const [i, name] of extra.entries()) {
      await tx.expenseCategory.upsert({
        where: { companyId_name: { companyId: ctx.companyId, name } }, update: {}, create: { companyId: ctx.companyId, name, order: 10 + i },
      });
    }
    for (const c of await tx.revenueCategory.findMany({ where: { companyId: ctx.companyId } })) ctx.revenueCats[c.name] = c.id;
  });

  // Catálogo de exames (painel padrão do sistema).
  if ((await prisma.examCatalogItem.count({ where: { companyId: ctx.companyId } })) === 0) {
    await prisma.examCatalogItem.createMany({
      data: EXAM_CATALOG_SEED.map((e, i) => ({ companyId: ctx.companyId, group: e.group, subgroup: e.subgroup ?? null, name: e.name, order: i })),
    });
  }
  const tplName = 'Check-up Integrado — painel básico';
  if (!(await prisma.examTemplate.findFirst({ where: { companyId: ctx.companyId, name: tplName, deletedAt: null } }))) {
    const names = ['Hemograma completo', 'Glicemia de jejum', 'Hemoglobina glicada (HbA1c)', 'Perfil lipídico — Colesterol Total', 'Perfil lipídico — HDL', 'Perfil lipídico — LDL', 'Perfil lipídico — Triglicerídeos', 'TSH', 'Creatinina'];
    const cat = await prisma.examCatalogItem.findMany({ where: { companyId: ctx.companyId, name: { in: names } } });
    await prisma.examTemplate.create({
      data: {
        companyId: ctx.companyId, name: tplName, clinicalIndication: 'Avaliação preventiva anual (check-up integrado).', createdByUserId: ctx.users.AND.id,
        items: { create: names.map((n, i) => { const c = cat.find((x) => x.name === n); return { name: n, group: c?.group ?? 'Exames Fundamentais', subgroup: c?.subgroup ?? null, order: i }; }) },
      },
    });
  }

  // Mensagens prontas (a API só semeia as 3 genéricas quando não há nenhuma).
  for (const q of D.QUICK_REPLIES) {
    const ex = await prisma.quickReply.findFirst({ where: { companyId: ctx.companyId, keyword: q.keyword, deletedAt: null } });
    if (!ex) { await prisma.quickReply.create({ data: { companyId: ctx.companyId, ...q, createdAt: T('2026-09-02 09:00') } }); bump(ctx, 'quickReplies'); }
  }

  // Modelos de anamnese
  for (const t of D.ANAMNESIS_TEMPLATES) {
    if (await prisma.anamnesisTemplate.findFirst({ where: { companyId: ctx.companyId, name: t.name, deletedAt: null } })) continue;
    await prisma.anamnesisTemplate.create({
      data: {
        companyId: ctx.companyId, name: t.name, specialty: t.specialty, description: t.description, createdById: ctx.owner.id, createdAt: T('2026-09-02 10:00'),
        questions: { create: t.questions.map((q: any, i: number) => ({ companyId: ctx.companyId, label: q[0], type: q[1], options: q[2] ?? undefined, required: i === 0, order: i })) },
      },
    });
  }

  // Modelos de contrato
  for (const tpl of CONTRACT_TEMPLATES) {
    if (!(await prisma.contractTemplate.findFirst({ where: { companyId: ctx.companyId, name: tpl.name, deletedAt: null } }))) {
      await prisma.contractTemplate.create({ data: { companyId: ctx.companyId, name: tpl.name, description: tpl.description, content: tpl.content, createdById: ctx.owner.id, createdAt: T('2026-09-02 10:30') } });
    }
  }

  // Automações (só criam tarefa/notificação interna — o motor não envia mensagens).
  for (const a of D.AUTOMATIONS) {
    if (await prisma.automationRule.findFirst({ where: { companyId: ctx.companyId, name: a.name } })) continue;
    const rule = await prisma.automationRule.create({ data: { name: a.name, companyId: ctx.companyId, isActive: a.active, createdAt: T('2026-09-03 09:00') } });
    const entity = a.event === 'PATIENT_CREATED' ? 'PATIENT' : a.event === 'DEAL_WON' ? 'DEAL' : 'APPOINTMENT';
    await prisma.automationTrigger.create({ data: { ruleId: rule.id, entityType: entity as any, event: a.event, companyId: ctx.companyId } });
    await prisma.automationAction.createMany({ data: a.actions.map((x, i) => ({ ruleId: rule.id, actionType: x.actionType as any, config: JSON.stringify(x.config), order: i + 1, companyId: ctx.companyId })) });
  }

  // Preferências de notificação (WhatsApp desligado na clínica demo).
  await prisma.notificationSetting.upsert({
    where: { companyId: ctx.companyId },
    update: { whatsappEnabled: false, smsEnabled: false },
    create: { companyId: ctx.companyId, emailEnabled: true, smsEnabled: false, whatsappEnabled: false, appointmentReminders: true, followUpReminders: true },
  });
}

const CONTRACT_TEMPLATES = [
  {
    key: 'PROG', titlePrefix: 'Contrato', name: 'Contrato de Prestação de Serviços — Programa de Acompanhamento',
    description: 'Programas de nutrologia, endocrinologia, nutrição e check-up.',
    content: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE SAÚDE

CONTRATADA: {{clinica}}, inscrita no CNPJ sob o nº {{cnpj_clinica}}, com sede em {{endereco_clinica}}, telefone {{telefone_clinica}}.

CONTRATANTE: {{nome_paciente}}, CPF {{cpf}}, nascido(a) em {{data_nascimento}}, residente em {{endereco_completo}}, telefone {{telefone}}, e-mail {{email}}.

1. OBJETO. A CONTRATADA prestará ao CONTRATANTE os serviços de "{{procedimento}}", sob responsabilidade técnica de {{profissional}}, conforme plano apresentado em orçamento aprovado.

2. VALOR E PAGAMENTO. O valor total dos serviços é de {{valor}}, pago na forma acordada no orçamento. Parcelas em atraso estão sujeitas a multa de 2% e juros de 1% ao mês.

3. AGENDAMENTOS. As consultas e retornos serão agendados conforme disponibilidade da agenda. Remarcações devem ser solicitadas com 24 horas de antecedência; ausências sem aviso contam como sessão realizada.

4. CONFIDENCIALIDADE. Os dados pessoais e de saúde do CONTRATANTE serão tratados conforme a Lei 13.709/2018 (LGPD), exclusivamente para a finalidade assistencial.

5. VIGÊNCIA. Este contrato vigora até a conclusão do programa contratado, podendo ser rescindido por qualquer das partes mediante aviso prévio de 7 dias.

São Paulo, {{data_extenso}}.`,
  },
  {
    key: 'EST', titlePrefix: 'Termo de consentimento', name: 'Termo de Consentimento — Procedimento Estético',
    description: 'Procedimentos estéticos faciais e corporais.',
    content: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO — PROCEDIMENTO ESTÉTICO

Eu, {{nome_paciente}}, CPF {{cpf}}, {{idade}} anos, declaro que fui informado(a) pela equipe da {{clinica}} sobre o procedimento "{{procedimento}}", a ser conduzido por {{profissional}}.

1. Recebi explicações sobre a técnica, os resultados esperados, o número de sessões e os cuidados antes e depois do procedimento.

2. Fui informado(a) sobre possíveis efeitos temporários, como vermelhidão, inchaço e sensibilidade local, e sobre a importância de seguir as orientações pós-procedimento.

3. Declarei não estar gestante ou lactante e informei alergias e procedimentos anteriores na anamnese estética.

4. O valor do protocolo é de {{valor}}, conforme orçamento aprovado.

Autorizo a realização do procedimento e o registro em prontuário, nos termos da LGPD.

São Paulo, {{data_extenso}}.`,
  },
];

// ---------------------------------------------------------------------
// 4) Pacientes, contatos e conversas
// ---------------------------------------------------------------------
async function ensurePatients(ctx: Ctx) {
  for (const [i, p] of D.PATIENTS.entries()) {
    const cpf = fakeCpf(p.name);
    const phone = fakePhone(p.name, p.city);
    const created = T(p.created);
    let row = await prisma.patient.findUnique({ where: { companyId_cpf: { companyId: ctx.companyId, cpf } } });
    const by = actor(ctx, p.by);
    const notes = [
      `Profissão: ${p.job} · Estado civil: ${p.marital}`,
      `Contato de emergência: ${p.emergency}`,
      p.extra,
    ].filter(Boolean).join('\n');
    if (!row) {
      row = await prisma.patient.create({
        data: {
          companyId: ctx.companyId, createdById: by.id, name: p.name, cpf, birthDate: new Date(`${p.birth}T12:00:00Z`), gender: p.gender,
          phone, whatsapp: phone, email: `${slug(p.name)}@example.com`, origin: p.origin, status: p.status ?? 'ACTIVE',
          address: p.address, city: p.city, state: p.state, zipCode: p.zip, insurance: p.insurance ?? 'Particular',
          insuranceNumber: p.insuranceNumber ?? null, notes, createdAt: created,
        },
      });
      bump(ctx, 'patients');
      // Mesmo rastro que POST /api/patients deixa.
      await prisma.timelineEvent.create({ data: { patientId: row.id, userId: by.id, type: 'STATUS_CHANGE', title: 'Paciente criado', content: `Paciente ${p.name} foi cadastrado por ${by.name}`, createdAt: created } });
      await audit(ctx, by, 'CREATE', 'PATIENT', row.id, { name: p.name, cpf, status: row.status }, created);
      for (const [k, tagName] of p.tags.entries()) {
        await prisma.patientTag.create({ data: { patientId: row.id, tagId: ctx.tags[tagName], createdAt: addMin(created, 2 + k) } });
        await audit(ctx, by, 'ADD_TAG', 'PATIENT', row.id, { tag: tagName }, addMin(created, 2 + k));
      }
    }
    ctx.patients[p.key] = row;
  }
}

async function ensureConversations(ctx: Ctx) {
  // Contatos: pacientes que conversam + leads (ainda sem ficha).
    const contactFor = async (who: string, channel: 'WHATSAPP' | 'INSTAGRAM') => {
    if (ctx.contacts[who]) return ctx.contacts[who];
    const isLead = who.startsWith('L');
    const lead = isLead ? D.LEADS.find((l) => l.key === who)! : null;
    const pat = isLead ? null : ctx.patients[who];
    const name = lead?.name ?? pat.name;
    const phone = isLead ? (channel === 'WHATSAPP' ? '55' + fakePhone(lead!.name) : null) : '55' + pat.phone;
    const externalId = channel === 'WHATSAPP' ? phone! : `demo-ig-${slug(name)}`;
    const ident = await prisma.contactIdentity.findUnique({ where: { companyId_channel_externalId: { companyId: ctx.companyId, channel, externalId } } });
    if (ident) { ctx.contacts[who] = ident.contactId; return ident.contactId; }
    const created = lead ? T(lead.created) : T(D.PATIENTS.find((p) => p.key === who)!.created);
    const c = await prisma.contact.create({
      data: {
        companyId: ctx.companyId, name, nameSource: isLead ? 'CHANNEL' : 'MANUAL', phone, email: pat?.email ?? null, patientId: pat?.id ?? null, createdAt: created,
        identities: { create: { companyId: ctx.companyId, channel, externalId, handle: null } },
      },
    });
    bump(ctx, 'contacts');
    const tagName = channel === 'INSTAGRAM' ? 'Lead Instagram' : null;
    if (tagName) await prisma.contactTag.create({ data: { contactId: c.id, tagId: ctx.tags[tagName] } });
    ctx.contacts[who] = c.id;
    return c.id;
  };

  for (const conv of D.CONVERSATIONS) {
    const contactId = await contactFor(conv.who, conv.channel);
    let row = await prisma.conversation.findFirst({ where: { companyId: ctx.companyId, contactId, channel: conv.channel, deletedAt: null } });
    if (row) continue;
    const last = conv.msgs[conv.msgs.length - 1];
    row = await prisma.conversation.create({
      data: {
        companyId: ctx.companyId, channel: conv.channel, accountId: null, contactId, status: conv.status ?? 'OPEN',
        lastMessage: last[1], lastMessageAt: T(last[2]), unreadCount: conv.unread ?? 0,
        entryPoint: (conv.entry as any) ?? 'DIRECT', createdAt: T(conv.msgs[0][2]),
      },
    });
    bump(ctx, 'conversations');
    for (const [dir, text, at, by] of conv.msgs) {
      const when = T(at);
      const out = dir === 'out';
      await prisma.message.create({
        data: {
          companyId: ctx.companyId, conversationId: row.id, channel: conv.channel, accountId: null,
          source: out ? 'CRM' : 'CONTACT', externalId: null, content: text, direction: out ? 'OUTGOING' : 'INCOMING',
          status: out ? 'DELIVERED' : 'RECEIVED', messageType: 'TEXT', sentAt: when, deliveredAt: out ? addMin(when, 1) : null,
          readAt: out ? addMin(when, 4) : null, createdByUserId: out ? actor(ctx, by!).id : null,
          entryPoint: !out && conv.msgs[0][2] === at ? ((conv.entry as any) ?? 'DIRECT') : null, createdAt: when, updatedAt: when,
        },
      });
      bump(ctx, 'messages');
    }
  }
}

// ---------------------------------------------------------------------
// 5) CRM
// ---------------------------------------------------------------------
async function ensureDeals(ctx: Ctx) {
  for (const d of D.DEALS) {
    const existing = await prisma.deal.findFirst({ where: { companyId: ctx.companyId, title: d.title, deletedAt: null } });
    if (existing) { ctx.deals[d.title] = existing.id; ctx.dealByWho[d.who] = existing.id; continue; }
    const stage = ctx.stages[d.stage];
    if (!stage) throw new Error(`Etapa inexistente no pipeline: ${d.stage}`);
    const isLead = d.who.startsWith('L');
    const patient = isLead ? null : ctx.patients[d.who];
    const statusByStage: Record<string, string> = {
      'Lead novo': 'NEW', 'Contato iniciado': 'CONTACTED', 'Em negociação': 'IN_NEGOTIATION', 'Consulta agendada': 'APPOINTMENT_SCHEDULED',
      'Compareceu': 'APPOINTMENT_ATTENDED', 'Orçamento enviado': 'QUOTE_SENT', 'Fechado': 'WON', 'Perdido': 'LOST',
    };
    const created = T(d.created);
    const owner = actor(ctx, d.owner);
    const deal = await prisma.deal.create({
      data: {
        companyId: ctx.companyId, pipelineId: ctx.pipelineId, stageId: stage.id, title: d.title,
        description: `${d.description}\nOrigem: ${d.originLabel}.`, valueEstimated: d.value, priority: d.priority ?? 'MEDIUM',
        status: statusByStage[d.stage] as any, source: d.source, patientId: patient?.id ?? null, contactId: ctx.contacts[d.who] ?? null,
        responsibleUserId: owner.id, lossReasonId: d.lossReason ? ctx.lossReasons[d.lossReason] : null,
        nextFollowUpAt: d.nextFollowUp ? T(d.nextFollowUp) : null, lastContactAt: d.lastContact ? T(d.lastContact) : null,
        wonAt: d.stage === 'Fechado' ? T(d.closedAt!) : null, lostAt: d.stage === 'Perdido' ? T(d.closedAt!) : null, createdAt: created,
      },
    });
    bump(ctx, 'deals');
    ctx.deals[d.title] = deal.id; ctx.dealByWho[d.who] = deal.id;
    // Histórico no mesmo formato das rotas (create + move).
    await prisma.dealActivity.create({ data: { companyId: ctx.companyId, dealId: deal.id, authorId: owner.id, type: 'CREATED', title: 'Deal criado', description: `Deal "${d.title}" criado por ${owner.name}`, createdAt: created } });
    for (const [stageName, at] of d.path) {
      const loss = stageName === 'Perdido' && d.lossReason ? ` — motivo: ${d.lossReason}` : '';
      await prisma.dealActivity.create({ data: { companyId: ctx.companyId, dealId: deal.id, authorId: owner.id, type: 'MOVED_STAGE', title: 'Etapa alterada', description: `Deal movido para "${stageName}" por ${owner.name}${loss}`, createdAt: T(at) } });
    }
    if (d.nextFollowUp) {
      await prisma.dealActivity.create({ data: { companyId: ctx.companyId, dealId: deal.id, authorId: owner.id, type: 'FOLLOW_UP_CREATED', title: 'Follow-up agendado', description: `Próximo contato em ${T(d.nextFollowUp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}`, createdAt: T(d.lastContact ?? d.created) } });
    }
  }
}

// ---------------------------------------------------------------------
// 6) Agenda + telemedicina
// ---------------------------------------------------------------------
async function ensureAppointments(ctx: Ctx) {
  const now = new Date();
  for (const [pk, prof, type, when, dur, status, notes, tele] of D.APPOINTMENTS) {
    const patient = ctx.patients[pk];
    const startAt = T(when, { weekday: true });
    const key = `${pk}|${startAt.toISOString()}`;
    let appt = await prisma.appointment.findFirst({ where: { companyId: ctx.companyId, patientId: patient.id, startAt, deletedAt: null } });
    if (!appt) {
      const p = D.PATIENTS.find((x) => x.key === pk)!;
      // Agendado entre o cadastro do paciente e a data da consulta (cronologia coerente).
      const pCreated = T(p.created);
      const bookedAt = new Date(Math.min(startAt.getTime() - 26 * 3600_000, Math.max(pCreated.getTime() + 25 * 60_000, startAt.getTime() - 9 * DAY)));
      const createdAt = bookedAt < pCreated ? addMin(pCreated, 10) : bookedAt;
      const by = p.by === 'DIE' && createdAt.getTime() - pCreated.getTime() < 3 * DAY ? actor(ctx, 'DIE') : actor(ctx, 'JES');
      const dealId = ctx.dealByWho[pk] ?? null;
      appt = await prisma.appointment.create({
        data: {
          companyId: ctx.companyId, patientId: patient.id, professionalId: ctx.profs[prof].id, specialtyId: ctx.specialties[D.SPEC_OF[prof]],
          type, status, startAt, endAt: addMin(startAt, dur), durationMinutes: dur, source: ctx.contacts[pk] ? 'WHATSAPP' : 'AGENDA', notes: notes ?? null,
          createdById: by.id, dealId, modality: tele ? 'TELEMEDICINA' : 'PRESENCIAL',
          roomId: tele ? ctx.rooms['Sala Telemedicina'] : ctx.rooms[D.ROOM_OF[prof]],
          confirmedAt: ['CONFIRMED', 'ATTENDED'].includes(status) ? new Date(Math.min(startAt.getTime() - 18 * 3600_000, now.getTime())) : null,
          attendedAt: status === 'ATTENDED' ? addMin(startAt, dur) : null,
          noShowAt: status === 'NO_SHOW' ? addMin(startAt, 30) : null,
          canceledAt: status === 'CANCELED' ? addMin(startAt, -20 * 60) : null,
          cancellationReason: status === 'CANCELED' ? notes ?? 'Cancelado pelo paciente' : null,
          createdAt,
        },
      });
      bump(ctx, 'appointments');
      // Histórico de status, como a rota /operations grava a cada ação.
      const hist: [string, Date, string | null][] = [];
      if (status === 'CONFIRMED' || status === 'ATTENDED') hist.push(['CONFIRMED', appt.confirmedAt!, null]);
      if (status === 'ATTENDED') hist.push(['ATTENDED', appt.attendedAt!, null]);
      if (status === 'NO_SHOW') hist.push(['NO_SHOW', appt.noShowAt!, null]);
      if (status === 'CANCELED') hist.push(['CANCELED', appt.canceledAt!, appt.cancellationReason]);
      if (status === 'RESCHEDULED') hist.push(['RESCHEDULED', addMin(createdAt, 60 * 24), notes ?? null]);
      for (const [s, at, n] of hist) {
        await prisma.appointmentStatusHistory.create({ data: { appointmentId: appt.id, status: s as any, changedById: by.id, notes: n, createdAt: at } });
      }
      if (tele) await ensureTeleSession(ctx, appt, prof, status);
    }
    ctx.appts.set(key, appt);
  }
}

async function ensureTeleSession(ctx: Ctx, appt: any, profKey: string, apptStatus: string) {
  const prof = ctx.profs[profKey];
  const createdBy = ctx.users[profKey] ?? ctx.owner;
  const patient = Object.values(ctx.patients).find((p: any) => p.id === appt.patientId);
  // Mesmo caminho do provisionamento real (sala Jitsi por URL, sem chamada externa).
  // O envio de link por WhatsApp (notify) é deliberadamente NÃO chamado aqui.
  const session = await createSessionForAppointment(appt, createdBy.id, patient.name, prof.name);
  bump(ctx, 'teleSessions');
  const tev = (event: string, at: Date, extra: any = {}) =>
    prisma.telemedicineAuditLog.create({ data: { companyId: ctx.companyId, sessionId: session.id, event, actorRole: extra.role ?? 'DOCTOR', actorId: extra.id ?? createdBy.id, actorName: extra.name ?? prof.name, createdAt: at } });
  await prisma.telemedicineAuditLog.updateMany({ where: { sessionId: session.id, event: 'SESSION_CREATED' }, data: { createdAt: appt.createdAt } });

  if (apptStatus === 'ATTENDED') {
    const s = appt.startAt as Date;
    const patientJoinedAt = addMin(s, -3), doctorJoinedAt = addMin(s, -1), startedAt = addMin(s, 1);
    const endedAt = addMin(startedAt, appt.durationMinutes - 6);
    await prisma.telemedicineSession.update({
      where: { id: session.id },
      data: { status: 'FINALIZADA', patientJoinedAt, doctorJoinedAt, startedAt, endedAt, durationSeconds: Math.round((endedAt.getTime() - startedAt.getTime()) / 1000) },
    });
    await prisma.telemedicineConsent.updateMany({ where: { sessionId: session.id }, data: { accepted: true, acceptedAt: addMin(s, -4), ipAddress: '0.0.0.0', userAgent: 'demo' } });
    await prisma.telemedicineParticipant.updateMany({ where: { sessionId: session.id, role: 'PATIENT' }, data: { joinedAt: patientJoinedAt, leftAt: endedAt } });
    await prisma.telemedicineParticipant.updateMany({ where: { sessionId: session.id, role: 'DOCTOR' }, data: { joinedAt: doctorJoinedAt, leftAt: endedAt } });
    await tev('CONSENT_ACCEPTED', addMin(s, -4), { role: 'PATIENT', id: null, name: patient.name });
    await tev('PATIENT_JOINED', patientJoinedAt, { role: 'PATIENT', id: null, name: patient.name });
    await tev('DOCTOR_JOINED', doctorJoinedAt);
    await tev('STATUS_EM_ATENDIMENTO', startedAt);
    await tev('STATUS_FINALIZADA', endedAt);
    await audit(ctx, createdBy, 'UPDATE_STATUS', 'TELECONSULTATION', session.id, { status: 'FINALIZADA' }, endedAt, { status: 'EM_ATENDIMENTO' });
  } else if (apptStatus === 'CANCELED') {
    await prisma.telemedicineSession.update({ where: { id: session.id }, data: { status: 'CANCELADA', canceledAt: appt.canceledAt, cancelReason: appt.cancellationReason } });
    await tev('STATUS_CANCELADA', appt.canceledAt, { role: 'GUEST', id: ctx.users.JES.id, name: ctx.users.JES.name });
    await audit(ctx, ctx.users.JES, 'UPDATE_STATUS', 'TELECONSULTATION', session.id, { status: 'CANCELADA' }, appt.canceledAt, { status: 'AGENDADA' });
  }
}

// ---------------------------------------------------------------------
// 7) Orçamentos, contratos e assinatura
// ---------------------------------------------------------------------
async function ensureQuotes(ctx: Ctx) {
  for (const q of D.QUOTES) {
    const patient = ctx.patients[q.patient];
    const existing = await prisma.clinicalQuote.findFirst({ where: { companyId: ctx.companyId, patientId: patient.id, title: q.title, deletedAt: null } });
    if (existing) { ctx.quotes[q.key] = existing; continue; }
    const items = q.items.map(([desc, qty, price]) => {
      const unit = price ?? D.SERVICES[desc];
      if (unit == null) throw new Error(`Serviço sem preço: ${desc}`);
      return { description: desc, quantity: qty, unitPrice: unit, total: qty * unit };
    });
    // Mesma conta da API: subtotal = Σ itens; total = max(0, subtotal - desconto).
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const discount = q.discount ?? 0;
    const total = Math.max(0, subtotal - discount);
    const created = T(q.created);
    const by = actor(ctx, q.by);
    const quote = await prisma.clinicalQuote.create({
      data: {
        companyId: ctx.companyId, patientId: patient.id, title: q.title, status: q.status, discount, subtotal, total,
        validUntil: addMin(created, (q.validDays ?? 15) * 1440), notes: q.notes ?? null, createdById: by.id,
        sentAt: q.sentAt ? T(q.sentAt) : null, approvedAt: q.status === 'APPROVED' ? T(q.decidedAt!) : null,
        rejectedAt: q.status === 'REJECTED' ? T(q.decidedAt!) : null, createdAt: created,
        items: { create: items.map((i) => ({ ...i, companyId: ctx.companyId, createdAt: created })) },
      },
    });
    bump(ctx, 'quotes');
    ctx.quotes[q.key] = quote;
    await audit(ctx, by, 'CREATE', 'QUOTE', quote.id, { patientId: patient.id, title: q.title, total }, created);
    if (q.sentAt) await audit(ctx, by, 'UPDATE', 'QUOTE', quote.id, { status: 'SENT' }, T(q.sentAt), { status: 'DRAFT' });
    if (q.decidedAt) await audit(ctx, by, 'UPDATE', 'QUOTE', quote.id, { status: q.status }, T(q.decidedAt), { status: 'SENT' });
  }
}

async function ensureContracts(ctx: Ctx) {
  const tplRows = await prisma.contractTemplate.findMany({ where: { companyId: ctx.companyId, deletedAt: null } });
  for (const c of D.CONTRACTS) {
    const quote = ctx.quotes[c.quote];
    const qSeed = D.QUOTES.find((x) => x.key === c.quote)!;
    const pSeed = D.PATIENTS.find((x) => x.key === qSeed.patient)!;
    const patient = ctx.patients[qSeed.patient];
    const tplDef = CONTRACT_TEMPLATES.find((t) => t.key === c.tpl)!;
    const tpl = tplRows.find((t) => t.name === tplDef.name)!;
    const title = `${tplDef.titlePrefix} — ${qSeed.title}`;
    let row = await prisma.patientContract.findFirst({ where: { companyId: ctx.companyId, patientId: patient.id, title, deletedAt: null } });
    if (!row) {
      const created = T(c.created);
      const by = actor(ctx, c.by);
      // Variáveis e renderização pelas MESMAS funções da tela de contratos.
      const vars = buildContractVariables(
        { name: patient.name, cpf: patient.cpf, birthDate: patient.birthDate, gender: patient.gender, phone: patient.phone, whatsapp: patient.whatsapp, email: patient.email, address: patient.address, city: patient.city, state: patient.state, zipCode: patient.zipCode, insurance: patient.insurance, insuranceNumber: patient.insuranceNumber },
        { name: ctx.company.name, cnpj: ctx.company.cnpj, address: ctx.company.address, phone: ctx.company.phone, email: ctx.company.email },
        { procedure: qSeed.title, value: quote.total, professional: ctx.profs[c.prof].name },
        created,
      );
      const content = renderContractContent(tpl.content, vars);
      row = await prisma.patientContract.create({
        data: {
          companyId: ctx.companyId, patientId: patient.id, templateId: tpl.id, title, content, variables: vars, value: quote.total,
          // Presencial assina direto do rascunho (sem link); remoto/aguardando passa por SENT.
          status: 'sentAt' in c && c.sentAt ? 'SENT' : 'DRAFT', createdById: by.id, createdAt: created,
          sentAt: 'sentAt' in c && c.sentAt ? T(c.sentAt) : null,
          viewedAt: 'viewedAt' in c && c.viewedAt ? T(c.viewedAt) : null,
          otpSentTo: c.status === 'SIGNED' && 'method' in c && c.method === 'REMOTE' ? `(11) 9****-${patient.phone.slice(-4)}` : null,
        },
      });
      bump(ctx, 'contracts');
      await audit(ctx, by, 'CREATE', 'CONTRACT', row.id, { patientId: patient.id, title }, created);
      if (c.status === 'SENT') {
        await prisma.timelineEvent.create({ data: { patientId: patient.id, userId: by.id, type: 'WHATSAPP', title: 'Contrato enviado para assinatura', content: `"${title}" enviado para assinatura eletrônica.`, createdAt: row.sentAt! } });
      }
      if (c.status === 'SIGNED') await signContract(ctx, row, patient, pSeed, c as any);
    }
    ctx.contracts[c.quote] = await prisma.patientContract.findUnique({ where: { id: row.id } });
  }
}

/** Espelha lib/contracts/finalize.ts com data retroativa (mesmo PDF, mesmos campos). */
async function signContract(ctx: Ctx, contract: any, patient: any, pSeed: D.PatientSeed, c: { signedAt: string; method: 'IN_PERSON' | 'REMOTE'; by: string; sig: number }) {
  const signedAt = T(c.signedAt);
  const conductedBy = c.method === 'IN_PERSON' ? actor(ctx, c.by) : null;
  const contentHash = contractContentHash(contract.title, contract.content);
  const cpf = formatCpf(patient.cpf);
  const signatureImage = new Uint8Array(readFileSync(join(ASSETS, `sig${c.sig}.png`)));
  const ip = c.method === 'IN_PERSON' ? '10.0.0.24' : '177.0.0.1';
  const userAgent = c.method === 'IN_PERSON' ? 'Tablet da recepção — DOS CLINIC (demonstração)' : 'Navegador do paciente (demonstração)';
  let sigPath: string | null = null; let pdfPath: string | null = null;
  if (REMOTE_SERVICES) {
    const pdf = await buildSignedContractPdf({
      clinicName: ctx.company.name, clinicCnpj: ctx.company.cnpj ? formatCnpj(ctx.company.cnpj) : null, title: contract.title, content: contract.content,
      contractId: contract.id, signatureImage, signerName: patient.name, signerCpf: cpf, signedAt, method: c.method, ip, userAgent, contentHash,
      otpSentTo: contract.otpSentTo, otpVerifiedAt: c.method === 'REMOTE' ? signedAt : null, linkSentAt: contract.sentAt, viewedAt: contract.viewedAt,
      conductedBy: conductedBy?.name ?? null,
    } as any);
    const base = { companyId: ctx.companyId, patientId: patient.id, kind: 'contracts' as const };
    sigPath = (await uploadClinicalFile({ ...base, fileName: `${contract.id}-assinatura.png`, contentType: 'image/png', bytes: signatureImage })).path;
    pdfPath = (await uploadClinicalFile({ ...base, fileName: `${contract.id}-assinado.pdf`, contentType: 'application/pdf', bytes: pdf })).path;
    bump(ctx, 'storageFiles', 2);
  }
  await prisma.patientContract.update({
    where: { id: contract.id },
    data: {
      status: 'SIGNED', signedAt, signMethod: c.method, contentHash, signerName: patient.name, signerCpf: cpf, signerIp: ip, signerUserAgent: userAgent,
      signedByUserId: conductedBy?.id ?? null, signatureImagePath: sigPath, signedPdfPath: pdfPath, otpHash: null, otpExpiresAt: null, signTokenHash: null,
    },
  });
  const how = c.method === 'IN_PERSON' ? `presencialmente (conduzido por ${conductedBy!.name})` : 'pelo link enviado no WhatsApp';
  await prisma.timelineEvent.create({ data: { title: 'Contrato assinado', content: `"${contract.title}" assinado ${how}.`, type: 'DOCUMENT', patientId: patient.id, userId: conductedBy?.id ?? null, createdAt: signedAt } });
  await prisma.auditLog.create({
    data: {
      userId: conductedBy?.id ?? null, userName: conductedBy?.name ?? `Paciente ${patient.name} (link de assinatura)`, action: 'UPDATE_STATUS', entityType: 'CONTRACT',
      entityId: contract.id, oldValues: { status: contract.status }, newValues: { status: 'SIGNED', method: c.method, contentHash }, ipAddress: ip, userAgent, companyId: ctx.companyId, timestamp: signedAt,
    },
  });
  if (c.method === 'REMOTE') {
    await prisma.notificationEvent.create({ data: { title: 'Contrato assinado', message: `${patient.name} assinou "${contract.title}".`, type: 'SUCCESS', userId: contract.createdById, companyId: ctx.companyId, patientId: patient.id, createdAt: signedAt } });
  }
}

// ---------------------------------------------------------------------
// 8) Financeiro — pelos serviços reais, dentro do tenant (RLS)
// ---------------------------------------------------------------------
async function ensureFinance(ctx: Ctx) {
  const fin = actor(ctx, 'REN');
  for (const r of D.RECEIVABLES) {
    const quote = ctx.quotes[r.quote];
    const contract = r.contract ? ctx.contracts[r.quote] : null;
    const qSeed = D.QUOTES.find((x) => x.key === r.quote)!;
    const dealId = ctx.dealByWho[qSeed.patient];
    await withFinanceTenant(ctx.companyId, async (tx) => {
      const exists = await tx.receivable.findFirst({ where: { companyId: ctx.companyId, quoteId: quote.id, deletedAt: null, status: { not: 'CANCELADO' } } });
      if (exists) return;
      const issue = T(r.issue);
      const input = CreateReceivableSchema.parse({
        patientId: quote.patientId, sourceType: contract ? 'CONTRACT' : 'BUDGET', quoteId: quote.id, contractId: contract?.id, dealId,
        categoryId: ctx.revenueCats[r.cat], description: qSeed.title, discountAmount: 0,
        installmentsCount: r.plan.length, firstDueDate: T(`${r.plan[0][0]} 12:00`),
        customInstallments: r.plan.map(([due, amount]) => ({ dueDate: T(`${due} 12:00`), amount })),
        issueDate: issue, notes: contract ? 'Gerada a partir do contrato assinado.' : 'Gerada a partir do orçamento aprovado.',
      });
      const rec = await createReceivable(tx, ctx.companyId, fin.id, input);
      await tx.receivable.update({ where: { id: rec.id }, data: { createdAt: issue } });
      bump(ctx, 'receivables'); bump(ctx, 'installments', rec.installments.length);
      await audit(ctx, fin, 'CREATE', 'RECEIVABLE', rec.id, { patientId: rec.patientId, sourceType: rec.sourceType, quoteId: rec.quoteId, contractId: rec.contractId, finalAmount: decToNumber(rec.finalAmount), installmentsCount: rec.installmentsCount }, issue);
      for (const [num, amount, method, paidAt] of r.pay) {
        const inst = rec.installments.find((i) => i.number === num)!;
        const pay = await registerPayment(tx, ctx.companyId, fin.id, inst.id, RegisterPaymentSchema.parse({ amount, method, paidAt: T(paidAt) }));
        await tx.installmentPayment.update({ where: { id: pay.id }, data: { createdAt: T(paidAt) } });
        bump(ctx, 'payments');
        await audit(ctx, fin, 'SETTLE', 'INSTALLMENT_PAYMENT', pay.id, { installmentId: inst.id, amount, method }, T(paidAt));
      }
    }, { timeout: 60_000 });
  }

  // Atendimentos avulsos faturados pela Agenda (origem ATENDIMENTO).
  for (const [pk, when, amount, description, due, pay] of D.APPT_BILLING) {
    const appt = ctx.appts.get(`${pk}|${T(when, { weekday: true }).toISOString()}`);
    if (!appt || appt.status !== 'ATTENDED') throw new Error(`Faturamento sem atendimento realizado: ${pk} ${when}`);
    await withFinanceTenant(ctx.companyId, async (tx) => {
      if (await tx.receivable.findFirst({ where: { companyId: ctx.companyId, appointmentId: appt.id, deletedAt: null } })) return;
      const by = actor(ctx, 'JES');
      const input = BillAppointmentSchema.parse({
        description, amount, dueDate: T(`${due} 12:00`), categoryId: ctx.revenueCats['Consulta'],
        payment: pay ? { amount, method: pay[0], paidAt: T(pay[1]) } : undefined,
      });
      const { receivable, payment } = await billAppointment(tx, ctx.companyId, by.id, { id: appt.id, patientId: appt.patientId }, input);
      const at = addMin(appt.endAt, 5);
      await tx.receivable.update({ where: { id: receivable.id }, data: { createdAt: at, issueDate: at } });
      bump(ctx, 'receivables'); bump(ctx, 'installments');
      await audit(ctx, by, 'CREATE', 'RECEIVABLE', receivable.id, { patientId: appt.patientId, sourceType: 'APPOINTMENT', appointmentId: appt.id, finalAmount: amount }, at);
      if (payment) {
        await tx.installmentPayment.update({ where: { id: payment.id }, data: { createdAt: T(pay![1]) } });
        bump(ctx, 'payments');
        await audit(ctx, by, 'SETTLE', 'INSTALLMENT_PAYMENT', payment.id, { amount, method: pay![0] }, T(pay![1]));
      }
    }, { timeout: 60_000 });
  }

  // Contas a pagar
  await withFinanceTenant(ctx.companyId, async (tx) => {
    const suppliers: Record<string, string> = {};
    for (const s of D.SUPPLIERS) {
      const row = await tx.supplier.upsert({
        where: { companyId_name: { companyId: ctx.companyId, name: s.name } }, update: {},
        create: { companyId: ctx.companyId, name: s.name, document: s.document, email: s.email, phone: s.phone, notes: s.notes, createdAt: T('2026-09-01 09:00') },
      });
      suppliers[s.name] = row.id;
    }
    const cats = Object.fromEntries((await tx.expenseCategory.findMany({ where: { companyId: ctx.companyId } })).map((c) => [c.name, c.id]));
    const ccs = Object.fromEntries((await tx.costCenter.findMany({ where: { companyId: ctx.companyId } })).map((c) => [c.name, c.id]));
    for (const [description, supplier, cat, cc, amount, issue, due, pay] of D.PAYABLES) {
      if (await tx.payable.findFirst({ where: { companyId: ctx.companyId, description, deletedAt: null } })) continue;
      const p = await createPayable(tx, ctx.companyId, fin.id, CreatePayableSchema.parse({
        supplierId: supplier ? suppliers[supplier] : undefined, categoryId: cats[cat], costCenterId: ccs[cc], description, originalAmount: amount,
        issueDate: T(`${issue} 09:00`), dueDate: T(`${due} 12:00`),
      }));
      await tx.payable.update({ where: { id: p.id }, data: { createdAt: T(`${issue} 09:00`) } });
      bump(ctx, 'payables');
      await audit(ctx, fin, 'CREATE', 'PAYABLE', p.id, { id: p.id, finalAmount: amount }, T(`${issue} 09:00`));
      if (pay) {
        const pp = await registerPayablePayment(tx, ctx.companyId, fin.id, p.id, RegisterPaymentSchema.parse({ amount, method: pay[0], paidAt: T(pay[1]) }));
        await tx.payablePayment.update({ where: { id: pp.id }, data: { createdAt: T(pay[1]) } });
        bump(ctx, 'payablePayments');
        await audit(ctx, fin, 'SETTLE', 'PAYABLE_PAYMENT', pp.id, { payableId: p.id, amount, method: pay[0] }, T(pay[1]));
      }
    }
  }, { timeout: 120_000 });
}

// ---------------------------------------------------------------------
// 9) Clínico: anamneses, prontuário, exames, documentos, imagens
// ---------------------------------------------------------------------
async function ensureClinical(ctx: Ctx) {
  const templates = await prisma.anamnesisTemplate.findMany({ where: { companyId: ctx.companyId, deletedAt: null }, include: { questions: { orderBy: { order: 'asc' } } } });
  for (const [pk, tplKey, title, at, by, status, answers, notes] of D.ANAMNESES) {
    const patient = ctx.patients[pk];
    if (await prisma.patientAnamnesis.findFirst({ where: { companyId: ctx.companyId, patientId: patient.id, title, deletedAt: null } })) continue;
    const tplDef = D.ANAMNESIS_TEMPLATES.find((t) => t.key === tplKey)!;
    const tpl = templates.find((t) => t.name === tplDef.name)!;
    const author = actor(ctx, by);
    const when = T(at);
    const appt = [...ctx.appts.values()].find((a) => a.patientId === patient.id && Math.abs(a.startAt.getTime() - when.getTime()) < 3 * 3600_000);
    const row = await prisma.patientAnamnesis.create({
      data: {
        companyId: ctx.companyId, patientId: patient.id, templateId: tpl.id, appointmentId: appt?.id ?? null, title, notes: notes ?? null, status,
        createdById: author.id, reviewedById: status === 'REVIEWED' ? author.id : null, reviewedAt: status === 'REVIEWED' ? addMin(when, 40) : null, createdAt: when,
        answers: { create: tpl.questions.map((q, i) => ({ companyId: ctx.companyId, questionId: q.id, label: q.label, value: answers[i] ?? '' })) },
      },
    });
    bump(ctx, 'anamneses');
    await audit(ctx, author, 'CREATE', 'ANAMNESIS', row.id, { patientId: patient.id, title, status }, when);
  }

  for (const [pk, prof, type, title, content, at] of D.RECORDS) {
    const patient = ctx.patients[pk];
    if (await prisma.medicalRecord.findFirst({ where: { companyId: ctx.companyId, patientId: patient.id, title, deletedAt: null } })) continue;
    const when = T(at);
    const author = ctx.users[prof] ?? ctx.owner; // esteticista sem login: registro lançado pelo dono
    const appt = [...ctx.appts.values()].find((a) => a.patientId === patient.id && Math.abs(a.startAt.getTime() - when.getTime()) < 3 * 3600_000);
    const tele = appt?.modality === 'TELEMEDICINA' ? await prisma.telemedicineSession.findUnique({ where: { appointmentId: appt.id } }) : null;
    const rec = await prisma.medicalRecord.create({
      data: { companyId: ctx.companyId, patientId: patient.id, type, title, content, professionalId: ctx.profs[prof].id, appointmentId: appt?.id ?? null, teleconsultationId: tele?.id ?? null, createdById: author.id, createdAt: when },
    });
    bump(ctx, 'medicalRecords');
    await audit(ctx, author, 'CREATE', 'MEDICAL_RECORD', rec.id, { patientId: patient.id, type, title }, when);
    if (tele && !tele.medicalRecordId) {
      await prisma.telemedicineSession.update({ where: { id: tele.id }, data: { medicalRecordId: rec.id } });
      await prisma.telemedicineAuditLog.create({ data: { companyId: ctx.companyId, sessionId: tele.id, event: 'RECORD_CREATED', actorRole: 'DOCTOR', actorId: author.id, actorName: author.name, createdAt: when } });
    }
  }

  const catalog = await prisma.examCatalogItem.findMany({ where: { companyId: ctx.companyId } });
  for (const [pk, prof, at, names, indication] of D.EXAM_REQUESTS) {
    const patient = ctx.patients[pk];
    const when = T(at);
    if (await prisma.examRequest.findFirst({ where: { companyId: ctx.companyId, patientId: patient.id, issuedAt: when } })) continue;
    const p = ctx.profs[prof];
    const author = ctx.users[prof] ?? ctx.owner;
    const er = await prisma.examRequest.create({
      data: {
        companyId: ctx.companyId, patientId: patient.id, professionalId: p.id, professionalNameSnapshot: p.name, professionalCrmSnapshot: p.crm,
        patientNameSnapshot: patient.name, patientBirthDateSnapshot: patient.birthDate, clinicalIndication: indication,
        observations: 'Jejum de 8 a 12 horas para os exames de sangue.', origin: 'PATIENT_CHART', issuedAt: when, createdByUserId: author.id, createdAt: when,
        items: { create: names.map((n, i) => { const c = catalog.find((x) => x.name === n); return { name: n, group: c?.group ?? 'Outros exames', subgroup: c?.subgroup ?? null, order: i }; }) },
      },
    });
    bump(ctx, 'examRequests');
    await audit(ctx, author, 'CREATE', 'EXAM_REQUEST', er.id, { patientId: patient.id, items: names.length }, when);
  }

  // Documentos (PDF gerado) e imagens (PNG sintético) — somente com Storage real.
  if (!REMOTE_SERVICES) { console.log('  · Storage indisponível (banco local): documentos/imagens pulados'); return; }
  for (const [pk, category, title, body, at] of D.DOCUMENTS) {
    const patient = ctx.patients[pk];
    if (await prisma.patientDocument.findFirst({ where: { companyId: ctx.companyId, patientId: patient.id, title, deletedAt: null } })) continue;
    const bytes = await demoPdf(title, patient.name, body, T(at));
    const fileName = `${slug(title)}.pdf`;
    const { path } = await uploadClinicalFile({ companyId: ctx.companyId, patientId: patient.id, kind: 'documents', fileName, contentType: 'application/pdf', bytes });
    const by = actor(ctx, 'JES');
    const doc = await prisma.patientDocument.create({ data: { companyId: ctx.companyId, patientId: patient.id, category, title, originalName: fileName, url: path, mimeType: 'application/pdf', size: bytes.length, uploadedBy: by.id, createdAt: T(at) } });
    bump(ctx, 'documents'); bump(ctx, 'storageFiles');
    await audit(ctx, by, 'UPLOAD_ATTACHMENT', 'PATIENT_DOCUMENT', doc.id, { patientId: patient.id, title }, T(at));
  }
  for (const [pk, category, file, description, at] of D.IMAGES) {
    const patient = ctx.patients[pk];
    if (await prisma.patientImage.findFirst({ where: { companyId: ctx.companyId, patientId: patient.id, description, deletedAt: null } })) continue;
    const bytes = new Uint8Array(readFileSync(join(ASSETS, file)));
    const { path } = await uploadClinicalFile({ companyId: ctx.companyId, patientId: patient.id, kind: 'images', fileName: file, contentType: 'image/png', bytes });
    const by = actor(ctx, 'JES');
    const img = await prisma.patientImage.create({ data: { companyId: ctx.companyId, patientId: patient.id, category, description, url: path, mimeType: 'image/png', size: bytes.length, takenAt: T(at), uploadedBy: by.id, createdAt: T(at) } });
    bump(ctx, 'images'); bump(ctx, 'storageFiles');
    await audit(ctx, by, 'UPLOAD_ATTACHMENT', 'PATIENT_IMAGE', img.id, { patientId: patient.id, category }, T(at));
  }
}

async function demoPdf(title: string, patientName: string, body: string, at: Date): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const teal = rgb(0.1, 0.62, 0.51);
  page.drawRectangle({ x: 0, y: 792, width: 595, height: 50, color: teal });
  page.drawText('DOS CLINIC', { x: 40, y: 810, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Clínica Integrada de Saúde e Bem-Estar', { x: 170, y: 812, size: 10, font: reg, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 40, y: 740, width: 515, height: 28, color: rgb(1, 0.95, 0.8), borderColor: rgb(0.88, 0.69, 0), borderWidth: 1 });
  page.drawText('DOCUMENTO DEMONSTRATIVO — DOS CLINIC (dados fictícios)', { x: 52, y: 750, size: 11, font: bold, color: rgb(0.48, 0.36, 0) });
  page.drawText(title, { x: 40, y: 705, size: 16, font: bold });
  page.drawText(`Paciente: ${patientName}`, { x: 40, y: 682, size: 11, font: reg });
  page.drawText(`Data: ${at.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, { x: 40, y: 666, size: 11, font: reg });
  // Quebra de linha simples por largura.
  const words = body.split(' '); let line = ''; let y = 630;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (reg.widthOfTextAtSize(test, 11) > 515) { page.drawText(line, { x: 40, y, size: 11, font: reg }); y -= 16; line = w; } else line = test;
  }
  if (line) page.drawText(line, { x: 40, y, size: 11, font: reg });
  page.drawText('Documento gerado para demonstração do sistema Boot Clinic. Sem validade clínica ou jurídica.', { x: 40, y: 50, size: 8, font: reg, color: rgb(0.4, 0.4, 0.4) });
  return pdf.save();
}

// ---------------------------------------------------------------------
// 10) Tarefas, timeline, notificações, logo
// ---------------------------------------------------------------------
async function ensureTasks(ctx: Ctx) {
  for (const [title, description, type, category, priority, status, due, who, created, pk, dealTitle, completedAt] of D.TASKS) {
    if (await prisma.followUpTask.findFirst({ where: { companyId: ctx.companyId, title, deletedAt: null } })) continue;
    const assignee = actor(ctx, who);
    const creator = actor(ctx, ['AND', 'LAR'].includes(who) ? who : who === 'REN' ? 'OWNER' : 'JES');
    const createdAt = T(created);
    const t = await prisma.followUpTask.create({
      data: {
        companyId: ctx.companyId, title, description, type, category, priority, status, dueDate: T(due), assignedToId: assignee.id, createdById: creator.id,
        patientId: pk ? ctx.patients[pk].id : null, dealId: dealTitle ? ctx.deals[dealTitle] ?? null : null,
        completedAt: status === 'COMPLETED' ? T(completedAt!) : null, completedById: status === 'COMPLETED' ? assignee.id : null,
        canceledAt: status === 'CANCELED' ? T(due) : null, canceledReason: status === 'CANCELED' ? 'Lead sem retorno após 3 tentativas.' : null,
        isRecurring: title.startsWith('Calibrar') || title.startsWith('Conferir pagamentos'),
        recurrenceType: title.startsWith('Calibrar') ? 'MONTHLY' : title.startsWith('Conferir pagamentos') ? 'WEEKLY' : null,
        recurrenceEvery: title.startsWith('Calibrar') || title.startsWith('Conferir pagamentos') ? 1 : null,
        createdAt,
      },
    });
    bump(ctx, 'tasks');
    await audit(ctx, creator, 'CREATE', 'FOLLOW_UP_TASK', t.id, { title, assignedToId: assignee.id, dueDate: t.dueDate }, createdAt);
    if (t.dealId) {
      await prisma.dealActivity.create({ data: { companyId: ctx.companyId, dealId: t.dealId, authorId: creator.id, type: 'TASK_CREATED', title: 'Tarefa criada', description: title, createdAt } });
      if (status === 'COMPLETED') await prisma.dealActivity.create({ data: { companyId: ctx.companyId, dealId: t.dealId, authorId: assignee.id, type: 'TASK_COMPLETED', title: 'Tarefa concluída', description: title, createdAt: T(completedAt!) } });
    }
  }
}

async function ensureTimelineAndNotifications(ctx: Ctx) {
  for (const [pk, type, title, content, at, who] of D.TIMELINE) {
    const patient = ctx.patients[pk];
    const when = T(at);
    if (await prisma.timelineEvent.findFirst({ where: { patientId: patient.id, title, createdAt: when } })) continue;
    await prisma.timelineEvent.create({ data: { patientId: patient.id, userId: actor(ctx, who).id, type: type as any, title, content, createdAt: when } });
    bump(ctx, 'timelineNotes');
  }
  for (const [title, message, type, at] of D.NOTIFICATIONS) {
    if (await prisma.notificationEvent.findFirst({ where: { companyId: ctx.companyId, userId: ctx.owner.id, title, createdAt: T(at) } })) continue;
    await prisma.notificationEvent.create({ data: { companyId: ctx.companyId, userId: ctx.owner.id, title, message, type, isRead: T(at) < T('2026-10-04 00:00'), createdAt: T(at) } });
  }
}

async function ensureLogo(ctx: Ctx) {
  if (!REMOTE_SERVICES) return;
  const c = await prisma.company.findUnique({ where: { id: ctx.companyId }, select: { logo: true } });
  if (c?.logo) return;
  const bytes = new Uint8Array(readFileSync(join(ASSETS, 'logo.png')));
  const { url } = await uploadCompanyLogo({ companyId: ctx.companyId, fileName: 'dos-clinic-logo.png', contentType: 'image/png', bytes });
  await prisma.company.update({ where: { id: ctx.companyId }, data: { logo: url } });
  bump(ctx, 'storageFiles');
}

// ---------------------------------------------------------------------
// Reset controlado (somente DOS CLINIC)
// ---------------------------------------------------------------------
async function resetDemo(companyId: string, ownerId: string | null) {
  console.log(`\n⚠  RESET dos dados da DOS CLINIC (${companyId})`);
  const cid = companyId;
  const patientIds = (await prisma.patient.findMany({ where: { companyId: cid }, select: { id: true } })).map((p) => p.id);
  const apptIds = (await prisma.appointment.findMany({ where: { companyId: cid }, select: { id: true } })).map((a) => a.id);
  const contactIds = (await prisma.contact.findMany({ where: { companyId: cid }, select: { id: true } })).map((c) => c.id);
  await withFinanceTenant(cid, async (tx) => {
    await tx.installmentPayment.deleteMany({ where: { companyId: cid } });
    await tx.receivableInstallment.deleteMany({ where: { companyId: cid } });
    await tx.receivable.deleteMany({ where: { companyId: cid } });
    await tx.payablePayment.deleteMany({ where: { companyId: cid } });
    await tx.payable.deleteMany({ where: { companyId: cid } });
    await tx.supplier.deleteMany({ where: { companyId: cid } });
    await tx.revenueCategory.deleteMany({ where: { companyId: cid } });
    await tx.expenseCategory.deleteMany({ where: { companyId: cid } });
    await tx.costCenter.deleteMany({ where: { companyId: cid } });
  }, { timeout: 120_000 });
  const del = async (label: string, p: Promise<{ count: number }>) => { const r = await p; if (r.count) console.log(`  - ${label}: ${r.count}`); };
  await del('telemedicina', prisma.telemedicineSession.deleteMany({ where: { companyId: cid } }));
  await del('status de agenda', prisma.appointmentStatusHistory.deleteMany({ where: { appointmentId: { in: apptIds } } }));
  await del('lembretes', prisma.appointmentReminder.deleteMany({ where: { appointmentId: { in: apptIds } } }));
  await del('agendamentos', prisma.appointment.deleteMany({ where: { companyId: cid } }));
  await del('mensagens', prisma.message.deleteMany({ where: { companyId: cid } }));
  await del('conversas', prisma.conversation.deleteMany({ where: { companyId: cid } }));
  await del('tags de contato', prisma.contactTag.deleteMany({ where: { contactId: { in: contactIds } } }));
  await del('contatos', prisma.contact.deleteMany({ where: { companyId: cid } }));
  await del('tarefas', prisma.followUpTask.deleteMany({ where: { companyId: cid } }));
  await del('atividades CRM', prisma.dealActivity.deleteMany({ where: { companyId: cid } }));
  await del('oportunidades', prisma.deal.deleteMany({ where: { companyId: cid } }));
  await del('etapas', prisma.pipelineStage.deleteMany({ where: { companyId: cid } }));
  await del('pipelines', prisma.pipeline.deleteMany({ where: { companyId: cid } }));
  await del('motivos de perda', prisma.dealLossReason.deleteMany({ where: { companyId: cid } }));
  await del('itens de orçamento', prisma.clinicalQuoteItem.deleteMany({ where: { companyId: cid } }));
  await del('orçamentos', prisma.clinicalQuote.deleteMany({ where: { companyId: cid } }));
  await del('contratos', prisma.patientContract.deleteMany({ where: { companyId: cid } }));
  await del('modelos de contrato', prisma.contractTemplate.deleteMany({ where: { companyId: cid } }));
  await del('anamneses', prisma.patientAnamnesis.deleteMany({ where: { companyId: cid } }));
  await del('modelos de anamnese', prisma.anamnesisTemplate.deleteMany({ where: { companyId: cid } }));
  await del('prontuário', prisma.medicalRecord.deleteMany({ where: { companyId: cid } }));
  await del('pedidos de exame', prisma.examRequest.deleteMany({ where: { companyId: cid } }));
  await del('modelos de exame', prisma.examTemplate.deleteMany({ where: { companyId: cid } }));
  await del('catálogo de exames', prisma.examCatalogItem.deleteMany({ where: { companyId: cid } }));
  await del('documentos', prisma.patientDocument.deleteMany({ where: { companyId: cid } }));
  await del('imagens', prisma.patientImage.deleteMany({ where: { companyId: cid } }));
  await del('notificações', prisma.notificationEvent.deleteMany({ where: { companyId: cid } }));
  await del('timeline', prisma.timelineEvent.deleteMany({ where: { patientId: { in: patientIds } } }));
  await del('pacientes', prisma.patient.deleteMany({ where: { companyId: cid } }));
  await del('tags', prisma.tag.deleteMany({ where: { companyId: cid } }));
  await del('respostas rápidas', prisma.quickReply.deleteMany({ where: { companyId: cid } }));
  await del('automações', prisma.automationAction.deleteMany({ where: { companyId: cid } }));
  await prisma.automationTrigger.deleteMany({ where: { companyId: cid } });
  await prisma.automationExecution.deleteMany({ where: { companyId: cid } });
  await prisma.automationRule.deleteMany({ where: { companyId: cid } });
  await del('bloqueios', prisma.scheduleBlock.deleteMany({ where: { companyId: cid } }));
  await del('horários', prisma.professionalSchedule.deleteMany({ where: { companyId: cid } }));
  await del('profissionais', prisma.professional.deleteMany({ where: { companyId: cid } }));
  await del('especialidades', prisma.specialty.deleteMany({ where: { companyId: cid } }));
  await del('salas', prisma.room.deleteMany({ where: { companyId: cid } }));
  await del('auditoria', prisma.auditLog.deleteMany({ where: { companyId: cid } }));
  await del('equipe (sem login)', prisma.user.deleteMany({ where: { companyId: cid, ...(ownerId ? { id: { not: ownerId } } : {}) } }));
  if (REMOTE_SERVICES) {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient()!;
    for (const bucket of ['clinical-media', 'company-logos']) {
      const walk = async (prefix: string): Promise<string[]> => {
        const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
        const out: string[] = [];
        for (const f of data ?? []) {
          const p = `${prefix}/${f.name}`;
          if (f.id) out.push(p); else out.push(...(await walk(p)));
        }
        return out;
      };
      const files = await walk(cid);
      if (files.length) { await admin.storage.from(bucket).remove(files); console.log(`  - storage ${bucket}: ${files.length} arquivo(s)`); }
    }
    await prisma.company.update({ where: { id: cid }, data: { logo: null } });
  }
  console.log('✔ Reset concluído (empresa e dono preservados).');
}

// ---------------------------------------------------------------------
// Verificação (somente leitura)
// ---------------------------------------------------------------------
async function verify(companyId: string) {
  const cid = companyId;
  const problems: string[] = [];
  const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };
  const ids = async (m: any, where: any = {}) => (await m.findMany({ where: { companyId: cid, ...where }, select: { id: true } })).map((x: any) => x.id);
  const patients = new Set<string>(await ids(prisma.patient));
  const users = new Set((await prisma.user.findMany({ where: { companyId: cid }, select: { id: true } })).map((u) => u.id));
  const profs = new Set<string>(await ids(prisma.professional));

  for (const a of await prisma.appointment.findMany({ where: { companyId: cid } })) {
    check(patients.has(a.patientId), `agendamento ${a.id} com paciente fora da clínica`);
    check(profs.has(a.professionalId), `agendamento ${a.id} com profissional fora da clínica`);
    check(users.has(a.createdById), `agendamento ${a.id} com autor fora da clínica`);
  }
  for (const d of await prisma.deal.findMany({ where: { companyId: cid } })) {
    check(users.has(d.responsibleUserId), `deal ${d.id} com responsável inválido`);
    check(!d.patientId || patients.has(d.patientId), `deal ${d.id} com paciente inválido`);
    check(!!d.stageId && !!d.pipelineId, `deal ${d.id} sem etapa/pipeline`);
  }
  for (const q of await prisma.clinicalQuote.findMany({ where: { companyId: cid }, include: { items: true } })) {
    check(patients.has(q.patientId), `orçamento ${q.id} com paciente inválido`);
    const sub = q.items.reduce((s, i) => s + i.total, 0);
    check(Math.abs(sub - q.subtotal) < 0.01 && Math.abs(Math.max(0, sub - q.discount) - q.total) < 0.01, `orçamento ${q.id} com total incoerente`);
  }
  for (const c of await prisma.patientContract.findMany({ where: { companyId: cid } })) check(patients.has(c.patientId), `contrato ${c.id} órfão`);
  for (const t of await prisma.followUpTask.findMany({ where: { companyId: cid } })) {
    check(!t.patientId || patients.has(t.patientId), `tarefa ${t.id} com paciente inválido`);
    check(!t.assignedToId || users.has(t.assignedToId), `tarefa ${t.id} com responsável inválido`);
  }
  for (const r of await prisma.medicalRecord.findMany({ where: { companyId: cid } })) check(patients.has(r.patientId), `prontuário ${r.id} órfão`);
  for (const r of await prisma.patientAnamnesis.findMany({ where: { companyId: cid } })) check(patients.has(r.patientId), `anamnese ${r.id} órfã`);
  for (const cv of await prisma.conversation.findMany({ where: { companyId: cid }, include: { contact: true } })) {
    check(cv.contact.companyId === cid, `conversa ${cv.id} com contato de outra clínica`);
    check(cv.accountId === null, `conversa ${cv.id} ligada a conta de canal (não deveria existir na demo)`);
  }
  check((await prisma.channelAccount.count({ where: { companyId: cid } })) === 0, 'existe ChannelAccount na DOS CLINIC (risco de envio real)');
  // Mensagens de outra empresa apontando para conversas da DOS CLINIC
  const convIds = await ids(prisma.conversation);
  check((await prisma.message.count({ where: { conversationId: { in: convIds }, companyId: { not: cid } } })) === 0, 'mensagem de outra empresa em conversa da DOS CLINIC');

  const fin = await withFinanceTenant(cid, async (tx) => {
    const recs = await tx.receivable.findMany({ where: { companyId: cid }, include: { installments: { include: { payments: true } } } });
    for (const r of recs) {
      check(patients.has(r.patientId), `receita ${r.id} com paciente inválido`);
      if (r.quoteId) check(!!(await prisma.clinicalQuote.findFirst({ where: { id: r.quoteId, companyId: cid, status: 'APPROVED' } })), `receita ${r.id} com orçamento inválido`);
      if (r.contractId) check(!!(await prisma.patientContract.findFirst({ where: { id: r.contractId, companyId: cid, status: 'SIGNED' } })), `receita ${r.id} com contrato inválido`);
      if (r.appointmentId) check(!!(await prisma.appointment.findFirst({ where: { id: r.appointmentId, companyId: cid, status: 'ATTENDED' } })), `receita ${r.id} com atendimento inválido`);
      const sum = r.installments.reduce((s, i) => s + decToNumber(i.amount), 0);
      check(Math.abs(sum - decToNumber(r.finalAmount)) < 0.01, `receita ${r.id}: Σ parcelas ≠ valor final`);
      for (const i of r.installments) {
        const paid = i.payments.filter((p) => !p.reversedAt).reduce((s, p) => s + decToNumber(p.amount), 0);
        check(Math.abs(paid - decToNumber(i.paidAmount)) < 0.01, `parcela ${i.id}: paidAmount incoerente`);
      }
    }
    const pays = await tx.installmentPayment.count({ where: { companyId: cid } });
    const orphanInst = await tx.receivableInstallment.count({ where: { companyId: cid, receivable: { companyId: { not: cid } } } });
    check(orphanInst === 0, 'parcela ligada a receita de outra empresa');
    return { receivables: recs.length, installments: recs.reduce((s, r) => s + r.installments.length, 0), payments: pays };
  });

  // Duplicidades evidentes
  const dupe = async (sql: Prisma.Sql, label: string) => { const r: any[] = await prisma.$queryRaw(sql); check(r.length === 0, `duplicidade: ${label} (${r.length})`); };
  await dupe(Prisma.sql`SELECT "patientId","startAt" FROM appointments WHERE "companyId"=${cid} AND "deletedAt" IS NULL GROUP BY 1,2 HAVING count(*)>1`, 'agendamentos');
  await dupe(Prisma.sql`SELECT title FROM deals WHERE "companyId"=${cid} AND "deletedAt" IS NULL GROUP BY 1 HAVING count(*)>1`, 'oportunidades');
  await dupe(Prisma.sql`SELECT "patientId",title FROM clinical_quotes WHERE "companyId"=${cid} AND "deletedAt" IS NULL GROUP BY 1,2 HAVING count(*)>1`, 'orçamentos');
  await dupe(Prisma.sql`SELECT title FROM follow_up_tasks WHERE "companyId"=${cid} AND "deletedAt" IS NULL GROUP BY 1 HAVING count(*)>1`, 'tarefas');
  check((await prisma.company.count({ where: { name: D.COMPANY.name, deletedAt: null } })) === 1, 'mais de uma empresa DOS CLINIC');

  const count = async (m: any) => m.count({ where: { companyId: cid } });
  const totals = {
    pacientes: await count(prisma.patient), equipe: await count(prisma.user), profissionais: await count(prisma.professional),
    oportunidades: await count(prisma.deal), agendamentos: await count(prisma.appointment), teleconsultas: await count(prisma.telemedicineSession),
    tarefas: await count(prisma.followUpTask), contatos: await count(prisma.contact), conversas: await count(prisma.conversation), mensagens: await count(prisma.message),
    orcamentos: await count(prisma.clinicalQuote), contratos: await count(prisma.patientContract), anamneses: await count(prisma.patientAnamnesis),
    prontuario: await count(prisma.medicalRecord), pedidosExame: await count(prisma.examRequest), documentos: await count(prisma.patientDocument),
    imagens: await count(prisma.patientImage), auditoria: await count(prisma.auditLog), ...fin,
  };
  return { problems, totals };
}

async function printChains(companyId: string, keys: string[]) {
  console.log('\nCadeias Paciente → Orçamento → Contrato → Receita → Parcela → Pagamento');
  await withFinanceTenant(companyId, async (tx) => {
    for (const k of keys) {
      const q = D.QUOTES.find((x) => x.key === k)!;
      const pSeed = D.PATIENTS.find((x) => x.key === q.patient)!;
      const patient = await tx.patient.findFirst({ where: { companyId, name: pSeed.name } });
      const quote = await tx.clinicalQuote.findFirst({ where: { companyId, patientId: patient!.id, title: q.title } });
      const rec = await tx.receivable.findFirst({ where: { companyId, quoteId: quote!.id }, include: { installments: { orderBy: { number: 'asc' }, include: { payments: true } } } });
      const contract = rec?.contractId ? await tx.patientContract.findUnique({ where: { id: rec.contractId } }) : null;
      console.log(`\n• ${patient!.name} (${patient!.id})`);
      console.log(`  Orçamento ${quote!.id} [${quote!.status}] R$ ${quote!.total.toFixed(2)}`);
      console.log(`  Contrato  ${contract?.id ?? '—'} [${contract?.status ?? 'sem contrato'}]${contract?.signedPdfPath ? ' · PDF assinado no Storage' : ''}`);
      console.log(`  Receita   ${rec!.id} [${rec!.status}] origem=${rec!.sourceType} R$ ${decToNumber(rec!.finalAmount).toFixed(2)}`);
      for (const i of rec!.installments) {
        const pays = i.payments.map((p) => `${p.id} ${p.method} R$ ${decToNumber(p.amount).toFixed(2)}`).join(', ') || '—';
        console.log(`    Parcela ${i.number}/${rec!.installmentsCount} ${i.id} venc. ${i.dueDate.toISOString().slice(0, 10)} [${i.status}] R$ ${decToNumber(i.amount).toFixed(2)} · pagamentos: ${pays}`);
      }
    }
  });
}

// ---------------------------------------------------------------------
// main
// ---------------------------------------------------------------------
async function main() {
  console.log('══════════ seed-dos-clinic ══════════');
  console.log(`Banco:     ${dbHost} ${IS_LOCAL ? '(LOCAL)' : '(REMOTO)'}`);
  console.log(`Supabase:  ${REMOTE_SERVICES ? `projeto ${supabaseRef} (Auth + Storage ativos)` : 'desativado (banco local → sem Auth/Storage)'}`);
  console.log(`Âncora:    ${anchor} (deslocamento ${SHIFT} dia(s))`);
  console.log(`Modo:      ${VERIFY_ONLY ? 'verificação (somente leitura)' : RESET ? 'RESET + seed' : 'seed idempotente'}`);
  if (!IS_LOCAL && !YES && !VERIFY_ONLY) {
    console.error('\n✋ Banco REMOTO. Revise o alvo acima e rode novamente com --yes para confirmar.');
    process.exit(1);
  }

  if (VERIFY_ONLY) {
    const c = await findDemoCompany();
    if (!c) throw new Error('DOS CLINIC não encontrada.');
    const { problems, totals } = await verify(c.id);
    console.log(totals);
    console.log(problems.length ? `❌ ${problems.length} problema(s):\n - ${problems.join('\n - ')}` : '✅ Nenhum problema de integridade.');
    await printChains(c.id, ['Q01', 'Q02', 'Q06', 'Q08']);
    return;
  }

  console.log('\n[1] Clínica e dono');
  const company = await ensureCompany();
  if (RESET) {
    if (company.cnpj !== DEMO_CNPJ || company.name !== D.COMPANY.name) throw new Error('Reset recusado: empresa não confere com a demo.');
    const owner = await prisma.user.findUnique({ where: { email: D.OWNER.email } });
    await resetDemo(company.id, owner?.companyId === company.id ? owner.id : null);
  }
  const { user: owner, createdPassword } = await ensureOwner(company.id);

  const ctx: Ctx = {
    companyId: company.id, company, owner: { id: owner.id, name: owner.name }, users: {}, profs: {}, specialties: {}, rooms: {}, tags: {},
    patients: {}, contacts: {}, pipelineId: '', stages: {}, lossReasons: {}, deals: {}, dealByWho: {}, appts: new Map(), quotes: {}, contracts: {},
    revenueCats: {}, stats: {},
  };
  console.log('[2] Equipe, especialidades e salas'); await ensureTeam(ctx);
  console.log('[3] Catálogos'); await ensureCatalogs(ctx);
  console.log('[4] Pacientes'); await ensurePatients(ctx);
  console.log('[5] Contatos e conversas (sem conta de canal)'); await ensureConversations(ctx);
  console.log('[6] CRM'); await ensureDeals(ctx);
  console.log('[7] Agenda e telemedicina'); await ensureAppointments(ctx);
  console.log('[8] Orçamentos'); await ensureQuotes(ctx);
  console.log('[9] Contratos e assinaturas'); await ensureContracts(ctx);
  console.log('[10] Financeiro'); await ensureFinance(ctx);
  console.log('[11] Clínico'); await ensureClinical(ctx);
  console.log('[12] Tarefas e follow-ups'); await ensureTasks(ctx);
  console.log('[13] Timeline e notificações'); await ensureTimelineAndNotifications(ctx);
  console.log('[14] Logo'); await ensureLogo(ctx);

  console.log('\nCriados nesta execução:', Object.keys(ctx.stats).length ? ctx.stats : '(nada — tudo já existia)');
  const { problems, totals } = await verify(company.id);
  console.log('\nTotais da DOS CLINIC:', totals);
  console.log(problems.length ? `❌ ${problems.length} problema(s):\n - ${problems.join('\n - ')}` : '✅ Verificação de integridade: OK');
  await printChains(company.id, ['Q01', 'Q02', 'Q06', 'Q08']);
  console.log(`\nDOS CLINIC: ${company.id}\nDono:       ${D.OWNER.email} → ${owner.id}`);
  if (createdPassword) console.log(`\n🔑 Conta Auth criada para ${D.OWNER.email}. Senha inicial: ${createdPassword}\n   (troque após o primeiro acesso; ela não é gravada em lugar nenhum.)`);
  if (problems.length) process.exitCode = 1;
}

main()
  .catch((e) => { console.error('\n❌ Falhou:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
