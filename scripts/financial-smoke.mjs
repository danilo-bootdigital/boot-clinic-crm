// Smoke COMPLETO do Módulo Financeiro — Fase 1 (Contas a Receber), autônomo.
// Bootstrap de empresa + usuários por papel (OWNER/RECEPTION/DOCTOR/MARKETING/FINANCE)
// via service role → cria paciente + orçamento APPROVED → exercita criação de
// recebível + parcelas, baixa parcial/total, anti-duplicação, estorno, cancelamento,
// RBAC por papel e auditoria. Limpa tudo no fim (tenant-aware por causa do FORCE RLS).
// Uso: BASE_URL=http://localhost:3997 node --env-file=.env scripts/financial-smoke.mjs
globalThis.WebSocket = globalThis.WebSocket || class { close() {} }
import { createServerClient } from '@supabase/ssr'
import { PrismaClient } from '@prisma/client'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.BASE_URL || 'http://localhost:3997'
if (!SERVICE) { console.error('Requer SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const ok = (m) => console.log('  ✅', m)
const fail = (m) => { console.error('  ❌', m); process.exitCode = 1 }
const prisma = new PrismaClient()
const PASS = 'FinSmoke123!'
const PREFIX = 'fin.smoke'

const withTenant = (companyId, fn) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`
    return fn(tx)
  })

function makeClient() {
  const jar = new Map()
  const sb = createServerClient(URL, ANON, { cookies: { getAll: () => Array.from(jar, ([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } })
  const ch = () => Array.from(jar, ([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; ')
  const req = async (method, path, body) => {
    const headers = { Cookie: ch() }
    let payload
    if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
    const res = await fetch(BASE + path, { method, headers, body: payload })
    let json = null; try { json = await res.json() } catch {}
    return { status: res.status, json }
  }
  return { sb, req }
}

async function main() {
  console.log('▶ Financeiro smoke — Fase 1')
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  const company = await prisma.company.create({ data: { name: 'Financeiro Smoke (temp)', status: 'ACTIVE' } })
  const companyId = company.id
  const uids = []

  async function makeUser(role) {
    const email = `${PREFIX}.${role.toLowerCase()}@example.com`
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const old = list.data?.users?.find((u) => u.email?.toLowerCase() === email)
    if (old) await admin.auth.admin.deleteUser(old.id).catch(() => {})
    await prisma.user.deleteMany({ where: { email } }).catch(() => {})
    const created = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
    const uid = created.data.user.id
    uids.push(uid)
    await prisma.user.create({ data: { id: uid, email, name: role, role, companyId } })
    const c = makeClient()
    await c.sb.auth.signInWithPassword({ email, password: PASS })
    return c
  }

  try {
    const owner = await makeUser('OWNER')
    const reception = await makeUser('RECEPTION')
    const doctor = await makeUser('DOCTOR')
    const marketing = await makeUser('MARKETING')

    // Paciente + Orçamento APPROVED (origem da receita).
    const patient = await prisma.patient.create({
      data: { companyId, createdById: uids[0], name: 'Paciente Fin', cpf: '00000000191', birthDate: new Date('1990-01-01'), gender: 'OTHER', phone: '11999990000', origin: 'OTHER' },
    })
    const quote = await prisma.clinicalQuote.create({
      data: { companyId, patientId: patient.id, title: 'Programa estético', status: 'APPROVED', subtotal: 6000, total: 6000, createdById: uids[0], approvedAt: new Date() },
    })

    // 1) OWNER cria recebível 6000 em 3x.
    let r = await owner.req('POST', '/api/financeiro/receivables', {
      patientId: patient.id, quoteId: quote.id, description: 'Programa', originalAmount: 6000, installmentsCount: 3, firstDueDate: '2026-07-01', intervalDays: 30,
    })
    const recId = r.json?.id
    if (r.status === 201 && r.json.installments.length === 3) ok('Recebível criado com 3 parcelas')
    else fail(`Criação falhou (${r.status}) ${JSON.stringify(r.json)}`)
    const sum = (r.json?.installments || []).reduce((s, i) => s + i.amount, 0)
    if (Math.round(sum * 100) === 600000) ok('Σ parcelas = total (6000.00)')
    else fail(`Σ parcelas ≠ total: ${sum}`)

    // 2) Anti-duplicação: mesmo orçamento → 409.
    const dup = await owner.req('POST', '/api/financeiro/receivables', { patientId: patient.id, quoteId: quote.id, description: 'dup', originalAmount: 6000, installmentsCount: 1, firstDueDate: '2026-07-01' })
    if (dup.status === 409) ok('Anti-duplicação por orçamento (409)'); else fail(`Esperava 409, veio ${dup.status}`)

    const inst = r.json.installments
    // 3) RECEPTION baixa parcial na parcela 1.
    let p = await reception.req('POST', `/api/financeiro/installments/${inst[0].id}/payments`, { amount: 1000, method: 'PIX' })
    if (p.status === 201) ok('RECEPTION registra baixa parcial'); else fail(`Baixa parcial falhou ${p.status}`)
    let det = (await owner.req('GET', `/api/financeiro/receivables/${recId}`)).json
    if (det.installments[0].status === 'PARCIAL' && det.status === 'PARCIAL') ok('Status → PARCIAL após baixa parcial')
    else fail(`Status inesperado: parc=${det.installments[0].status} rec=${det.status}`)

    // 4) RECEPTION completa a parcela 1.
    await reception.req('POST', `/api/financeiro/installments/${inst[0].id}/payments`, { amount: 1000, method: 'DINHEIRO' })
    det = (await owner.req('GET', `/api/financeiro/receivables/${recId}`)).json
    if (det.installments[0].status === 'PAGO') ok('Parcela 1 → PAGO ao quitar saldo'); else fail('Parcela 1 não ficou PAGO')

    // 5) RECEPTION NÃO pode estornar nem cancelar.
    const payId = det.installments[0].payments[0].id
    const revR = await reception.req('POST', `/api/financeiro/payments/${payId}/reverse`, { reason: 'x' })
    const canR = await reception.req('POST', `/api/financeiro/receivables/${recId}/cancel`, { reason: 'x' })
    if (revR.status === 403 && canR.status === 403) ok('RECEPTION bloqueada em estorno e cancelamento (403)')
    else fail(`RECEPTION deveria ser 403/403, veio ${revR.status}/${canR.status}`)

    // 6) OWNER estorna o 1º pagamento → parcela volta a PARCIAL.
    const rev = await owner.req('POST', `/api/financeiro/payments/${payId}/reverse`, { reason: 'teste estorno' })
    det = (await owner.req('GET', `/api/financeiro/receivables/${recId}`)).json
    if (rev.status === 200 && det.installments[0].status === 'PARCIAL') ok('OWNER estorna; parcela recalc → PARCIAL')
    else fail(`Estorno/recalc falhou ${rev.status} status=${det.installments[0].status}`)

    // 7) DOCTOR só visualiza; MARKETING sem acesso.
    const docList = await doctor.req('GET', '/api/financeiro/receivables')
    const docCreate = await doctor.req('POST', '/api/financeiro/receivables', { patientId: patient.id, quoteId: quote.id, description: 'x', originalAmount: 1, installmentsCount: 1, firstDueDate: '2026-07-01' })
    if (docList.status === 200 && docCreate.status === 403) ok('DOCTOR vê (200) mas não cria (403)'); else fail(`DOCTOR ${docList.status}/${docCreate.status}`)
    const mkt = await marketing.req('GET', '/api/financeiro/receivables')
    if (mkt.status === 403) ok('MARKETING sem acesso (403)'); else fail(`MARKETING deveria 403, veio ${mkt.status}`)

    // 8) OWNER cancela o recebível.
    const cancel = await owner.req('POST', `/api/financeiro/receivables/${recId}/cancel`, { reason: 'teste' })
    det = (await owner.req('GET', `/api/financeiro/receivables/${recId}`)).json
    if (cancel.status === 200 && det.status === 'CANCELADO') ok('OWNER cancela recebível'); else fail('Cancelamento falhou')

    // 9) Auditoria das ações críticas.
    const audits = await prisma.auditLog.findMany({ where: { companyId, entityType: { in: ['RECEIVABLE', 'INSTALLMENT_PAYMENT'] } }, select: { action: true } })
    const actions = new Set(audits.map((a) => a.action))
    if (['CREATE', 'SETTLE', 'REVERSE', 'CANCEL'].every((a) => actions.has(a))) ok('AuditLog cobre CREATE/SETTLE/REVERSE/CANCEL')
    else fail(`Auditoria incompleta: ${[...actions].join(',')}`)
  } finally {
    // cleanup tenant-aware (FORCE RLS bloqueia delete sem GUC).
    await withTenant(companyId, async (tx) => {
      const recs = await tx.receivable.findMany({ where: { companyId }, select: { id: true } })
      for (const rec of recs) await tx.receivable.delete({ where: { id: rec.id } }).catch(() => {})
      await tx.revenueCategory.deleteMany({ where: { companyId } }).catch(() => {})
    }).catch(() => {})
    await prisma.auditLog.deleteMany({ where: { companyId } }).catch(() => {})
    await prisma.clinicalQuote.deleteMany({ where: { companyId } }).catch(() => {})
    await prisma.patient.deleteMany({ where: { companyId } }).catch(() => {})
    await prisma.user.deleteMany({ where: { companyId } }).catch(() => {})
    await prisma.company.delete({ where: { id: companyId } }).catch(() => {})
    for (const uid of uids) await admin.auth.admin.deleteUser(uid).catch(() => {})
    await prisma.$disconnect()
  }
  console.log(process.exitCode ? '✖ Smoke com falhas' : '✔ Smoke concluído')
}
main().catch((e) => { console.error(e); process.exit(1) })
