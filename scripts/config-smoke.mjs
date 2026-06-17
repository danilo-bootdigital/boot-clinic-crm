// Smoke das Configurações: company GET/PUT, users GET + guard de próprio papel, notification settings GET/PUT, proteção.
globalThis.WebSocket = globalThis.WebSocket || class { close() {} }
import { createServerClient } from '@supabase/ssr'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BASE = process.env.BASE_URL || 'http://localhost:3997'
const EMAIL = process.env.SEED_ADMIN_EMAIL || 'danilo@bootdigital.com.br'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD
if (!PASSWORD) { console.error('Defina SEED_ADMIN_PASSWORD'); process.exit(1) }

const ok = (m) => console.log('  ✅', m)
const fail = (m) => { console.error('  ❌', m); process.exitCode = 1 }
const jar = new Map()
const supabase = createServerClient(URL, KEY, { cookies: { getAll: () => Array.from(jar, ([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } })
const ch = () => Array.from(jar, ([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; ')
async function req(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Cookie: ch() }, body: body ? JSON.stringify(body) : undefined })
  let json = null; try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function main() {
  console.log('\n== LOGIN =='); const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) return fail(error.message); ok('Login')

  console.log('\n== CLÍNICA ==')
  const c = await req('GET', '/api/company')
  if (c.status !== 200 || !c.json?.id) return fail(`GET company: ${c.status}`)
  ok(`Empresa: ${c.json.name}`)
  const newName = c.json.name + ' '
  const up = await req('PUT', '/api/company', { name: 'Clínica Teste Config', phone: '(11) 3333-4444' })
  up.status === 200 && up.json.name === 'Clínica Teste Config' ? ok('PUT company OK') : fail(`PUT company: ${up.status}`)
  await req('PUT', '/api/company', { name: c.json.name, phone: c.json.phone, cnpj: c.json.cnpj, email: c.json.email, address: c.json.address }) // restaura
  ok('Empresa restaurada')

  console.log('\n== USUÁRIOS (RBAC) ==')
  const us = await req('GET', '/api/users')
  if (us.status !== 200 || !us.json?.length) return fail(`GET users: ${us.status}`)
  ok(`${us.json.length} usuário(s)`)
  const me = us.json[0]
  const self = await req('PUT', `/api/users/${me.id}`, { role: 'MANAGER' })
  self.status === 400 ? ok('Bloqueia alterar o próprio papel (400)') : fail(`esperava 400 ao mudar próprio papel, veio ${self.status}`)

  console.log('\n== NOTIFICAÇÕES ==')
  const n = await req('GET', '/api/notifications/settings')
  if (n.status !== 200) return fail(`GET settings: ${n.status}`)
  ok(`Settings carregadas (email=${n.json.emailEnabled})`)
  const toggled = await req('PUT', '/api/notifications/settings', { whatsappEnabled: !n.json.whatsappEnabled })
  toggled.status === 200 && toggled.json.whatsappEnabled === !n.json.whatsappEnabled ? ok('Toggle persistido') : fail(`PUT settings: ${toggled.status}`)
  await req('PUT', '/api/notifications/settings', { whatsappEnabled: n.json.whatsappEnabled }) // restaura

  console.log('\n== PROTEÇÃO ==')
  const na = await fetch(BASE + '/api/company').then((r) => r.status)
  na === 401 ? ok('Sem sessão → 401') : fail(`esperava 401, veio ${na}`)

  console.log(process.exitCode ? '\n⚠️  Config smoke com falhas.' : '\n🎉 Config smoke: TODOS OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
