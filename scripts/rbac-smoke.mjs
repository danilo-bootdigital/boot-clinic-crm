// Smoke RBAC: admin cria usuário com permissões limitadas, loga como ele e verifica enforcement; depois remove.
// Requer SUPABASE_SERVICE_ROLE_KEY no servidor (produção). Rodar com BASE_URL de prod.
globalThis.WebSocket = globalThis.WebSocket || class { close() {} }
import { createServerClient } from '@supabase/ssr'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BASE = process.env.BASE_URL || 'http://localhost:3997'
const EMAIL = process.env.SEED_ADMIN_EMAIL || 'danilo@bootdigital.com.br'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD
if (!PASSWORD) { console.error('Defina SEED_ADMIN_PASSWORD'); process.exit(1) }

const TEST_EMAIL = 'rbac.test@example.com'
const TEST_PASS = 'RbacTest123!'

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
  console.log('\n== ADMIN LOGIN ==')
  const admin = makeClient()
  const a = await admin.sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (a.error) return fail(a.error.message); ok('Admin logado')

  // limpa eventual usuário de teste anterior
  const existing = (await admin.req('GET', '/api/users')).json?.find((u) => u.email === TEST_EMAIL)
  if (existing) await admin.req('DELETE', `/api/users/${existing.id}`)

  console.log('\n== CRIAR USUÁRIO (perms: patients=view, agenda=edit, resto=none) ==')
  const created = await admin.req('POST', '/api/users', {
    name: 'Usuário RBAC Teste', email: TEST_EMAIL, password: TEST_PASS, role: 'RECEPTION',
    permissions: { patients: 'view', agenda: 'edit', crm: 'none', followup: 'none', dashboard: 'none', configuracoes: 'none' },
  })
  if (created.status !== 201) return fail(`POST /api/users: ${created.status} ${JSON.stringify(created.json)}`)
  const newId = created.json.id
  ok(`Usuário criado (${newId})`)

  console.log('\n== LOGIN COMO O NOVO USUÁRIO ==')
  const sub = makeClient()
  const s = await sub.sb.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASS })
  if (s.error) return fail(`login sub: ${s.error.message}`)
  ok('Sub-usuário logou')

  console.log('\n== ENFORCEMENT ==')
  const me = await sub.req('GET', '/api/me')
  me.json?.permissions?.patients === 'view' && me.json?.permissions?.crm === 'none' ? ok('/api/me reflete permissões') : fail(`/api/me: ${JSON.stringify(me.json?.permissions)}`)

  const pv = await sub.req('GET', '/api/patients?limit=5')
  pv.status === 200 ? ok('GET patients (view) → 200') : fail(`patients view: ${pv.status}`)

  const pe = await sub.req('POST', '/api/patients', { name: 'x', cpf: '111.111.111-11', birthDate: '1990-01-01', gender: 'MALE', phone: '(11) 90000-0000', origin: 'OTHER' })
  pe.status === 403 ? ok('POST patients (só view) → 403') : fail(`patients edit deveria 403, veio ${pe.status}`)

  const cv = await sub.req('GET', '/api/crm/deals')
  cv.status === 403 ? ok('GET crm (none) → 403') : fail(`crm none deveria 403, veio ${cv.status}`)

  const av = await sub.req('GET', '/api/agenda/appointments?date=2026-06-17')
  av.status === 200 ? ok('GET agenda (edit⇒view) → 200') : fail(`agenda view: ${av.status}`)

  const dv = await sub.req('GET', '/api/dashboard/kpis')
  dv.status === 403 ? ok('GET dashboard (none) → 403') : fail(`dashboard none deveria 403, veio ${dv.status}`)

  const conf = await sub.req('GET', '/api/company')
  conf.status === 403 ? ok('GET company (configuracoes none) → 403') : fail(`company none deveria 403, veio ${conf.status}`)

  console.log('\n== REMOVER USUÁRIO (admin) ==')
  const del = await admin.req('DELETE', `/api/users/${newId}`)
  del.status === 200 ? ok('Usuário removido (Auth + banco)') : fail(`DELETE user: ${del.status}`)
  const stillThere = (await admin.req('GET', '/api/users')).json?.some((u) => u.id === newId)
  !stillThere ? ok('Sumiu da lista') : fail('Ainda na lista')

  console.log(process.exitCode ? '\n⚠️  RBAC smoke com falhas.' : '\n🎉 RBAC smoke: criação + permissões + remoção OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
