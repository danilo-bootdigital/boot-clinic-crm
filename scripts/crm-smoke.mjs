// Smoke test do módulo CRM: login + pipeline/stages + CRUD de deals + mover etapa.
// Uso: SEED_ADMIN_PASSWORD='...' BASE_URL='http://localhost:3997' node --env-file=.env scripts/crm-smoke.mjs
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
const supabase = createServerClient(URL, KEY, {
  cookies: {
    getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
  },
})
const cookieHeader = () => Array.from(jar, ([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; ')
async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', Cookie: cookieHeader() },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null; try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function main() {
  console.log('\n== LOGIN ==')
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !data?.user) return fail(`Login falhou: ${error?.message}`)
  ok(`Login ${data.user.email}`)

  console.log('\n== PIPELINE + ETAPAS (auto-seed) ==')
  const pipes = await req('GET', '/api/crm/pipelines')
  if (pipes.status !== 200 || !pipes.json?.length) return fail(`pipelines: ${pipes.status} ${JSON.stringify(pipes.json)}`)
  const pipelineId = pipes.json[0].id
  ok(`Pipeline padrão: ${pipes.json[0].name}`)
  const stagesR = await req('GET', `/api/crm/pipelines/${pipelineId}/stages`)
  if (stagesR.status !== 200 || !stagesR.json?.length) return fail(`stages: ${stagesR.status}`)
  const stages = stagesR.json
  ok(`${stages.length} etapas (ex.: ${stages[0].name} → ${stages[stages.length - 1].name})`)
  const wonStage = stages.find((s) => s.finalType === 'WON')

  console.log('\n== USERS ==')
  const usersR = await req('GET', '/api/users')
  if (usersR.status !== 200 || !usersR.json?.length) return fail(`users: ${usersR.status}`)
  const responsibleUserId = usersR.json[0].id
  ok(`${usersR.json.length} usuário(s); responsável=${usersR.json[0].name}`)

  console.log('\n== CRIAR DEAL ==')
  const created = await req('POST', '/api/crm/deals', {
    title: 'Oportunidade Teste CRM', description: 'smoke', valueEstimated: 1500,
    priority: 'HIGH', pipelineId, stageId: stages[0].id, source: 'WEBSITE', responsibleUserId,
  })
  if (created.status !== 201) return fail(`POST deal: ${created.status} ${JSON.stringify(created.json)}`)
  const id = created.json.id
  ok(`Deal criado (${id}) na etapa ${stages[0].name}`)

  console.log('\n== LISTAR (enriquecido) ==')
  const list = await req('GET', '/api/crm/deals')
  if (list.status !== 200 || !list.json.some((d) => d.id === id)) return fail('Deal não apareceu na lista')
  const found = list.json.find((d) => d.id === id)
  ok(`Lista OK (${list.json.length}); responsibleUser=${found.responsibleUser?.name ?? '—'}`)

  console.log('\n== MOVER ETAPA ==')
  const mv = await req('PATCH', `/api/crm/deals/${id}/move`, { newStageId: stages[1].id })
  mv.status === 200 && mv.json.stageId === stages[1].id ? ok(`Movido para ${stages[1].name}`) : fail(`move: ${mv.status}`)

  if (wonStage) {
    console.log('\n== MOVER PARA ETAPA FINAL (WON) ==')
    const won = await req('PATCH', `/api/crm/deals/${id}/move`, { newStageId: wonStage.id })
    won.status === 200 && won.json.status === 'WON' && won.json.wonAt ? ok('Etapa final WON → status WON + wonAt') : fail(`won: ${won.status} status=${won.json?.status}`)
  }

  console.log('\n== EDITAR ==')
  const upd = await req('PUT', `/api/crm/deals/${id}`, { title: 'Oportunidade Editada', valueEstimated: 2000 })
  upd.status === 200 && upd.json.title === 'Oportunidade Editada' ? ok('Edição persistida') : fail(`PUT: ${upd.status}`)

  console.log('\n== EXCLUIR (soft) ==')
  const del = await req('DELETE', `/api/crm/deals/${id}`)
  del.status === 200 ? ok('Excluído') : fail(`DELETE: ${del.status}`)
  const list2 = await req('GET', '/api/crm/deals')
  !list2.json.some((d) => d.id === id) ? ok('Sumiu da lista (soft delete)') : fail('Ainda na lista')

  console.log('\n== PROTEÇÃO ==')
  const noauth = await fetch(BASE + '/api/crm/deals').then((r) => r.status)
  noauth === 401 ? ok('Sem sessão → 401') : fail(`esperava 401, veio ${noauth}`)

  console.log(process.exitCode ? '\n⚠️  CRM smoke com falhas.' : '\n🎉 CRM smoke: TODOS OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
