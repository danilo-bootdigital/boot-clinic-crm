// Teste de fumaça: login real + CRUD de Pacientes pela API HTTP autenticada.
// Usa @supabase/ssr para gerar os cookies de sessão no mesmo formato que o
// app espera (o middleware/route handlers leem a sessão desses cookies).
//
// Rodar com o servidor de produção no ar:
//   BASE_URL="http://localhost:3997" node --env-file=.env scripts/smoke.mjs
// Node 20 não tem WebSocket nativo; o supabase-js inicia um RealtimeClient no
// construtor. Como este teste só usa auth (HTTP), um WebSocket fictício basta
// para o client construir sem erro — nenhum canal realtime é aberto.
globalThis.WebSocket = globalThis.WebSocket || class { close() {} }

import { createServerClient } from '@supabase/ssr'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BASE = process.env.BASE_URL || 'http://localhost:3997'
const EMAIL = process.env.SEED_ADMIN_EMAIL || 'danilo@bootdigital.com.br'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD
if (!PASSWORD) { console.error('Defina SEED_ADMIN_PASSWORD no ambiente para rodar o smoke test.'); process.exit(1) }

const ok = (m) => console.log('  ✅', m)
const fail = (m) => { console.error('  ❌', m); process.exitCode = 1 }

// Cookie jar que captura o que o @supabase/ssr grava ao logar.
const jar = new Map()
const supabase = createServerClient(URL, KEY, {
  cookies: {
    getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
  },
})

function cookieHeader() {
  return Array.from(jar, ([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; ')
}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader() },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function main() {
  console.log('\n== 1. LOGIN REAL ==')
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !data?.user) return fail(`Login falhou: ${error?.message || 'sem usuário'}`)
  ok(`Login OK como ${data.user.email} (uid ${data.user.id})`)

  console.log('\n== 2. CRIAR PACIENTE (POST) ==')
  const novo = {
    name: 'Paciente Teste Smoke',
    cpf: '529.982.247-25',
    birthDate: '1990-01-01',
    gender: 'MALE',
    phone: '(11) 99999-9999',
    origin: 'OTHER',
    status: 'ACTIVE',
  }
  const created = await req('POST', '/api/patients', novo)
  if (created.status !== 201) return fail(`POST esperava 201, veio ${created.status}: ${JSON.stringify(created.json)}`)
  const id = created.json.id
  ok(`Paciente criado (id ${id})`)

  console.log('\n== 3. LISTAR (GET) ==')
  const list = await req('GET', '/api/patients?limit=100')
  if (list.status !== 200) return fail(`GET lista esperava 200, veio ${list.status}`)
  const found = (list.json.patients || []).some((p) => p.id === id)
  found ? ok(`Lista retornou ${list.json.patients.length} paciente(s), incluindo o criado`) : fail('Paciente criado não apareceu na lista')

  console.log('\n== 4. VISUALIZAR (GET /[id]) ==')
  const view = await req('GET', `/api/patients/${id}`)
  view.status === 200 && view.json.id === id ? ok(`Visualização OK (${view.json.name})`) : fail(`GET /[id] falhou: ${view.status}`)

  console.log('\n== 5. EDITAR (PUT /[id]) ==')
  const upd = await req('PUT', `/api/patients/${id}`, { name: 'Paciente Teste Editado', phone: '(11) 98888-7777' })
  upd.status === 200 && upd.json.name === 'Paciente Teste Editado' ? ok('Edição persistida') : fail(`PUT falhou: ${upd.status} ${JSON.stringify(upd.json)}`)

  console.log('\n== 6. INATIVAR (DELETE soft) ==')
  const del = await req('DELETE', `/api/patients/${id}`)
  del.status === 200 ? ok('Inativação (soft delete) OK') : fail(`DELETE falhou: ${del.status}`)

  console.log('\n== 7. CONFIRMAR QUE SUMIU DA LISTA ==')
  const list2 = await req('GET', '/api/patients?limit=100')
  const stillThere = (list2.json.patients || []).some((p) => p.id === id)
  !stillThere ? ok('Paciente inativado não aparece mais na lista (soft delete funcionando)') : fail('Paciente inativado ainda aparece na lista')

  console.log('\n== 8. PROTEÇÃO SEM AUTH ==')
  const noauth = await fetch(BASE + '/api/patients').then((r) => r.status)
  noauth === 401 ? ok('API sem sessão retorna 401') : fail(`API sem sessão deveria ser 401, veio ${noauth}`)

  console.log(process.exitCode ? '\n⚠️  Smoke test terminou com falhas.' : '\n🎉 Smoke test: TODOS os passos OK.')
}

main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
