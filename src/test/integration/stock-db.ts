import type { PrismaClient } from '@prisma/client';

// Role sem privilégio usado pelos testes de integração do estoque: o Postgres
// local roda como superusuário, que IGNORA RLS, então cada transação faz
// `SET LOCAL ROLE` para este role (igual ao app_user de produção).
export const STOCK_IT_ROLE = 'stock_it_role';

// Idempotente e tolerante a arquivos de teste rodando em paralelo: GRANT
// simultâneo no mesmo objeto dá "tuple concurrently updated" — tenta de novo.
export async function ensureStockTestRole(db: PrismaClient) {
  const stmts = [
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${STOCK_IT_ROLE}') THEN CREATE ROLE ${STOCK_IT_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;`,
    `GRANT USAGE ON SCHEMA public TO ${STOCK_IT_ROLE}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${STOCK_IT_ROLE}`,
  ];
  for (const sql of stmts) {
    for (let attempt = 0; ; attempt++) {
      try {
        await db.$executeRawUnsafe(sql);
        break;
      } catch (e: any) {
        const retryable = /concurrently updated|already exists/.test(String(e?.message));
        if (!retryable || attempt >= 5) throw e;
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
      }
    }
  }
}
