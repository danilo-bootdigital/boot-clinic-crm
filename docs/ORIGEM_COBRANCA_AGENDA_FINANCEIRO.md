# ORIGEM DA COBRANÇA — AGENDA → FINANCEIRO

> **Status:** implementado · migration `20260902120000_receivable_appointment_origin`.
> Fecha a lacuna em que um atendimento realizado **sem orçamento** não tinha como virar
> conta a receber. Aditivo: o fluxo comercial (orçamento/contrato) segue intacto.

---

## 1. O problema

`Receivable` só aceitava origem `quoteId` (ClinicalQuote APPROVED) ou `contractId`
(PatientContract SIGNED). Uma consulta avulsa, faturada no balcão, não tinha caminho:
a recepção era empurrada a **criar um orçamento fictício e aprová-lo** só para poder
cobrar — poluindo o funil comercial e falsificando a taxa de aprovação de orçamentos.

`Appointment` não tem campo de preço, e `attend` (marcar como realizado) não disparava
nada financeiro. Não havia FK nem tela ligando os dois módulos.

## 2. O modelo

Origem virou explícita, com um discriminador (`sourceType`) + o vínculo escalar
correspondente. Quatro origens:

```
Appointment(ATTENDED) ──(1:N)──┐
ClinicalQuote(APPROVED) ───────┼─(origem)─► Receivable ──1:N──► ReceivableInstallment ──1:N──► InstallmentPayment
PatientContract(SIGNED) ───────┤              │                        (faturado)                    (recebido)
(sem vínculo — MANUAL) ────────┘              └──(categoria)──► RevenueCategory
```

| `sourceType` | Vínculo obrigatório | Origem do VALOR | Quem pode criar |
|---|---|---|---|
| `APPOINTMENT` | `appointmentId` (status `ATTENDED`) | payload (o atendimento não tem preço) | `create` |
| `BUDGET` | `quoteId` (status `APPROVED`) | **derivado no servidor** (`quote.total`) | `create` |
| `CONTRACT` | `contractId` (status `SIGNED`) | **derivado no servidor** (`contract.value`) | `create` |
| `MANUAL` | nenhum (e nenhum é aceito) | payload | `create_manual` |

### Por que `Appointment → N Receivables` (sem UNIQUE)

Um atendimento pode gerar mais de uma cobrança (a consulta e o material usado, por
exemplo). O índice `(companyId, appointmentId)` é **btree comum**. A proteção contra
duplicidade acidental é de **aplicação**: o clique repetido em "Faturar atendimento"
devolve `409`; a segunda cobrança exige `allowDuplicate: true`, que só é enviado pelo
botão "Criar cobrança adicional".

### Snapshot

`sourceSnapshot` (JSONB) congela o contexto no momento do faturamento: nome do
profissional, especialidade, procedimento, data do atendimento, nome do paciente.
Valor e descrição já eram snapshot por serem colunas próprias do `Receivable`.
Renomear o médico ou mudar o tipo de consulta depois **não reescreve a cobrança
histórica** — e o detalhe da cobrança lê do snapshot, não de um join com a Agenda.

## 3. Migration

Aditiva e backward-compatible. Nenhuma coluna removida ou renomeada.

1. `CREATE TYPE "ReceivableSource"`
2. `ADD COLUMN sourceType (nulável), appointmentId, sourceSnapshot`
3. Backfill: `quoteId` → `BUDGET`; senão `contractId` → `CONTRACT`; senão `MANUAL`
   (mesma precedência do serviço, onde o orçamento manda)
4. `SET NOT NULL` — **sem DEFAULT**, de propósito: um default silencioso rotularia
   errado a origem de toda cobrança futura criada fora do serviço
5. `CREATE INDEX (companyId, appointmentId)` — não unique
6. `CHECK financial_receivables_source_link_chk`: coerência discriminador ↔ vínculo

O backfill satisfaz o CHECK por construção, então a validação sobre os dados
existentes não pode falhar.

**Validado em banco local** (container descartável, 36 migrations + linhas legadas nos
4 formatos, depois a migration nova): backfill correto nos 4 casos, `APPOINTMENT` sem
`appointmentId` recusado, duas cobranças no mesmo atendimento aceitas, e o
`financial_receivables_quoteId_active_key` (regra antiga) continuou recusando duplicata
de orçamento.

## 4. Fluxo de faturamento

1. Agenda → agendamento → **Compareceu** (o detalhe permanece aberto)
2. Bloco **Financeiro**: "Faturar atendimento" · "Faturar e receber" · "Gerar orçamento"
3. Formulário pré-preenchido (paciente, data, profissional, procedimento) com
   **descrição e valor editáveis** + vencimento
