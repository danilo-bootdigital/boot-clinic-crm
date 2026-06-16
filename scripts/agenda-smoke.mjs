// Smoke test do módulo Agenda: config (specialties/rooms/professionals auto-seed),
// appointments CRUD + operações de status + conflito, e CRUD de config.
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
  cookies: { getAll: () => Array.from(jar, ([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) },
})
const ch = () => Array.from(jar, ([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; ')
async function req(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Cookie: ch() }, body: body ? JSON.stringify(body) : undefined })
  let json = null; try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function main() {
  console.log('\n== LOGIN ==')
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !data?.user) return fail(`Login: ${error?.message}`)
  ok(`Login ${data.user.email}`)

  console.log('\n== CONFIG (auto-seed) ==')
  const specs = await req('GET', '/api/specialties')
  const profs = await req('GET', '/api/professionals')
  const rooms = await req('GET', '/api/rooms')
  if (specs.status !== 200 || !specs.json?.length) return fail(`specialties: ${specs.status}`)
  if (profs.status !== 200 || !profs.json?.length) return fail(`professionals: ${profs.status}`)
  if (rooms.status !== 200 || !rooms.json?.length) return fail(`rooms: ${rooms.status}`)
  ok(`${specs.json.length} especialidades, ${profs.json.length} profissional(is), ${rooms.json.length} salas`)
  const specialtyId = specs.json[0].id
  const professionalId = profs.json[0].id

  console.log('\n== PACIENTE p/ agendar ==')
  const cpf = '529.982.247-25'
  let patientId
  const pc = await req('POST', '/api/patients', { name: 'Paciente Agenda Teste', cpf, birthDate: '1990-01-01', gender: 'MALE', phone: '(11) 99999-9999', origin: 'OTHER', status: 'ACTIVE' })
  if (pc.status === 201) { patientId = pc.json.id; ok('Paciente criado') }
  else { const list = await req('GET', '/api/patients?limit=100'); patientId = list.json.patients?.[0]?.id; patientId ? ok('Paciente reutilizado') : fail('Sem paciente') }

  console.log('\n== CRIAR AGENDAMENTO ==')
  const day = new Date(); day.setDate(day.getDate() + 1)
  const dateStr = day.toISOString().split('T')[0]
  const startAt = new Date(`${dateStr}T09:00:00`).toISOString()
  const created = await req('POST', '/api/agenda/appointments', { patientId, professionalId, specialtyId, type: 'Consulta', startAt, durationMinutes: 30 })
  if (created.status !== 201) return fail(`POST appt: ${created.status} ${JSON.stringify(created.json)}`)
  const id = created.json.id
  ok(`Agendamento criado (${id})`)

  console.log('\n== LISTAR POR DIA (enriquecido) ==')
  const list = await req('GET', `/api/agenda/appointments?date=${dateStr}`)
  const found = list.json.find((a) => a.id === id)
  found && found.patient?.name && found.professional?.name ? ok(`Lista OK; ${found.patient.name} / ${found.professional.name}`) : fail('Não apareceu/enriquecido')

  console.log('\n== CONFLITO ==')
  const conflict = await req('POST', '/api/agenda/appointments', { patientId, professionalId, specialtyId, type: 'Consulta', startAt, durationMinutes: 30 })
  conflict.status === 409 ? ok('Conflito de horário detectado (409)') : fail(`esperava 409, veio ${conflict.status}`)

  console.log('\n== OPERAÇÕES DE STATUS ==')
  const c1 = await req('PATCH', `/api/agenda/appointments/${id}/operations`, { action: 'confirm' })
  c1.status === 200 && c1.json.status === 'CONFIRMED' ? ok('Confirmado') : fail(`confirm: ${c1.status}`)
  const c2 = await req('PATCH', `/api/agenda/appointments/${id}/operations`, { action: 'attend' })
  c2.status === 200 && c2.json.status === 'ATTENDED' ? ok('Compareceu') : fail(`attend: ${c2.status}`)

  console.log('\n== EDITAR ==')
  const upd = await req('PUT', `/api/agenda/appointments/${id}`, { notes: 'obs editada' })
  upd.status === 200 ? ok('Editado') : fail(`PUT: ${upd.status}`)

  console.log('\n== CONFIG CRUD (especialidade/sala/bloqueio) ==')
  const ns = await req('POST', '/api/specialties', { name: 'Especialidade Teste X' })
  ns.status === 201 ? ok('Especialidade criada') : fail(`spec POST: ${ns.status}`)
  if (ns.json?.id) { const d = await req('DELETE', `/api/specialties/${ns.json.id}`); d.status === 200 ? ok('Especialidade excluída') : fail('spec DELETE') }
  const block = await req('POST', '/api/schedule-blocks', { professionalId, date: dateStr, startTime: '12:00', endTime: '13:00', reason: 'Almoço' })
  block.status === 201 ? ok('Bloqueio criado') : fail(`block POST: ${block.status} ${JSON.stringify(block.json)}`)
  if (block.json?.id) { await req('DELETE', `/api/schedule-blocks/${block.json.id}`); ok('Bloqueio excluído') }

  console.log('\n== EXCLUIR AGENDAMENTO ==')
  const del = await req('DELETE', `/api/agenda/appointments/${id}`)
  del.status === 200 ? ok('Excluído') : fail(`DELETE: ${del.status}`)

  console.log('\n== PROTEÇÃO ==')
  const noauth = await fetch(BASE + '/api/agenda/appointments').then((r) => r.status)
  noauth === 401 ? ok('Sem sessão → 401') : fail(`esperava 401, veio ${noauth}`)

  console.log(process.exitCode ? '\n⚠️  Agenda smoke com falhas.' : '\n🎉 Agenda smoke: TODOS OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
