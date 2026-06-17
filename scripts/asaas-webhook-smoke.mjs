// Smoke do webhook Asaas: prova que eventos de pagamento mudam o status da
// clínica (vencido → SUSPENDED, pago → ACTIVE) SEM precisar de credenciais Asaas.
// Cria uma clínica temporária com asaasSubscriptionId fake, dispara os eventos
// no endpoint público /api/asaas/webhook e confere o efeito no banco. Limpa no fim.
//
// Uso: BASE_URL=http://localhost:3997 node scripts/asaas-webhook-smoke.mjs
import { PrismaClient } from '@prisma/client'

const BASE = process.env.BASE_URL || 'http://localhost:3997'
const TOKEN = process.env.ASAAS_WEBHOOK_TOKEN // opcional
const SUB = 'sub_smoke_' + 'abcdef'
const CUS = 'cus_smoke_' + 'abcdef'

const ok = (m) => console.log('  ✅', m)
const fail = (m) => { console.error('  ❌', m); process.exitCode = 1 }
const prisma = new PrismaClient()

async function hook(event) {
  const res = await fetch(BASE + '/api/asaas/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { 'asaas-access-token': TOKEN } : {}) },
    body: JSON.stringify({ event, payment: { subscription: SUB, customer: CUS, status: 'X' } }),
  })
  let json = null; try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function main() {
  console.log('\n== SETUP: clínica temporária com assinatura fake ==')
  await prisma.company.deleteMany({ where: { asaasSubscriptionId: SUB } }).catch(() => {})
  const company = await prisma.company.create({
    data: { name: 'Webhook Smoke Clinic', status: 'TRIAL', plan: 'basic', asaasSubscriptionId: SUB, asaasCustomerId: CUS },
  })
  ok(`Clínica criada (${company.id}) status TRIAL`)

  console.log('\n== EVENTO: PAYMENT_OVERDUE → SUSPENDED ==')
  const r1 = await hook('PAYMENT_OVERDUE')
  r1.status === 200 ? ok('webhook 200') : fail(`webhook status ${r1.status}`)
  let c = await prisma.company.findUnique({ where: { id: company.id } })
  c.status === 'SUSPENDED' ? ok('clínica ficou SUSPENDED') : fail(`esperava SUSPENDED, veio ${c.status}`)

  console.log('\n== EVENTO: PAYMENT_CONFIRMED → ACTIVE ==')
  const r2 = await hook('PAYMENT_CONFIRMED')
  r2.status === 200 ? ok('webhook 200') : fail(`webhook status ${r2.status}`)
  c = await prisma.company.findUnique({ where: { id: company.id } })
  c.status === 'ACTIVE' ? ok('clínica voltou a ACTIVE') : fail(`esperava ACTIVE, veio ${c.status}`)

  console.log('\n== EVENTO: assinatura desconhecida → matched:false ==')
  const r3 = await fetch(BASE + '/api/asaas/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(TOKEN ? { 'asaas-access-token': TOKEN } : {}) },
    body: JSON.stringify({ event: 'PAYMENT_CONFIRMED', payment: { subscription: 'sub_inexistente', customer: 'cus_x' } }),
  })
  const j3 = await r3.json().catch(() => ({}))
  r3.status === 200 && j3.matched === false ? ok('assinatura desconhecida → 200 matched:false') : fail(`inesperado: ${r3.status} ${JSON.stringify(j3)}`)

  console.log('\n== CLEANUP ==')
  await prisma.company.delete({ where: { id: company.id } })
  ok('Clínica temporária removida')

  console.log(process.exitCode ? '\n⚠️  Webhook smoke com falhas.' : '\n🎉 Webhook Asaas: vencido→SUSPENDED, pago→ACTIVE, desconhecida→ignora. OK.')
}
main()
  .catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
