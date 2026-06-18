# FASE 1 — CONTAS A RECEBER · DESENHO FINAL (para aprovação · item 7)

> **Gate do item 7.** Nada implementado ainda. Este documento apresenta tabelas,
> colunas, tipos, FKs, índices, constraints, policies RLS e impactos no código.
> Após o seu "ok", sigo com migration → APIs → UI → testes → relatório final.
>
> Decisões aprovadas respeitadas: sem `Order`; `Decimal` em todo dinheiro; RLS nesta fase;
> origem `Deal.source` com fallback `Patient.origin`; cobrança real fora de escopo.
> **Nenhuma tabela existente é alterada estruturalmente** (só adições de enum — justificadas).

---

## 1. Visão geral

4 tabelas novas + 3 enums novos + 2 extensões de enum existente (aditivas).
Padrão idêntico ao resto da base: PK `cuid()`, `companyId` escalar, `deletedAt` (onde faz sentido),
FK escalar para fora do módulo (patient/quote/contract/deal), `@relation` só **dentro** do módulo.

```
ClinicalQuote(APPROVED) ─┐
PatientContract(SIGNED) ─┼─(origem, escalar)─► Receivable ──1:N──► ReceivableInstallment ──1:N──► InstallmentPayment
Deal (rastreio/origem) ──┘                          │
RevenueCategory ◄──(categoria)──────────────────────┘
```

---

## 2. Enums

### Novos
| Enum | Valores | Observação |
|---|---|---|
| `ReceivableStatus` | `PENDENTE` `PARCIAL` `PAGO` `CANCELADO` | "Vencido" é **derivado** (ver §6), não armazenado — decisão a confirmar. |
| `InstallmentStatus` | `PENDENTE` `PARCIAL` `PAGO` `CANCELADO` | idem. |
| `PaymentMethod` | `DINHEIRO` `PIX` `CARTAO_CREDITO` `CARTAO_DEBITO` `TRANSFERENCIA` `BOLETO` `CHEQUE` `OUTRO` | **Rótulo manual** de como o paciente pagou. NÃO é integração (sem PIX/boleto reais). |

### Extensões de enums existentes (aditivas — `ALTER TYPE ADD VALUE`, padrão já usado na Telemedicina)
- `EntityType` += `RECEIVABLE`, `RECEIVABLE_INSTALLMENT`, `INSTALLMENT_PAYMENT`, `REVENUE_CATEGORY`
- `ActionType` += `SETTLE` (baixa), `CANCEL`, `REVERSE` (estorno)
> **Justificativa (item 6):** sem esses valores o `writeAudit` genérico não consegue rotular
> as operações financeiras. É a única "alteração" em objetos existentes e é puramente aditiva
> (não remove/renomeia valores; sem regressão).

---

## 3. Tabelas

### 3.1 `financial_revenue_categories` (model `RevenueCategory`)
Categorias de receita por clínica (dependência de `Receivable.categoryId`; auto-seed dos defaults
da Fase 3 — Consulta/Procedimento/Programa/Exame/Produto/Outros — via padrão `modules.ts`).

| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | TEXT | não | `cuid()` | PK |
| `companyId` | TEXT | não | | escopo multiempresa |
| `name` | TEXT | não | | |
| `isDefault` | BOOLEAN | não | `false` | semeada pelo sistema |
| `isActive` | BOOLEAN | não | `true` | |
| `order` | INTEGER | não | `0` | |
| `createdAt` | TIMESTAMP | não | `now()` | |
| `updatedAt` | TIMESTAMP | não | | `@updatedAt` |

- **Unique:** `@@unique([companyId, name])`
- **Índice:** `(companyId)`

### 3.2 `financial_receivables` (model `Receivable`) — cabeçalho da receita
| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | TEXT | não | `cuid()` | PK |
| `companyId` | TEXT | não | | |
| `patientId` | TEXT | **não** | | origem obrigatória (escalar) |
| `quoteId` | TEXT | sim | | origem: `ClinicalQuote` APPROVED |
| `contractId` | TEXT | sim | | origem: `PatientContract` SIGNED |
| `dealId` | TEXT | sim | | rastreio comercial (origem Fase 7) |
| `categoryId` | TEXT | sim | | FK → `financial_revenue_categories` |
| `description` | TEXT | não | | |
| `originalAmount` | `DECIMAL(12,2)` | não | | valor original |
| `discountAmount` | `DECIMAL(12,2)` | não | `0` | desconto |
| `finalAmount` | `DECIMAL(12,2)` | não | | = original − desconto (validado em app + CHECK) |
| `installmentsCount` | INTEGER | não | `1` | 1 = à vista |
| `status` | `ReceivableStatus` | não | `PENDENTE` | |
| `issueDate` | TIMESTAMP | não | `now()` | competência/emissão |
| `notes` | TEXT | sim | | observações |
| `createdById` | TEXT | não | | usuário (User) |
| `canceledAt` | TIMESTAMP | sim | | |
| `canceledReason` | TEXT | sim | | |
| `createdAt`/`updatedAt`/`deletedAt` | TIMESTAMP | | | soft-delete |

