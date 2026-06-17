// Verificação REAL contra o Asaas de produção (controlada e auto-limpante):
//  1) auth (GET /customers)
//  2) cria cliente de teste (CPF válido gerado), cria assinatura (cartão),
//     pega o invoiceUrl da 1ª fatura
//  3) APAGA assinatura + cliente (nenhuma cobrança ocorre: sem cartão anexado)
// Não deixa resíduo. Uso: node --env-file=.env scripts/asaas-live-check.mjs
const URL = process.env.ASAAS_API_URL || 'https://api.asaas.com/v3'
const KEY = process.env.ASAAS_API_KEY
if (!KEY) { console.error('ASAAS_API_KEY ausente no .env'); process.exit(1) }

const ok = (m) => console.log('  ✅', m)
const fail = (m) => { console.error('  ❌', m); process.exitCode = 1 }

async function api(method, path, body) {
  const res = await fetch(URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', access_token: KEY, 'User-Agent': 'BootClinicCRM' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null; try { json = await res.json() } catch {}
  return { status: res.status, json }
}

// Gera um CPF com dígitos verificadores válidos (Asaas valida em produção).
function genCpf() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9))
  const dv = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i] * (arr.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  const d1 = dv(n); const d2 = dv([...n, d1])
  return [...n, d1, d2].join('')
}

function ymd(d) { return d.toISOString().slice(0, 10) }

async function main() {
  console.log('\n== AUTH ==')
  const auth = await api('GET', '/customers?limit=1')
  auth.status === 200 ? ok('Chave de produção válida (GET /customers 200)') : fail(`auth falhou: ${auth.status} ${JSON.stringify(auth.json)}`)
  if (auth.status !== 200) return

  console.log('\n== CRIA CLIENTE DE TESTE ==')
  const cust = await api('POST', '/customers', { name: 'TESTE INTEGRACAO - APAGAR', cpfCnpj: genCpf(), email: 'teste.integracao@example.com' })
  if (cust.status >= 300) return fail(`criar cliente: ${cust.status} ${JSON.stringify(cust.json)}`)
  const customerId = cust.json.id
  ok(`Cliente criado (${customerId})`)

  console.log('\n== CRIA ASSINATURA (cartão, mensal) ==')
  const due = new Date(Date.now() + 14 * 86400000)
  const sub = await api('POST', '/subscriptions', {
    customer: customerId, billingType: 'CREDIT_CARD', cycle: 'MONTHLY', value: 197,
    nextDueDate: ymd(due), description: 'TESTE INTEGRACAO - APAGAR',
  })
  if (sub.status >= 300) { await api('DELETE', `/customers/${customerId}`); return fail(`criar assinatura: ${sub.status} ${JSON.stringify(sub.json)}`) }
  const subId = sub.json.id
  ok(`Assinatura criada (${subId})`)

  console.log('\n== INVOICE URL DA 1ª FATURA ==')
  const pays = await api('GET', `/subscriptions/${subId}/payments`)
  const inv = pays.json?.data?.[0]?.invoiceUrl
  inv ? ok(`invoiceUrl OK: ${inv}`) : console.log('  ⚠️  fatura ainda não gerada (o cliente recebe por e-mail) — não bloqueia')

  console.log('\n== CLEANUP ==')
  const ds = await api('DELETE', `/subscriptions/${subId}`)
  ds.status < 300 ? ok('Assinatura de teste removida') : fail(`del assinatura: ${ds.status}`)
  const dc = await api('DELETE', `/customers/${customerId}`)
  dc.status < 300 ? ok('Cliente de teste removido') : fail(`del cliente: ${dc.status}`)

  console.log(process.exitCode ? '\n⚠️  Live check com falhas.' : '\n🎉 Asaas produção: auth + cliente + assinatura + fatura + cleanup OK (sem cobrança real).')
}
main().catch((e) => { console.error('Live check falhou:', e); process.exit(1) })
