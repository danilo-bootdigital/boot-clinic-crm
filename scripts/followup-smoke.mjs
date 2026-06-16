// Smoke do Follow-up: criar tarefa, listar, concluir, KPIs refletem, excluir, proteção.
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
const kpis = async () => (await req('GET', '/api/dashboard/kpis')).json

async function main() {
  console.log('\n== LOGIN ==')
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) return fail(`Login: ${error.message}`); ok('Login')

  const k0 = await kpis()
  const base = k0.followup
  console.log(`  base: pendentes hoje=${base.pendingToday}, concluídas(mês)=${base.completedThisMonth}`)

  console.log('\n== CRIAR TAREFA (vence hoje) ==')
  const today = new Date().toISOString().split('T')[0]
  const c = await req('POST', '/api/followup/tasks', { title: 'Tarefa Teste FU', dueDate: today, priority: 'HIGH', type: 'FOLLOW_UP' })
  if (c.status !== 201) return fail(`POST: ${c.status} ${JSON.stringify(c.json)}`)
  const id = c.json.id; ok(`Tarefa criada (${id})`)

  console.log('\n== LISTAR ==')
  const list = await req('GET', '/api/followup/tasks')
  list.json.some((t) => t.id === id) ? ok(`Lista OK (${list.json.length})`) : fail('Não apareceu')

  console.log('\n== KPI pendentes hoje +1 ==')
  const k1 = await kpis()
  k1.followup.pendingToday === base.pendingToday + 1 ? ok(`pendentes ${base.pendingToday}→${k1.followup.pendingToday}`) : fail(`pendentes não subiu (${k1.followup.pendingToday})`)

  console.log('\n== CONCLUIR → concluídas +1 ==')
  const done = await req('PUT', `/api/followup/tasks/${id}`, { status: 'COMPLETED' })
  done.status === 200 && done.json.status === 'COMPLETED' && done.json.completedAt ? ok('Concluída (completedAt setado)') : fail(`PUT: ${done.status}`)
  const k2 = await kpis()
  k2.followup.completedThisMonth === base.completedThisMonth + 1 ? ok(`concluídas ${base.completedThisMonth}→${k2.followup.completedThisMonth}; taxa=${k2.followup.completionRate}%`) : fail(`concluídas não subiu (${k2.followup.completedThisMonth})`)

  console.log('\n== EXCLUIR ==')
  const del = await req('DELETE', `/api/followup/tasks/${id}`)
  del.status === 200 ? ok('Excluída') : fail(`DELETE: ${del.status}`)
  const list2 = await req('GET', '/api/followup/tasks')
  !list2.json.some((t) => t.id === id) ? ok('Sumiu da lista') : fail('Ainda na lista')

  console.log('\n== PROTEÇÃO ==')
  const na = await fetch(BASE + '/api/followup/tasks').then((r) => r.status)
  na === 401 ? ok('Sem sessão → 401') : fail(`esperava 401, veio ${na}`)

  console.log(process.exitCode ? '\n⚠️  Follow-up smoke com falhas.' : '\n🎉 Follow-up smoke: TODOS OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