- **FK (`@relation`, dentro do módulo):** `categoryId → RevenueCategory` (onDelete: `Restrict`).
- **FK escalar (sem `@relation`):** `patientId`, `quoteId`, `contractId`, `dealId` (padrão da base).
- **Constraints anti-duplicação (item "evitar duplicidade", R3):**
  - `CREATE UNIQUE INDEX ... ON financial_receivables(quoteId) WHERE quoteId IS NOT NULL AND deletedAt IS NULL`
  - `CREATE UNIQUE INDEX ... ON financial_receivables(contractId) WHERE contractId IS NOT NULL AND deletedAt IS NULL`
  - → **1 orçamento/contrato → no máximo 1 receita ativa.**
- **CHECK:** `originalAmount >= 0`, `discountAmount >= 0`, `finalAmount >= 0`, `installmentsCount >= 1`.
- **Índices:** `(companyId, status)`, `(companyId, patientId)`, `(companyId, issueDate)`.

### 3.3 `financial_installments` (model `ReceivableInstallment`) — parcelas
| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | TEXT | não | `cuid()` | PK |
| `companyId` | TEXT | não | | denormalizado p/ RLS + escopo |
| `receivableId` | TEXT | não | | FK → `financial_receivables` (Cascade) |
| `number` | INTEGER | não | | 1..N |
| `amount` | `DECIMAL(12,2)` | não | | valor da parcela |
| `dueDate` | TIMESTAMP | não | | **vencimento** |
| `paidAmount` | `DECIMAL(12,2)` | não | `0` | soma das baixas |
| `status` | `InstallmentStatus` | não | `PENDENTE` | |
| `paidAt` | TIMESTAMP | sim | | quando quitada |
| `notes` | TEXT | sim | | |
| `createdAt`/`updatedAt` | TIMESTAMP | | | |

- **FK (`@relation`):** `receivableId → Receivable` (onDelete: `Cascade`).
- **Unique:** `@@unique([receivableId, number])`.
- **CHECK:** `amount >= 0`, `paidAmount >= 0`, `paidAmount <= amount`.
- **Índices:** `(companyId, status)`, `(companyId, dueDate)` ← inadimplência (Fase 9) / fluxo previsto (Fase 5).
- **Invariante (validada em app):** `Σ amount das parcelas = receivable.finalAmount`.

### 3.4 `financial_payments` (model `InstallmentPayment`) — baixas recebidas
| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | TEXT | não | `cuid()` | PK |
| `companyId` | TEXT | não | | |
| `installmentId` | TEXT | não | | FK → `financial_installments` (Cascade) |
| `amount` | `DECIMAL(12,2)` | não | | valor recebido |
| `method` | `PaymentMethod` | não | | rótulo manual |
| `paidAt` | TIMESTAMP | não | `now()` | **data efetiva** → alimenta fluxo de caixa (Fase 5) |
| `notes` | TEXT | sim | | |
| `createdById` | TEXT | não | | |
| `reversedAt` | TIMESTAMP | sim | | **estorno** (não deletar — mantém trilha) |
| `reversedById` | TEXT | sim | | |
| `reverseReason` | TEXT | sim | | |
| `createdAt` | TIMESTAMP | não | `now()` | |

- **FK (`@relation`):** `installmentId → ReceivableInstallment` (onDelete: `Cascade`).
- **CHECK:** `amount > 0`.
- **Índices:** `(companyId, paidAt)` ← fluxo de caixa, `(installmentId)`.
- Sem soft-delete: estorno é via `reversedAt` (rastreabilidade financeira não apaga lançamento).

---

## 4. RLS (item: aplicar RLS nesta fase)

**Problema:** o app conecta via Prisma com role privilegiado do Supabase, que **bypassa RLS**.
Solução em 2 partes (defense-in-depth — o filtro `companyId` da aplicação **continua** sendo a 1ª camada):

