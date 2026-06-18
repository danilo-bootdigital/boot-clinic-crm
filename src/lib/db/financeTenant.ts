import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

// =====================================================================
// RLS multiempresa do módulo Financeiro (defesa em profundidade).
//
// As tabelas financeiras têm FORCE ROW LEVEL SECURITY com policy
// `"companyId" = current_setting('app.company_id', true)`. Como o Prisma
// conecta com um role que pode ser owner das tabelas, FORCE garante que
// até o owner é filtrado. A aplicação precisa SETAR `app.company_id` por
// transação — é o que este helper faz.
//
// current_setting(..., true) devolve NULL quando não setado ⇒ fail-closed
// (zero linhas / WITH CHECK falha). Portanto TODO acesso às tabelas
// financeiras DEVE passar por withFinanceTenant.
//
// Requisito de conexão: a connection string precisa suportar transações de
// sessão (porta direta 5432 OU "session pooler"). O "transaction pooler"
// (6543) NÃO mantém o GUC entre statements de uma transação interativa do
// Prisma — use 5432/sessão para o app. (Ver docs/FASE1_CONTAS_A_RECEBER_DESIGN.md.)
// =====================================================================

export type TxClient = Prisma.TransactionClient;

// Abre uma transação, fixa o tenant (app.company_id) e roda `fn(tx)` dentro
// dela. Todas as queries financeiras devem usar o `tx` recebido (não o
// `prisma` global), senão rodam fora da transação e a RLS as bloqueia.
export async function withFinanceTenant<T>(
  companyId: string,
  fn: (tx: TxClient) => Promise<T>,
  opts?: { timeout?: number },
): Promise<T> {
  if (!companyId) throw new Error('withFinanceTenant: companyId obrigatório');
  return prisma.$transaction(
    async (tx) => {
      // is_local = true → escopo da transação (revertido no commit/rollback).
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return fn(tx);
    },
    { timeout: opts?.timeout ?? 15_000 },
  );
}
