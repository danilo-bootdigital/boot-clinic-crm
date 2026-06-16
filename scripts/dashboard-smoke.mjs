// Smoke do Dashboard: prova que os KPIs refletem dados reais (cria registros e confere deltas).
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

  console.log('\n== KPIs base ==')
  const base = await kpis()
  if (!base?.patients || !base?.deals || !base?.appointments) return fail('Shape de KPIs inválido')
  ok(`base: pacientes ativos=${base.patients.active}, deals abertos=${base.deals.open}, ganhos(mês)=${base.deals.wonThisMonth}`)

  console.log('\n== cria paciente → pacientes ativos +1 ==')
  const pc = await req('POST', '/api/patients', { name: 'Dash Teste', cpf: '529.982.247-25', birthDate: '1990-01-01', gender: 'MALE', phone: '(11) 99999-9999', origin: 'OTHER', status: 'ACTIVE' })
  const patientId = pc.json?.id
  const k1 = await kpis()
  k1.patients.active === base.patients.active + 1 ? ok(`ativos ${base.patients.active}→${k1.patients.active}`) : fail(`ativos não subiu (${k1.patients.active})`)

  console.log('\n== cria deal aberto → deals abertos +1 ==')
  const pipes = (await req('GET', '/api/crm/pipelines')).json
  const pipelineId = pipes[0].id
  const stages = (await req('GET', `/api/crm/pipelines/${pipelineId}/stages`)).json
  const users = (await req('GET', '/api/users')).json
  const dc = await req('POST', '/api/crm/deals', { title: 'Dash Deal', valueEstimated: 999, priority: 'MEDIUM', pipelineId, stageId: stages[0].id, source: 'OTHER', responsibleUserId: users[0].id })
  const dealId = dc.json?.id
  const k2 = await kpis()
  k2.deals.open === k1.deals.open + 1 ? ok(`abertos ${k1.deals.open}→${k2.deals.open}`) : fail(`abertos não subiu (${k2.deals.open})`)

  console.log('\n== move deal p/ etapa WON → ganhos(mês) +1 ==')
  const wonStage = stages.find((s) => s.finalType === 'WON')
  await req('PATCH', `/api/crm/deals/${dealId}/move`, { newStageId: wonStage.id })
  const k3 = await kpis()
  k3.deals.wonThisMonth === k2.deals.wonThisMonth + 1 ? ok(`ganhos(mês) ${k2.deals.wonThisMonth}→${k3.deals.wonThisMonth}; receita=${k3.deals.wonValueThisMonth}`) : fail(`ganhos não subiu (${k3.deals.wonThisMonth})`)

  console.log('\n== cria consulta + comparece → realizadas(mês) +1 ==')
  const specialtyId = (await req('GET', '/api/specialties')).json[0].id
  const professionalId = (await req('GET', '/api/professionals')).json[0].id
  const start = new Date(); start.setDate(start.getDate() + 1)
  const startAt = new Date(`${start.toISOString().split('T')[0]}T08:00:00`).toISOString()
  const ac = await req('POST', '/api/agenda/appointments', { patientId, professionalId, specialtyId, type: 'Consulta', startAt, durationMinutes: 30 })
  const apptId = ac.json?.id
  await req('PATCH', `/api/agenda/appointments/${apptId}/operations`, { action: 'attend' })
  const k4 = await kpis()
  k4.appointments.attendedThisMonth === k3.appointments.attendedThisMonth + 1 ? ok(`realizadas(mês) ${k3.appointments.attendedThisMonth}→${k4.appointments.attendedThisMonth}`) : fail(`realizadas não subiu (${k4.appointments.attendedThisMonth})`)

  console.log('\n== limpeza ==')
  // remove appointment, deal, patient
  if (apptId) await req('DELETE', `/api/agenda/appointments/${apptId}`)
  if (dealId) await req('DELETE', `/api/crm/deals/${dealId}`)
  if (patientId) await req('DELETE', `/api/patients/${patientId}`)
  ok('registros de teste removidos (via API/soft delete)')

  console.log('\n== proteção ==')
  const na = await fetch(BASE + '/api/dashboard/kpis').then((r) => r.status)
  na === 401 ? ok('Sem sessão → 401') : fail(`esperava 401, veio ${na}`)

  console.log(process.exitCode ? '\n⚠️  Dashboard smoke com falhas.' : '\n🎉 Dashboard smoke: KPIs refletem dados reais. TODOS OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