1. **No banco (migration):** para as 4 tabelas:
   ```sql
   ALTER TABLE financial_receivables ENABLE ROW LEVEL SECURITY;
   ALTER TABLE financial_receivables FORCE  ROW LEVEL SECURITY;   -- força até o owner
   CREATE POLICY tenant_isolation ON financial_receivables
     USING      (company_id = current_setting('app.company_id', true))
     WITH CHECK (company_id = current_setting('app.company_id', true));
   ```
   (idem para `financial_installments`, `financial_payments`, `financial_revenue_categories`).
2. **Na aplicação:** helper `withFinanceTenant(companyId, fn)` que abre `prisma.$transaction`,
   executa `SELECT set_config('app.company_id', $companyId, true)` (escopo de transação) e roda as
   queries financeiras dentro dela. Toda rota financeira usa esse wrapper.

**Notas:** `current_setting(..., true)` retorna NULL se não setado → com `FORCE`, qualquer acesso
fora do wrapper vê **zero linhas** (fail-closed). DDL/migrations não sofrem RLS. O auto-seed de
categorias roda dentro do wrapper (com GUC setado), então não conflita.
**Dependência de infra:** confirmar que o role de conexão **não** tem `BYPASSRLS` (se tiver, mesmo
`FORCE` é ignorado e será preciso um role dedicado). Verifico isso como 1º passo da implementação.

---

## 5. Máquina de estados (transações — item "REGRA DE TRANSAÇÃO")

Tudo dentro de `withFinanceTenant` + `$transaction`:
- **Criar receita** (de Quote/Contract): valida origem (status APPROVED/SIGNED, mesma empresa, sem receita ativa duplicada) → cria `Receivable` + N `Installment` (rateio com ajuste de centavos na última parcela) → `writeAudit(CREATE, RECEIVABLE)`.
- **Baixa** (`SETTLE`): cria `InstallmentPayment` → recalcula `installment.paidAmount/status` (PARCIAL/PAGO) → recalcula `receivable.status` (PENDENTE/PARCIAL/PAGO) → audit.
- **Estorno** (`REVERSE`): seta `reversedAt` no pagamento → recalcula parcela/receita → audit.
- **Cancelar** (`CANCEL`): `Receivable.status=CANCELADO` + `canceledAt/Reason`; parcelas em aberto → CANCELADO → audit.

---

## 6. "Vencido" derivado (decisão a confirmar)

`VENCIDO` **não** é status persistido nesta fase: é o predicado
`dueDate < now() AND status IN (PENDENTE, PARCIAL)`, calculado na leitura (dashboards, inadimplência).
**Motivo:** evita um cron obrigatório e mantém transições determinísticas. Um job diário pode
materializar depois, se desejado. *Confirmar ou pedir status persistido + cron já nesta fase.*

---

## 7. Impactos no código existente

| Arquivo | Mudança | Tipo |
|---|---|---|
| `prisma/schema.prisma` | +4 models, +3 enums, +4 `EntityType`, +3 `ActionType` | **aditivo** |
| `prisma/migrations/<nova>` | CREATE TABLE/TYPE/INDEX + RLS | nova migration |
| `src/lib/api/permissions.ts` | add `'financeiro'` em `MODULES` + `MODULE_LABELS` | aditivo (1 linha) |
| `src/lib/api/modules.ts` (`MODULE_CATALOG`) | `financeiro`: `available: false → true`, `order` | flag |
| `src/components/shell/nav-config.ts` | +1 item `{ label:'Financeiro', module:'financeiro' }` | aditivo |
| **Novos:** `lib/api/financial-access.ts` (matriz RBAC, espelho do clínico), `lib/db/financeTenant.ts` (`withFinanceTenant`), `lib/validations/financial.ts` (Zod), `app/api/financeiro/**`, `app/financeiro/**` + componentes | — | novos |

**NÃO alterado (item 6):** `ClinicalQuote`, `PatientContract`, `Deal`, `Patient` — apenas **lidos** por
id escalar (validar status/empresa). Nenhuma coluna nova neles nesta fase.

**RBAC (matriz `financial-access.ts`):** OWNER/MANAGER/SUPER_ADMIN = edit; `FINANCE` = edit;
`RECEPTION` = edit (registra/baixa); `DOCTOR` = view; `MARKETING` = none. (Confirmar matriz.)

---

## 8. Testes previstos (smoke, padrão `scripts/*-smoke.mjs`)
Geração de N parcelas soma exata ao total · anti-duplicação de receita por quote/contract ·
baixa parcial→PARCIAL e total→PAGO · estorno reverte status · cancelamento · isolamento RLS
(GUC errado/ausente ⇒ 0 linhas) · derivação de vencido.

