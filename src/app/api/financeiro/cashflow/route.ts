import { NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';

// GET /api/financeiro/cashflow — fluxo de caixa consolidado (entradas − saídas).
// REALIZADO: pagamentos não estornados de recebíveis/despesas não cancelados (por paidAt).
// PREVISTO: saldo em aberto de parcelas/contas (por vencimento).
// Tudo agregado em SQL (date_trunc por mês), escopado por empresa (RLS + companyId).
export async function GET() {
  try {
    const { dbUser, error } = await resolvePayableUser('view');
    if (error) return error;
    const companyId = dbUser!.companyId;

    const { realizado, previsto } = await withFinanceTenant(companyId, async (tx) => {
      // Série mensal REALIZADA (entradas e saídas efetivamente pagas).
      const realizado = await tx.$queryRaw<{ m: string; entradas: number; saidas: number }[]>`
        SELECT to_char(date_trunc('month', t."paidAt"), 'YYYY-MM') AS m,
               ROUND(COALESCE(SUM(CASE WHEN t.src = 'in'  THEN t.amount END), 0), 2)::float8 AS entradas,
               ROUND(COALESCE(SUM(CASE WHEN t.src = 'out' THEN t.amount END), 0), 2)::float8 AS saidas
        FROM (
          SELECT p."paidAt", p.amount, 'in' AS src
          FROM financial_payments p
          JOIN financial_installments i ON i.id = p."installmentId"
          JOIN financial_receivables r ON r.id = i."receivableId"
          WHERE p."companyId" = ${companyId} AND p."reversedAt" IS NULL
            AND r."deletedAt" IS NULL AND r.status <> 'CANCELADO'
          UNION ALL
          SELECT pp."paidAt", pp.amount, 'out' AS src
          FROM financial_payable_payments pp
          JOIN financial_payables pa ON pa.id = pp."payableId"
          WHERE pp."companyId" = ${companyId} AND pp."reversedAt" IS NULL
            AND pa."deletedAt" IS NULL AND pa.status <> 'CANCELADO'
        ) t
        GROUP BY 1 ORDER BY 1`;

      // Série mensal PREVISTA (saldo em aberto por vencimento).
      const previsto = await tx.$queryRaw<{ m: string; entradas: number; saidas: number }[]>`
        SELECT to_char(date_trunc('month', t.due), 'YYYY-MM') AS m,
               ROUND(COALESCE(SUM(CASE WHEN t.src = 'in'  THEN t.bal END), 0), 2)::float8 AS entradas,
               ROUND(COALESCE(SUM(CASE WHEN t.src = 'out' THEN t.bal END), 0), 2)::float8 AS saidas
        FROM (
          SELECT i."dueDate" AS due, (i.amount - i."paidAmount") AS bal, 'in' AS src
          FROM financial_installments i
          JOIN financial_receivables r ON r.id = i."receivableId"
          WHERE i."companyId" = ${companyId} AND i.status IN ('PENDENTE', 'PARCIAL')
            AND r."deletedAt" IS NULL AND r.status <> 'CANCELADO'
          UNION ALL
          SELECT pa."dueDate" AS due, (pa."finalAmount" - pa."paidAmount") AS bal, 'out' AS src
          FROM financial_payables pa
          WHERE pa."companyId" = ${companyId} AND pa.status IN ('PENDENTE', 'PARCIAL')
            AND pa."deletedAt" IS NULL
        ) t
        GROUP BY 1 ORDER BY 1`;

      return { realizado, previsto };
    });

    const sum = (rows: { entradas: number; saidas: number }[], k: 'entradas' | 'saidas') =>
      Number(rows.reduce((s, r) => s + (r[k] || 0), 0).toFixed(2));

    const entradasRealizadas = sum(realizado, 'entradas');
    const saidasRealizadas = sum(realizado, 'saidas');
    const entradasFuturas = sum(previsto, 'entradas');
    const saidasFuturas = sum(previsto, 'saidas');
    const saldoAtual = Number((entradasRealizadas - saidasRealizadas).toFixed(2));
    const resultadoProjetado = Number((entradasFuturas - saidasFuturas).toFixed(2));
    const saldoPrevisto = Number((saldoAtual + resultadoProjetado).toFixed(2));

    // Série combinada por mês (realizado + previsto) para a tabela.
    const meses = Array.from(new Set([...realizado, ...previsto].map((r) => r.m))).sort();
    const rmap = new Map(realizado.map((r) => [r.m, r]));
    const pmap = new Map(previsto.map((r) => [r.m, r]));
    const series = meses.map((m) => ({
      mes: m,
      entradasReal: rmap.get(m)?.entradas ?? 0,
      saidasReal: rmap.get(m)?.saidas ?? 0,
      saldoReal: Number(((rmap.get(m)?.entradas ?? 0) - (rmap.get(m)?.saidas ?? 0)).toFixed(2)),
      entradasPrev: pmap.get(m)?.entradas ?? 0,
      saidasPrev: pmap.get(m)?.saidas ?? 0,
    }));

    return NextResponse.json({
      saldoAtual, entradasRealizadas, saidasRealizadas,
      entradasFuturas, saidasFuturas, resultadoProjetado, saldoPrevisto,
      series,
    });
  } catch (err) {
    console.error('Erro ao calcular fluxo de caixa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
