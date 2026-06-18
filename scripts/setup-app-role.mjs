// Cria/atualiza o role de RUNTIME do app — SEM BYPASSRLS — para que a RLS das
// tabelas financeiras (FORCE + GUC) realmente isole por empresa. Migrations
// continuam rodando com o role privilegiado (postgres) via MIGRATE_DATABASE_URL.
//
// Conecta com o DATABASE_URL atual (privilegiado/postgres) e:
//  - cria o role app_user (LOGIN, NOBYPASSRLS) se não existir; (re)define a senha;
//  - concede CRUD em todas as tabelas + USAGE no schema + sequences;
//  - ALTER DEFAULT PRIVILEGES para tabelas futuras (migrations).
//
// Uso: APP_DB_PASSWORD=xxxx node --env-file=.env scripts/setup-app-role.mjs
import { PrismaClient } from '@prisma/client'

const ROLE = process.env.APP_DB_ROLE || 'app_user'
const PW = process.env.APP_DB_PASSWORD
const SCHEMA = (process.env.DATABASE_URL || '').match(/[?&]schema=([^&]+)/)?.[1] || 'public'
const DB = (process.env.DATABASE_URL || '').match(/\/([^/?]+)(\?|$)/)?.[1] || 'postgres'
if (!PW || !/^[A-Za-z0-9]{16,}$/.test(PW)) {
  console.error('Defina APP_DB_PASSWORD (>=16 alfanuméricos). Ex.: APP_DB_PASSWORD=$(openssl rand -hex 16)')
  process.exit(1)
}

const prisma = new PrismaClient()
const run = (sql) => prisma.$executeRawUnsafe(sql)

async function main() {
  console.log(`▶ Configurando role "${ROLE}" (NOBYPASSRLS) no schema "${SCHEMA}"`)
  // Cria o role se não existir (senha alfanumérica validada → seguro interpolar).
  await run(`DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE}') THEN
      CREATE ROLE ${ROLE} LOGIN PASSWORD '${PW}' NOBYPASSRLS;
    END IF;
  END $$;`)
  // Garante senha atual e NOBYPASSRLS (idempotente / rotação).
  await run(`ALTER ROLE ${ROLE} WITH LOGIN NOBYPASSRLS PASSWORD '${PW}'`)
  await run(`GRANT CONNECT ON DATABASE "${DB}" TO ${ROLE}`)
  await run(`GRANT USAGE ON SCHEMA "${SCHEMA}" TO ${ROLE}`)
  await run(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${SCHEMA}" TO ${ROLE}`)
  await run(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${SCHEMA}" TO ${ROLE}`)
  // Tabelas/sequences criadas no futuro por migrations (owner postgres) já saem com grant.
  await run(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "${SCHEMA}" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ROLE}`)
  await run(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "${SCHEMA}" GRANT USAGE, SELECT ON SEQUENCES TO ${ROLE}`)

  const rows = await prisma.$queryRawUnsafe(`SELECT rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname='${ROLE}'`)
  console.log('  role:', rows[0])
  if (rows[0]?.rolbypassrls) { console.error('  ❌ role ainda tem BYPASSRLS!'); process.exitCode = 1 }
  else console.log('  ✅ NOBYPASSRLS confirmado')
  await prisma.$disconnect()
  console.log('✔ Role configurado.')
}
main().catch((e) => { console.error(e); process.exit(1) })
