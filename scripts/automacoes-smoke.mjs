// Smoke Automações: cria regra (paciente criado → tarefa follow-up), cria paciente, verifica execução.
globalThis.WebSocket = globalThis.WebSocket || class { close() {} }
import { createServerClient } from '@supabase/ssr'
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BASE = process.env.BASE_URL || 'http://localhost:3997'
const EMAIL = process.env.SEED_ADMIN_EMAIL || 'danilo@bootdigital.com.br', PASSWORD = process.env.SEED_ADMIN_PASSWORD
if (!PASSWORD) { console.error('Defina SEED_ADMIN_PASSWORD'); process.exit(1) }
const ok = (m) => console.log('  ✅', m), fail = (m) => { console.error('  ❌', m); process.exitCode = 1 }
const jar = new Map()
const sb = createServerClient(URL, KEY, { cookies: { getAll: () => Array.from(jar, ([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } })
const ch = () => Array.from(jar, ([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; ')
const req = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ch() }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json() } catch {} ; return { status: r.status, j } }

async function main() {
  const { error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) return fail(error.message); ok('Login')

  console.log('\n== CRIAR REGRA (paciente criado → tarefa) ==')
  const rule = await req('POST', '/api/automacoes/rules', {
    name: 'Auto Teste Boas-vindas', event: 'PATIENT_CREATED',
    actions: [{ actionType: 'CREATE_FOLLOW_UP', config: { title: 'Auto Teste: ligar para novo paciente', dueInDays: 2 } }],
  })
  if (rule.status !== 201) return fail(`POST rule: ${rule.status} ${JSON.stringify(rule.j)}`)
  ok('Regra criada')
  const rules = await req('GET', '/api/automacoes/rules')
  rules.j.some((r) => r.name === 'Auto Teste Boas-vindas' && r.isActive) ? ok('Regra ativa na lista') : fail('Regra não listada')

  console.log('\n== DISPARAR: criar paciente ==')
  const cpf = '529.982.247-25'
  const pc = await req('POST', '/api/patients', { name: 'Paciente Auto Teste', cpf, birthDate: '1990-01-01', gender: 'MALE', phone: '(11) 90000-0000', origin: 'OTHER', status: 'ACTIVE' })
  if (pc.status !== 201) return fail(`criar paciente: ${pc.status} ${JSON.stringify(pc.j)}`)
  const patientId = pc.j.id; ok(`Paciente criado (${patientId})`)

  console.log('\n== VERIFICAR EXECUÇÃO (tarefa criada pela automação) ==')
  const tasks = await req('GET', '/api/followup/tasks')
  const made = tasks.j.find((t) => t.title === 'Auto Teste: ligar para novo paciente' && t.patientId === patientId)
  made ? ok(`Tarefa criada automaticamente (vence ${new Date(made.dueDate).toLocaleDateString('pt-BR')})`) : fail('Automação NÃO criou a tarefa')

  console.log(process.exitCode ? '\n⚠️  Automações smoke com falhas.' : '\n🎉 Automações smoke: gatilho → ação executada OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
