// Smoke do painel SUPER-ADMIN (SaaS): cria clínica + OWNER, valida acesso do
// owner, suspende (owner bloqueado), reativa (owner volta) e encerra (cleanup).
// Requer SUPABASE_SERVICE_ROLE_KEY no servidor. O usuário do login precisa ser
// SUPER_ADMIN (rode antes: npm run promote-super-admin).
//
// Uso: SEED_ADMIN_PASSWORD=... BASE_URL=https://... node scripts/admin-smoke.mjs
globalThis.WebSocket = globalThis.WebSocket || class { close() {} }
import { createServerClient } from '@supabase/ssr'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BASE = process.env.BASE_URL || 'http://localhost:3997'
const EMAIL = process.env.SEED_ADMIN_EMAIL || 'danilo@bootdigital.com.br'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD
if (!PASSWORD) { console.error('Defina SEED_ADMIN_PASSWORD'); process.exit(1) }

const OWNER_EMAIL = 'clinica.smoke.owner@example.com'
const OWNER_PASS = 'SmokeOwner123!'
const CLINIC_NAME = 'Clínica Smoke Teste'

const ok = (m) => console.log('  ✅', m)
const fail = (m) => { console.error('  ❌', m); process.exitCode = 1 }

function makeClient() {
  const jar = new Map()
  const sb = createServerClient(URL, KEY, { cookies: { getAll: () => Array.from(jar, ([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } })
  const ch = () => Array.from(jar, ([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; ')
  const req = async (method, path, body) => {
    const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Cookie: ch() }, body: body ? JSON.stringify(body) : undefined })
    let json = null; try { json = await res.json() } catch {}
    return { status: res.status, json }
  }
  return { sb, req }
}

async function main() {
  console.log('\n== SUPER-ADMIN LOGIN ==')
  const admin = makeClient()
  const a = await admin.sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (a.error) return fail(a.error.message)
  ok('Super-admin logado')

  const me = await admin.req('GET', '/api/me')
  me.json?.role === 'SUPER_ADMIN' ? ok('Papel é SUPER_ADMIN') : fail(`Esperava SUPER_ADMIN, veio ${me.json?.role} (rode npm run promote-super-admin)`)

  console.log('\n== LISTAR CLÍNICAS ==')
  const list = await admin.req('GET', '/api/admin/companies')
  list.status === 200 && list.json?.summary ? ok(`Lista OK (${list.json.summary.total} clínicas)`) : fail(`GET companies: ${list.status}`)

  // limpa clínica de teste anterior, se existir
  const prev = list.json?.companies?.find((c) => c.name === CLINIC_NAME)
  if (prev) { await admin.req('DELETE', `/api/admin/companies/${prev.id}`); ok('Clínica de teste anterior limpa') }

  console.log('\n== CRIAR CLÍNICA + OWNER ==')
  const created = await admin.req('POST', '/api/admin/companies', {
    name: CLINIC_NAME, plan: 'trial', status: 'ACTIVE',
    ownerName: 'Owner Smoke', ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASS,
  })
  if (created.status !== 201) return fail(`POST companies: ${created.status} ${JSON.stringify(created.json)}`)
  const companyId = created.json.id
  ok(`Clínica criada (${companyId})`)

  console.log('\n== OWNER LOGA E ACESSA ==')
  const owner = makeClient()
  const o = await owner.sb.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASS })
  if (o.error) return fail(`login owner: ${o.error.message}`)
  ok('Owner logou')
  const ownerMe = await owner.req('GET', '/api/me')
  ownerMe.json?.role === 'OWNER' ? ok('Owner é OWNER') : fail(`owner role: ${ownerMe.json?.role}`)
  const pat1 = await owner.req('GET', '/api/patients?limit=5')
  pat1.status === 200 ? ok('Owner acessa /api/patients (clínica ativa)') : fail(`owner patients ativo: ${pat1.status}`)
  // isolamento: a clínica nova deve estar vazia
  Array.isArray(pat1.json?.patients) && pat1.json.patients.length === 0 ? ok('Clínica nova começa sem pacientes (isolada)') : ok(`Clínica nova: ${pat1.json?.patients?.length ?? '?'} pacientes`)

  console.log('\n== SUPER-ADMIN SUSPENDE ==')
  const susp = await admin.req('PATCH', `/api/admin/companies/${companyId}`, { status: 'SUSPENDED' })
  susp.status === 200 ? ok('Clínica suspensa') : fail(`PATCH suspend: ${susp.status}`)

  console.log('\n== OWNER BLOQUEADO ==')
  const pat2 = await owner.req('GET', '/api/patients?limit=5')
  pat2.status === 403 && pat2.json?.code === 'SUBSCRIPTION_BLOCKED'
    ? ok('Owner recebe 403 SUBSCRIPTION_BLOCKED com clínica suspensa')
    : fail(`owner suspenso deveria 403/SUBSCRIPTION_BLOCKED, veio ${pat2.status}/${pat2.json?.code}`)

  console.log('\n== SUPER-ADMIN REATIVA ==')
  const react = await admin.req('PATCH', `/api/admin/companies/${companyId}`, { status: 'ACTIVE' })
  react.status === 200 ? ok('Clínica reativada') : fail(`PATCH reactivate: ${react.status}`)
  const pat3 = await owner.req('GET', '/api/patients?limit=5')
  pat3.status === 200 ? ok('Owner volta a acessar após reativação') : fail(`owner reativado: ${pat3.status}`)

  console.log('\n== ENCERRAR CLÍNICA (cleanup) ==')
  const del = await admin.req('DELETE', `/api/admin/companies/${companyId}`)
  del.status === 200 ? ok('Clínica encerrada (Auth + soft-delete)') : fail(`DELETE company: ${del.status}`)
  const list2 = await admin.req('GET', '/api/admin/companies')
  !list2.json?.companies?.some((c) => c.id === companyId) ? ok('Sumiu da lista') : fail('Ainda na lista')

  console.log(process.exitCode ? '\n⚠️  Admin smoke com falhas.' : '\n🎉 Admin smoke: criar + isolar + suspender + bloquear + reativar + encerrar OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
