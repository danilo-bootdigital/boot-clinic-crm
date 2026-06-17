// Smoke de Relatórios: shape correto, período ecoado, e proteção.
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
const req = async (p) => { const r = await fetch(BASE + p, { headers: { Cookie: ch() } }); let j = null; try { j = await r.json() } catch {} ; return { status: r.status, j } }

async function main() {
  const { error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) return fail(error.message); ok('Login')
  const r = await req('/api/reports?from=2026-06-01&to=2026-06-17')
  if (r.status !== 200) return fail(`reports: ${r.status}`)
  const okShape = r.j.patients && r.j.crm && r.j.agenda && r.j.followup && r.j.period?.from === '2026-06-01'
  okShape ? ok(`Relatório OK (período ${r.j.period.from}→${r.j.period.to}; ativos=${r.j.patients.activeTotal}, conv=${r.j.crm.conversionRate}%)`) : fail('Shape inválido: ' + JSON.stringify(r.j).slice(0, 120))
  const na = await fetch(BASE + '/api/reports').then((x) => x.status)
  na === 401 ? ok('Sem sessão → 401') : fail(`esperava 401, veio ${na}`)
  console.log(process.exitCode ? '\n⚠️  Reports smoke com falhas.' : '\n🎉 Reports smoke: OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
