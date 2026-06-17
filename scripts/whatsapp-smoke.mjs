// Smoke WhatsApp: conversas, mensagens (pendente sem Evolution), respostas rápidas, webhook.
globalThis.WebSocket = globalThis.WebSocket || class { close() {} }
import { createServerClient } from '@supabase/ssr'
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BASE = process.env.BASE_URL || 'http://localhost:3997'
const EMAIL = process.env.SEED_ADMIN_EMAIL || 'danilo@bootdigital.com.br', PASSWORD = process.env.SEED_ADMIN_PASSWORD
const WTOKEN = process.env.WHATSAPP_WEBHOOK_TOKEN || process.env.WHATSAPP_API_KEY || 'your-api-key'
if (!PASSWORD) { console.error('Defina SEED_ADMIN_PASSWORD'); process.exit(1) }
const ok = (m) => console.log('  ✅', m), fail = (m) => { console.error('  ❌', m); process.exitCode = 1 }
const jar = new Map()
const sb = createServerClient(URL, KEY, { cookies: { getAll: () => Array.from(jar, ([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } })
const ch = () => Array.from(jar, ([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; ')
const req = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ch() }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json() } catch {} ; return { status: r.status, j } }

async function main() {
  const { error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) return fail(error.message); ok('Login')

  console.log('\n== RESPOSTAS RÁPIDAS (auto-seed) ==')
  const qr = await req('GET', '/api/whatsapp/quick-replies')
  qr.status === 200 && qr.j.length >= 3 ? ok(`${qr.j.length} respostas rápidas`) : fail(`quick-replies: ${qr.status}`)

  console.log('\n== CRIAR CONVERSA ==')
  const c = await req('POST', '/api/whatsapp/conversations', { contactName: 'Smoke WA', contactPhone: '(11) 98888-7777' })
  if (c.status !== 201) return fail(`POST conversa: ${c.status} ${JSON.stringify(c.j)}`)
  const convId = c.j.id; ok(`Conversa criada (${convId})`)

  console.log('\n== ENVIAR MENSAGEM (sem Evolution → pendente) ==')
  const m = await req('POST', '/api/whatsapp/messages', { conversationId: convId, content: 'Olá do smoke' })
  m.status === 201 && (m.j.status === 'PENDING' || m.j.status === 'SENT') ? ok(`Mensagem gravada (status ${m.j.status})`) : fail(`POST msg: ${m.status} ${JSON.stringify(m.j)}`)
  const list = await req('GET', `/api/whatsapp/messages?conversationId=${convId}`)
  list.status === 200 && list.j.some((x) => x.content === 'Olá do smoke' && x.direction === 'OUTGOING') ? ok('Mensagem aparece (OUTGOING)') : fail('msg não listada')

  console.log('\n== WEBHOOK (recebimento) ==')
  const wh = await fetch(`${BASE}/api/whatsapp/webhook?token=${encodeURIComponent(WTOKEN)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '5511988887777', name: 'Smoke WA', message: 'Resposta do paciente' }) })
  wh.status === 200 ? ok('Webhook aceitou (INCOMING gravada)') : fail(`webhook: ${wh.status}`)
  const whbad = await fetch(`${BASE}/api/whatsapp/webhook?token=errado`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '1', message: 'x' }) }).then((r) => r.status)
  whbad === 401 ? ok('Webhook com token errado → 401') : fail(`webhook token: ${whbad}`)

  console.log('\n== PROTEÇÃO ==')
  const na = await fetch(BASE + '/api/whatsapp/conversations').then((r) => r.status)
  na === 401 ? ok('Sem sessão → 401') : fail(`esperava 401, veio ${na}`)

  console.log(process.exitCode ? '\n⚠️  WhatsApp smoke com falhas.' : '\n🎉 WhatsApp smoke: OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
