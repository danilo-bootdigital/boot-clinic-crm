// Cadastra/atualiza o webhook no Asaas via API. Idempotente: se já existir um
// webhook para a mesma URL, atualiza; senão cria. Uso:
//   node --env-file=.env scripts/asaas-setup-webhook.mjs
const API = process.env.ASAAS_API_URL || 'https://api.asaas.com/v3'
const KEY = process.env.ASAAS_API_KEY
const TOKEN = process.env.ASAAS_WEBHOOK_TOKEN
const URL = process.env.ASAAS_WEBHOOK_URL || 'https://web-ten-gilt-91.vercel.app/api/asaas/webhook'
const EMAIL = process.env.ASAAS_WEBHOOK_EMAIL || 'danilo@bootdigital.com.br'
if (!KEY) { console.error('ASAAS_API_KEY ausente'); process.exit(1) }
if (!TOKEN) { console.error('ASAAS_WEBHOOK_TOKEN ausente'); process.exit(1) }

const EVENTS = [
  'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_DELETED',
]

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', access_token: KEY, 'User-Agent': 'BootClinicCRM' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null; try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function main() {
  const payload = {
    name: 'Boot Clinic CRM — assinaturas',
    url: URL,
    email: EMAIL,
    enabled: true,
    interrupted: false,
    authToken: TOKEN,
    sendType: 'SEQUENTIALLY',
    events: EVENTS,
  }

  // Procura webhook existente para a mesma URL.
  const list = await api('GET', '/webhooks')
  if (list.status >= 300) {
    console.error(`❌ GET /webhooks falhou (${list.status}). Sua conta pode não permitir gerenciar webhooks por API.`)
    console.error('   Detalhe:', JSON.stringify(list.json))
    console.error('\n👉 Cadastre manualmente em Asaas → Integrações → Webhooks:')
    console.error('   URL:', URL)
    console.error('   Token de autenticação: (o valor de ASAAS_WEBHOOK_TOKEN no .env)')
    console.error('   Eventos:', EVENTS.join(', '))
    process.exit(2)
  }

  const existing = list.json?.data?.find((w) => w.url === URL)
  let res
  if (existing) {
    res = await api('PUT', `/webhooks/${existing.id}`, payload)
    console.log(res.status < 300 ? `✅ Webhook atualizado (${existing.id})` : `❌ PUT falhou: ${res.status} ${JSON.stringify(res.json)}`)
  } else {
    res = await api('POST', '/webhooks', payload)
    console.log(res.status < 300 ? `✅ Webhook criado (${res.json?.id})` : `❌ POST falhou: ${res.status} ${JSON.stringify(res.json)}`)
  }
  if (res.status >= 300) process.exit(2)
  console.log('   URL:', URL)
  console.log('   Eventos:', EVENTS.length, 'eventos de pagamento')
}
main().catch((e) => { console.error('Setup webhook falhou:', e); process.exit(1) })