4. Confirma → `Receivable` `PENDENTE`, 1 parcela. **Nenhum `Payment` é criado.**
5. "Faturar e receber" pede valor/forma/data e chama o `registerPayment` existente
   **na mesma transação** (`billAppointment`) — sem lógica financeira paralela
6. "Gerar orçamento" continua no fluxo comercial: navega para a aba Orçamentos do
   paciente com título e item pré-preenchidos

## 5. Cobrança ≠ pagamento

Separação preservada em todos os agregados novos e antigos:

- **Faturado / competência** = `Receivable.finalAmount` — muda ao criar a cobrança
- **Recebido / caixa** = `InstallmentPayment.amount` com `reversedAt IS NULL` —
  muda só na baixa

Criar cobrança **não** entra em "recebido". O dashboard financeiro ganhou
`bySource`, com faturado e recebido em colunas separadas por origem.

## 6. Multi-tenancy e auditoria

- `companyId` é o tenant (o pedido original chamava de `clinicId`; a nomenclatura do
  sistema inteiro é `companyId` — não foi duplicada).
- Duas camadas, como no resto do módulo: filtro `companyId` na aplicação **e**
  `withFinanceTenant` fixando `app.company_id` para a RLS `FORCE`. O `Appointment` é
  carregado com `companyId` do usuário antes de qualquer escrita; atendimento de outra
  clínica devolve `404`, nunca dados.
- `AuditLog`: `CREATE`/`RECEIVABLE` com `sourceType`, `appointmentId`, `patientId`,
  `finalAmount` e `additional` (cobrança adicional); `SETTLE`/`INSTALLMENT_PAYMENT`
  para a baixa. `createdById`, `createdAt`, `updatedAt` são colunas do próprio
  `Receivable`.

## 7. Decisões deliberadas (e o que foi recusado)

| Decisão | Por quê |
|---|---|
| Enum tem **`CONTRACT`** além de APPOINTMENT/BUDGET/MANUAL | Contrato assinado já era origem real; mapeá-lo para `BUDGET` faria a tela mentir na coluna "Origem" |
| `budgetId` = o **`quoteId` existente** | Não duplicar estrutura |
| `clinicId` = **`companyId`** | Nomenclatura única no sistema |
| `MANUAL` exige **`sourceType` explícito** | É o único caminho de valor arbitrário sem vínculo: não pode ser alcançado por omissão. Payload sem origem continua caindo na mensagem antiga |
| `MANUAL` exige a capacidade **`create_manual`** (OWNER/MANAGER/FINANCE/SUPER_ADMIN) | `RECEPTION` mantém `create` (origem vinculada) mas não emite cobrança de valor livre |
| Valor do `APPOINTMENT` vem do payload | Inevitável — `Appointment` não tem preço. Contrabalançado por: exigir atendimento `ATTENDED` real, da mesma clínica e do mesmo paciente, + RBAC + auditoria |
| **`/api/dashboard/kpis` intocado** | Decisão do produto: corrigir o domínio antes de mexer no dashboard geral |

## 8. Superfície alterada

**Schema:** `ReceivableSource`; `Receivable.sourceType|appointmentId|sourceSnapshot`;
índice `(companyId, appointmentId)`.

**Serviço** (`lib/api/financial-service.ts`): `resolveSourceType`,
`buildAppointmentSnapshot`, `billAppointment`; origem no `createReceivable`;
`serializeReceivable` expõe a origem.

**Endpoints:**

| Método | Rota | Capacidade |
|---|---|---|
| GET | `/api/agenda/appointments/[id]/billing` | `view` |
| POST | `/api/agenda/appointments/[id]/billing` | `create` (+ `settle` com `payment`) |
| GET | `/api/financeiro/patients/[patientId]` | `view` |
| POST | `/api/financeiro/receivables` *(alterado)* | `create` (+ `create_manual` se `MANUAL`) |
| GET | `/api/financeiro/dashboard` *(alterado)* | `view` — passa a devolver `bySource` |

**UI:** bloco Financeiro no detalhe do agendamento; aba Financeiro na ficha do
paciente; coluna e card "Origem" no Financeiro; "Receita por origem" no dashboard;
cobrança manual no formulário de novo recebível; `prefill` nos Orçamentos.

## 9. Riscos conhecidos

- **Valor livre em duas origens** (`APPOINTMENT` e `MANUAL`). Mitigado por RBAC
  distinto, vínculo obrigatório no caso do atendimento e auditoria com a origem.
- **`sourceType` sem DEFAULT**: qualquer `INSERT` fora do serviço falha até declarar
  a origem. É proposital, mas quebra scripts ad-hoc que insiram recebível direto.
- **Ordem de deploy**: migration **antes** do código. A migration é aditiva, então
  rodá-la com o código antigo no ar é seguro; o inverso não é.
