// Verifica se a RLS das tabelas financeiras ISOLA de fato por empresa — e
// detecta o caso em que o role de conexão tem BYPASSRLS (FORCE é ignorado).
// Puro banco (não precisa do servidor HTTP). Cria 2 empresas temporárias,
// semeia 1 categoria em cada e valida a visibilidade via GUC app.company_id.
// Uso: node --env-file=.env scripts/financial-rls-check.mjs
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ok = (m) => console.log('  ✅', m)
const fail = (m) => { console.error('  ❌', m); process.exitCode = 1 }
const warn = (m) => console.warn('  ⚠️ ', m)

// Roda fn dentro de uma transação com o tenant fixado (espelha withFinanceTenant).
const withTenant = (companyId, fn) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`
    return fn(tx)
  })

async function main() {
  console.log('▶ RLS check (financeiro)')
  const a = await prisma.company.create({ data: { name: 'RLS A (temp)', status: 'ACTIVE' } })
  const b = await prisma.company.create({ data: { name: 'RLS B (temp)', status: 'ACTIVE' } })
  try {
    const catA = await withTenant(a.id, (tx) => tx.revenueCategory.create({ data: { companyId: a.id, name: 'Cat A' } }))
    await withTenant(b.id, (tx) => tx.revenueCategory.create({ data: { companyId: b.id, name: 'Cat B' } }))

    // 1) Tenant A só enxerga as próprias categorias.
    const seenByA = await withTenant(a.id, (tx) => tx.revenueCategory.findMany({}))
    if (seenByA.every((c) => c.companyId === a.id) && seenByA.length >= 1) ok('Tenant A vê apenas suas categorias')
    else fail(`Tenant A vazou linhas de outra empresa (viu ${seenByA.length})`)

    // 2) Tenant A não consegue ler a linha de B por id.
    const crossed = await withTenant(a.id, (tx) => tx.revenueCategory.findMany({ where: { companyId: b.id } }))
    if (crossed.length === 0) ok('Tenant A NÃO vê linhas de B (isolamento cruzado)')
    else fail('Isolamento cruzado FALHOU: A leu linhas de B')

    // 3) Detecção de BYPASSRLS / FORCE ausente: sem GUC deve retornar 0 linhas.
    const noGuc = await prisma.$queryRaw`SELECT count(*)::int AS n FROM financial_revenue_categories`
    const n = noGuc?.[0]?.n ?? 0
    if (n === 0) ok('Sem GUC ⇒ 0 linhas (FORCE RLS efetivo)')
    else warn(`Sem GUC retornou ${n} linhas — o role de conexão IGNORA a RLS (provável BYPASSRLS). ` +
      'A RLS NÃO está protegendo no servidor. Use um role sem BYPASSRLS para o app (o filtro companyId da aplicação continua valendo).')

    // cleanup (tenant-aware por causa do FORCE).
    await withTenant(a.id, (tx) => tx.revenueCategory.deleteMany({}))
    await withTenant(b.id, (tx) => tx.revenueCategory.deleteMany({}))
    void catA
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [a.id, b.id] } } })
    await prisma.$disconnect()
  }
  console.log(process.exitCode ? '✖ RLS check com falhas' : '✔ RLS check concluído')
}
main().catch((e) => { console.error(e); process.exit(1) })
