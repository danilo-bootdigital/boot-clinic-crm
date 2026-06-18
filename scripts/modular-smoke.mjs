// Smoke do CONTROLE SaaS MODULAR (autônomo): bootstrap de empresa + super-admin
// temporário → valida os 3 níveis (plano contratado / ativação na clínica / RBAC):
//  - default sem config = tudo habilitado (backward-compat)
//  - desligar módulo na clínica → some de /api/me e API do módulo dá 403 MODULE_DISABLED
//  - módulo essencial (core) não pode ser desligado (400)
//  - plano sem o módulo (PlanFeature) → módulo não contratado fica desabilitado
// Limpa tudo no fim.
// Uso: BASE_URL=http://localhost:3997 node --env-file=.env scripts/modular-smoke.mjs
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
const EMAIL = 'modular.smoke@example.com'
const PASS = 'ModSmoke123!'
const SMOKE_PLAN = 'smoke-plan-' + Math.floor(Math.random() * 100000)

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
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const old = list.data?.users?.find((u) => u.email?.toLowerCase() === EMAIL)
  if (old) await admin.auth.admin.deleteUser(old.id).catch(() => {})
  await prisma.user.deleteMany({ where: { email: EMAIL } }).catch(() => {})
  const created = await admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true })
  const uid = created.data.user.id
  const company = await prisma.company.create({ data: { name: 'Modular Smoke (temp)', status: 'ACTIVE' } })
  const companyId = company.id
  await prisma.user.create({ data: { id: uid, email: EMAIL, name: 'Mod Smoke', role: 'SUPER_ADMIN', companyId } })
  console.log('\n== BOOTSTRAP =='); ok(`empresa+super-admin temp (${companyId})`)

  const teardown = async () => {
    await prisma.companyModule.deleteMany({ where: { companyId } }).catch(() => {})
    await prisma.planFeature.deleteMany({ where: { plan: SMOKE_PLAN } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: uid } }).catch(() => {})
    await prisma.company.delete({ where: { id: companyId } }).catch(() => {})
    await admin.auth.admin.deleteUser(uid).catch(() => {})
    await prisma.$disconnect()
  }

  try {
    const c = makeClient()
    const login = await c.sb.auth.signInWithPassword({ email: EMAIL, password: PASS })
    if (login.error) throw new Error('login: ' + login.error.message)
    ok('login super-admin')

    console.log('\n== DEFAULT (sem config = tudo habilitado) ==')
    let me = await c.req('GET', '/api/me')
    const mods = new Set(me.json?.modules || [])
    mods.has('clinico') && mods.has('patients') && mods.has('crm') ? ok(`/api/me lista módulos habilitados (${me.json.modules.length})`) : fail('modules default: ' + JSON.stringify(me.json?.modules))
    const an1 = await c.req('GET', '/api/clinico/anamneses')
    an1.status === 200 ? ok('API clínica acessível com módulo habilitado (200)') : fail('clínica default: ' + an1.status)

    console.log('\n== NÍVEL CLÍNICA: desligar módulo clinico ==')
    const off = await c.req('PUT', `/api/admin/companies/${companyId}/modules`, { moduleKey: 'clinico', enabled: false })
    off.status === 200 ? ok('PUT desliga clinico') : fail('desligar clinico: ' + JSON.stringify(off.json))
    me = await c.req('GET', '/api/me')
    !new Set(me.json?.modules || []).has('clinico') ? ok('clinico sumiu de /api/me') : fail('clinico ainda em /api/me')
    const an2 = await c.req('GET', '/api/clinico/anamneses')
    an2.status === 403 && an2.json?.code === 'MODULE_DISABLED' ? ok('API clínica bloqueada por URL (403 MODULE_DISABLED)') : fail('clínica desligada deveria 403 MODULE_DISABLED, veio ' + an2.status + ' ' + JSON.stringify(an2.json))

    console.log('\n== reativar clinico ==')
    const on = await c.req('PUT', `/api/admin/companies/${companyId}/modules`, { moduleKey: 'clinico', enabled: true })
    on.status === 200 ? ok('PUT religa clinico') : fail('religar: ' + on.status)
    const an3 = await c.req('GET', '/api/clinico/anamneses')
    an3.status === 200 ? ok('API clínica volta a 200') : fail('clínica religada: ' + an3.status)

    console.log('\n== GUARD DE URL EM OUTROS MÓDULOS (crm, patients) ==')
    for (const [mod, path] of [['crm', '/api/crm/deals'], ['patients', '/api/patients']]) {
      await c.req('PUT', `/api/admin/companies/${companyId}/modules`, { moduleKey: mod, enabled: false })
      const blockedRes = await c.req('GET', path)
      blockedRes.status === 403 ? ok(`${mod} desligado → ${path} dá 403`) : fail(`${mod} desligado deveria 403 em ${path}, veio ${blockedRes.status}`)
      await c.req('PUT', `/api/admin/companies/${companyId}/modules`, { moduleKey: mod, enabled: true })
      const back = await c.req('GET', path)
      back.status === 200 ? ok(`${mod} religado → ${path} volta a 200`) : fail(`${mod} religado: ${back.status}`)
    }

    console.log('\n== CORE não desligável ==')
    const core = await c.req('PUT', `/api/admin/companies/${companyId}/modules`, { moduleKey: 'configuracoes', enabled: false })
    core.status === 400 ? ok('configuracoes (core) recusa desativação (400)') : fail('core deveria 400, veio ' + core.status)

    console.log('\n== NÍVEL SaaS: plano sem o módulo (PlanFeature) ==')
    await prisma.company.update({ where: { id: companyId }, data: { plan: SMOKE_PLAN } })
    // plano contrata só 'patients' (e cores são sempre on); clinico/crm ficam de fora
    await prisma.planFeature.create({ data: { plan: SMOKE_PLAN, moduleKey: 'patients' } })
    me = await c.req('GET', '/api/me')
    const planMods = new Set(me.json?.modules || [])
    planMods.has('patients') && !planMods.has('crm') && !planMods.has('clinico')
      ? ok('plano contrata só patients → crm/clinico não contratados somem')
      : fail('plano gating: ' + JSON.stringify(me.json?.modules))
    planMods.has('dashboard') && planMods.has('configuracoes') ? ok('módulos core continuam habilitados mesmo fora do plano') : fail('core sumiu fora do plano: ' + JSON.stringify(me.json?.modules))
    const an4 = await c.req('GET', '/api/clinico/anamneses')
    an4.status === 403 ? ok('API clínica bloqueada por plano (403)') : fail('clínica fora do plano deveria 403, veio ' + an4.status)

  } finally {
    console.log('\n== CLEANUP ==')
    await teardown()
    ok('temp removido')
  }

  console.log(process.exitCode ? '\n⚠️  Modular smoke com falhas.' : '\n🎉 Modular smoke: default + nível clínica + core + nível plano OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