---

## 9. Decisões finais (confirmadas 2026-06-18)
1. **Vencido derivado** (§6) — confirmado.
2. **RBAC por capacidade** — RECEPTION cria/baixa/emite recibo; NÃO estorna/cancela/exclui/altera pago. DOCTOR view; MARKETING/ATTENDANCE none. Ações críticas auditadas.
3. **Prefixo `financial_`** + PIX/BOLETO como rótulo manual — confirmado.
4. **`finalAmount` armazenado + CHECK** — confirmado.

---

# RELATÓRIO FINAL — FASE 1 (IMPLEMENTADA · 2026-06-18)

## Análise / Arquitetura / Impactos / Riscos
Conforme §1–§7 deste documento. Implementação aditiva, sem alterar tabelas existentes
(só `ALTER TYPE ADD VALUE` em `EntityType`/`ActionType`). Tudo compila: `tsc --noEmit` e
`next build` limpos.

## Entregue
**Migration** `prisma/migrations/20260618120000_add_financial_receivables/` —
4 tabelas (`financial_revenue_categories`, `financial_receivables`, `financial_installments`,
`financial_payments`), 3 enums, índices, CHECKs, índices únicos parciais anti-duplicação,
RLS `ENABLE`+`FORCE`+policy GUC nas 4 tabelas. **Pendente: aplicar no Supabase** (`prisma migrate deploy`).

**Schema** `prisma/schema.prisma` — 4 models + 3 enums + valores aditivos.

**Backend**
- `lib/db/financeTenant.ts` — `withFinanceTenant(companyId, fn)` (GUC por transação).
- `lib/financial-caps.ts` — RBAC por capacidade (puro/client-safe).
- `lib/api/financial-access.ts` — `resolveFinanceUser(cap)` + wrappers de servidor.
- `lib/validations/financial.ts` — Zod.
- `lib/api/financial-service.ts` — criar receita+parcelas (rateio em centavos), baixa, estorno,
  cancelamento, recálculo de status, seed de categorias, serialização + "vencido" derivado.
- APIs: `GET/POST /api/financeiro/categories`, `GET/POST /api/financeiro/receivables`,
  `GET /api/financeiro/receivables/sources`, `GET /api/financeiro/receivables/[id]`,
  `POST /api/financeiro/receivables/[id]/cancel`, `POST /api/financeiro/installments/[id]/payments`,
  `POST /api/financeiro/payments/[id]/reverse`, `GET /api/financeiro/summary`.
- `/api/me` agora devolve nível do módulo `financeiro`.

**Frontend**
- `/financeiro` — KPIs (Faturado/Recebido/Em aberto/Vencido), filtro por status, lista, criação inline.
- `/financeiro/[id]` — detalhe, parcelas, baixa (parcial/total), estorno, cancelamento, **recibo** imprimível.
- `components/financial/NewReceivableForm.tsx`, `receipt.ts`. Gating por capacidade no client.

**Registro do módulo:** `permissions.ts` (+`financeiro`), `modules.ts` (`available: true`), `nav-config.ts` (+item).

## Testes
- `npm run financial-rls-check` — isola por empresa + **detecta BYPASSRLS** (puro DB).
- `npm run financial-smoke` — E2E: 3 parcelas somam o total, anti-duplicação (409), baixa
  parcial→PARCIAL e total→PAGO, RECEPTION bloqueada em estorno/cancelamento (403), OWNER
  estorna/recalcula, DOCTOR view-only, MARKETING 403, auditoria CREATE/SETTLE/REVERSE/CANCEL.
- Estático: `tsc --noEmit` ✓ · `next build` ✓.
> Os smoke tests precisam de servidor + DB + service role (não rodados neste ambiente sem DB).

## Riscos residuais / ações do operador
1. **Aplicar a migration** no Supabase (`prisma migrate deploy`).
2. **RLS efetiva** depende do role de conexão NÃO ter `BYPASSRLS` — rodar `financial-rls-check`.
   Se acusar bypass, criar role dedicado; o filtro `companyId` da aplicação já garante isolamento.
3. **Conexão**: `withFinanceTenant` exige conexão de sessão/transação (porta 5432 ou session pooler),
   não o transaction pooler (6543).
4. Origem obrigatória (orçamento APPROVED / contrato SIGNED) — receitas avulsas NÃO são permitidas
   nesta fase (decisão aprovada); fácil de relaxar depois.
