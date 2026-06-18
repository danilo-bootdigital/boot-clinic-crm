// Smoke do Contas a Pagar (Fase 2), autônomo. Bootstrap empresa + usuários por
// papel → cria fornecedor + despesa → baixa parcial/total, RBAC (RECEPTION 403),
// estorno, cancelar-bloqueado-se-pago, auditoria. Limpa tudo (tenant-aware).
// Uso: BASE_URL=http://localhost:3997 node --env-file=.env scripts/financial-payables-smoke.mjs
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
const PASS = 'PaySmoke123!'
const PREFIX = 'pay.smoke'

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
  console.log('▶ Contas a Pagar smoke — Fase 2')
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  const company = await prisma.company.create({ data: { name: 'Pagar Smoke (temp)', status: 'ACTIVE' } })
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

    // RBAC: RECEPTION não acessa Contas a Pagar.
    const recList = await reception.req('GET', '/api/financeiro/payables')
    if (recList.status === 403) ok('RECEPTION sem acesso a Contas a Pagar (403)'); else fail(`RECEPTION deveria 403, veio ${recList.status}`)

    // Fornecedor + despesa 1000 (OWNER).
    const sup = await owner.req('POST', '/api/financeiro/suppliers', { name: 'Fornecedor Teste' })
    if (sup.status === 201) ok('Fornecedor criado'); else fail(`Fornecedor ${sup.status}`)
    const pay = await owner.req('POST', '/api/financeiro/payables', { supplierId: sup.json.id, description: 'Aluguel', originalAmount: 1000, dueDate: '2026-07-10' })
    const payId = pay.json?.id
    if (pay.status === 201 && pay.json.finalAmount === 1000) ok('Despesa criada (R$1000)'); else fail(`Despesa ${pay.status} ${JSON.stringify(pay.json)}`)

    // Baixa parcial → PARCIAL.
    await owner.req('POST', `/api/financeiro/payables/${payId}/payments`, { amount: 400, method: 'TRANSFERENCIA' })
    let det = (await owner.req('GET', `/api/financeiro/payables/${payId}`)).json
    if (det.status === 'PARCIAL' && det.paidAmount === 400) ok('Baixa parcial → PARCIAL'); else fail(`PARCIAL falhou: ${det.status}/${det.paidAmount}`)

    // Cancelar com pagamento → bloqueado.
    const cancelBlocked = await owner.req('POST', `/api/financeiro/payables/${payId}/cancel`, { reason: 'x' })
    if (cancelBlocked.status === 409) ok('Cancelar com pagamento bloqueado (409)'); else fail(`Esperava 409, veio ${cancelBlocked.status}`)

    // Estorna o pagamento → volta PENDENTE.
    const paymentId = det.payments[0].id
    const rev = await owner.req('POST', `/api/financeiro/payable-payments/${paymentId}/reverse`, { reason: 'teste' })
    det = (await owner.req('GET', `/api/financeiro/payables/${payId}`)).json
    if (rev.status === 200 && det.status === 'PENDENTE' && det.paidAmount === 0) ok('Estorno → PENDENTE'); else fail(`Estorno falhou: ${rev.status}/${det.status}`)

    // Baixa total → PAGO.
    await owner.req('POST', `/api/financeiro/payables/${payId}/payments`, { amount: 1000, method: 'PIX' })
    det = (await owner.req('GET', `/api/financeiro/payables/${payId}`)).json
    if (det.status === 'PAGO') ok('Baixa total → PAGO'); else fail(`PAGO falhou: ${det.status}`)

    // Auditoria.
    const audits = await prisma.auditLog.findMany({ where: { companyId, entityType: { in: ['PAYABLE', 'PAYABLE_PAYMENT', 'SUPPLIER'] } }, select: { action: true } })
    const acts = new Set(audits.map((a) => a.action))
    if (['CREATE', 'SETTLE', 'REVERSE'].every((a) => acts.has(a))) ok('AuditLog cobre CREATE/SETTLE/REVERSE'); else fail(`Auditoria incompleta: ${[...acts]}`)
  } finally {
    await withTenant(companyId, async (tx) => {
      const ps = await tx.payable.findMany({ where: { companyId }, select: { id: true } })
      for (const p of ps) await tx.payable.delete({ where: { id: p.id } }).catch(() => {})
      await tx.supplier.deleteMany({ where: { companyId } }).catch(() => {})
      await tx.expenseCategory.deleteMany({ where: { companyId } }).catch(() => {})
      await tx.costCenter.deleteMany({ where: { companyId } }).catch(() => {})
    }).catch(() => {})
    await prisma.auditLog.deleteMany({ where: { companyId } }).catch(() => {})
    await prisma.user.deleteMany({ where: { companyId } }).catch(() => {})
    await prisma.company.delete({ where: { id: companyId } }).catch(() => {})
    for (const uid of uids) await admin.auth.admin.deleteUser(uid).catch(() => {})
    await prisma.$disconnect()
  }
  console.log(process.exitCode ? '✖ Smoke com falhas' : '✔ Smoke concluído')
}
main().catch((e) => { console.error(e); process.exit(1) })
