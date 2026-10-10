# DIRETRIZ — MÓDULO DE ESTOQUE

> **Status:** Fases 0 e 1 implementadas (2026-10-10, branch `feat/estoque`; migration
> `20261010120000_stock_base` validada no banco local, **não aplicada em produção**). Desenho
> registrado em 2026-10-08. Ver §13.
> Fonte: pedido do Danilo — "módulo de estoque o mais completo possível para uma clínica".
> Segue os padrões da base: `companyId` em tudo, FK escalar entre módulos (sem `@relation`
> cruzando domínios), snapshot do contexto histórico, `AuditLog` genérico, RBAC por
> capacidade (`*-caps.ts` client-safe) e controle SaaS por `moduleKey`.

---

## 1. O problema

Hoje a clínica **compra** (Contas a Pagar, categoria "Material clínico") e **cadastra o
fornecedor**, mas não sabe:

- quanto tem de cada item, nem onde (almoxarifado, sala, geladeira);
- **lote e validade** do que tem — crítico para injetáveis, toxina, bioestimuladores, fios;
- **em qual paciente** foi aplicado cada lote (recall/tecnovigilância);
- quanto cada procedimento **custa** em material (margem real);
- quando repor (hoje é tarefa manual: "Repor estoque de bioestimuladores").

## 2. Escopo

**Dentro:** catálogo de itens, unidades com conversão, locais, lotes/validade, razão de
movimentações (kardex), saldo por item×lote×local, recebimento de compra → Contas a Pagar,
ficha técnica (kit) por tipo de atendimento, baixa pelo atendimento, rastreabilidade
lote→paciente→prontuário, frascos multidose abertos, transferências, perdas/descartes,
inventário (contagem), pedidos de compra com sugestão de reposição, venda de produtos
(revenda/home care) → Contas a Receber, alertas, relatórios e custo por procedimento.

**Fora (v1):** emissão de NF-e, integração SNGPC, integração com ERP/contabilidade,
controle de patrimônio/equipamentos (depreciação), multi-filial com transferência entre
`Company` diferentes. Importação de XML de NF-e e leitura de código de barras ficam para a
Fase 8.

## 3. Conceitos

| Conceito | Definição |
|---|---|
| **Item** | O que se estoca (ex.: "Toxina botulínica 100U", "Seringa 1 ml", "Ácido hialurônico 1 ml"). |
| **Unidade base** | Menor unidade em que o item é consumido/contado (U, ml, un, g). Todo saldo é guardado nela. |
| **Unidade de compra** | Como se compra (caixa, frasco). `fatorConversao` = quantas unidades base cabem nela (frasco 100U → 100). |
| **Local** | Onde fisicamente está: almoxarifado, sala (liga em `Room`), geladeira, carrinho. |
| **Lote** | Nº do lote do fabricante + validade + custo de entrada. Itens sem controle de lote usam um lote "padrão" implícito. |
| **Movimentação** | Linha imutável do razão (entrada/saída/ajuste/transferência). Nunca se edita nem se apaga — corrige-se com **estorno**. |
| **Saldo** | Cache materializado de Σ movimentações por item×lote×local. Pode ser recalculado do razão a qualquer momento. |
| **Ficha técnica (kit)** | Lista de itens/quantidades consumidos por um tipo de atendimento. |
| **Frasco aberto** | Unidade multidose em uso, com validade pós-abertura (ex.: toxina reconstituída). |

## 4. Modelo de dados (rascunho Prisma)

Quantidades em `Decimal(14,4)` (há consumo fracionado: 0,5 ml, 12,5 U). Valores em
`Decimal(12,2)`; custo unitário em `Decimal(14,6)`.

```prisma
// ---- CADASTROS ----

model StockCategory {            // Injetáveis, Descartáveis, Cosméticos, Medicamentos, Escritório...
  id        String   @id @default(cuid())
  companyId String
  name      String
  isDefault Boolean  @default(false)
  isActive  Boolean  @default(true)
  order     Int      @default(0)
  @@unique([companyId, name])
  @@map("stock_categories")
}

model StockItem {
  id                 String        @id @default(cuid())
  companyId          String
  categoryId         String?
  name               String
  sku                String?       // código interno
  barcode            String?       // EAN/GTIN (Fase 8: leitura por câmera)
  kind               StockItemKind // INSUMO | MEDICAMENTO | INJETAVEL | DESCARTAVEL | REVENDA | USO_INTERNO
  manufacturer       String?
  anvisaRegistration String?       // nº de registro ANVISA
  baseUnit           String        // "U", "ml", "un", "g"
  purchaseUnit       String?       // "frasco", "caixa"
  conversionFactor   Decimal       @default(1) @db.Decimal(14,4) // base por unidade de compra
  // Controles
  tracksLot          Boolean       @default(true)
  tracksExpiry       Boolean       @default(true)
  tracksPatient      Boolean       @default(false) // exige paciente na saída (injetáveis/implantáveis)
  isControlled       Boolean       @default(false) // Portaria SVS/MS 344/98 — livro de controlados
  controlledList     ControlledList? // lista da Portaria 344/98 (obrigatória se isControlled)
  controlledNote     String?       // OBSERVAÇÃO exibida em destaque onde o item aparecer (§5.11)
  storageTemp        StorageTemp   @default(AMBIENTE) // AMBIENTE | REFRIGERADO | CONGELADO
  multiDose          Boolean       @default(false)
  openedShelfLifeHours Int?        // validade após abrir/reconstituir
  // Reposição (em unidade base)
  minQty             Decimal?      @db.Decimal(14,4) // estoque mínimo (alerta vermelho)
  reorderPoint       Decimal?      @db.Decimal(14,4) // ponto de pedido (alerta amarelo)
  maxQty             Decimal?      @db.Decimal(14,4) // teto p/ sugestão de compra
  leadTimeDays       Int?          // prazo médio do fornecedor
  preferredSupplierId String?      // Supplier (escalar)
  // Custos/preço
  avgCost            Decimal       @default(0) @db.Decimal(14,6) // custo médio ponderado (por unidade base)
  lastCost           Decimal?      @db.Decimal(14,6)
  salePrice          Decimal?      @db.Decimal(12,2) // só REVENDA
  isActive           Boolean       @default(true)
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  deletedAt          DateTime?
  @@unique([companyId, name])
  @@index([companyId, categoryId])
  @@map("stock_items")
}

model StockLocation {
  id          String            @id @default(cuid())
  companyId   String
  name        String            // "Almoxarifado", "Geladeira 1", "Sala 2"
  type        StockLocationType // ALMOXARIFADO | SALA | GELADEIRA | CARRINHO | OUTRO
  roomId      String?           // Room (escalar) quando type = SALA
  storageTemp StorageTemp       @default(AMBIENTE)
  isDefault   Boolean           @default(false) // destino padrão de recebimentos
  controlledStorage Boolean       @default(false) // armário/local trancado p/ controlados
  isActive    Boolean           @default(true)
  @@unique([companyId, name])
  @@map("stock_locations")
}

model StockLot {
  id           String         @id @default(cuid())
  companyId    String
  itemId       String
  lotNumber    String         // "PADRAO" p/ item sem controle de lote
  expiresAt    DateTime?
  manufacturedAt DateTime?
  supplierId   String?
  unitCost     Decimal        @db.Decimal(14,6) // custo de entrada por unidade base
  status       StockLotStatus @default(LIBERADO) // LIBERADO | QUARENTENA | BLOQUEADO | RECOLHIDO
  blockReason  String?
  createdAt    DateTime       @default(now())
  @@unique([companyId, itemId, lotNumber])
  @@index([companyId, expiresAt])
  @@map("stock_lots")
}

// ---- SALDO (cache) + RAZÃO (fonte da verdade) ----

model StockBalance {
  id         String  @id @default(cuid())
  companyId  String
  itemId     String
  lotId      String
  locationId String
  quantity   Decimal @db.Decimal(14,4) // unidade base
  updatedAt  DateTime @updatedAt
  @@unique([companyId, itemId, lotId, locationId])
  @@index([companyId, itemId])
  @@map("stock_balances")
}

model StockMovement {
  id            String            @id @default(cuid())
  companyId     String
  type          StockMovementType
  itemId        String
  lotId         String
  locationId    String
  quantity      Decimal           @db.Decimal(14,4) // COM SINAL: + entra, − sai (unidade base)
  unitCost      Decimal           @db.Decimal(14,6) // snapshot do custo no momento
  totalCost     Decimal           @db.Decimal(12,2)
  // Vínculos de origem (todos escalares, opcionais conforme o tipo)
  receiptId     String?           // StockReceipt
  transferId    String?           // agrupa as 2 pernas de uma transferência
  countId       String?           // InventoryCount (ajuste de inventário)
  appointmentId String?           // consumo em atendimento
  patientId     String?           // rastreabilidade
  professionalId String?
  medicalRecordId String?         // registro de aplicação no prontuário
  receivableId  String?           // venda
  openContainerId String?
  reason        String?           // obrigatório em AJUSTE/PERDA
  reversalOfId  String?           // estorno aponta para a original
  reversedAt    DateTime?
  snapshot      Json?             // nome do item, lote, validade, paciente — congelado
  occurredAt    DateTime          @default(now())
  createdById   String
  createdAt     DateTime          @default(now())
  @@index([companyId, itemId, occurredAt])
  @@index([companyId, lotId])
  @@index([companyId, patientId])
  @@index([companyId, appointmentId])
  @@index([companyId, type, occurredAt])
  @@map("stock_movements")
}

// ---- MULTIDOSE ----

model StockOpenContainer {        // frasco aberto/reconstituído
  id          String   @id @default(cuid())
  companyId   String
  itemId      String
  lotId       String
  locationId  String
  openedAt    DateTime @default(now())
  expiresAt   DateTime // openedAt + openedShelfLifeHours (ou menor validade do lote)
  initialQty  Decimal  @db.Decimal(14,4)
  remainingQty Decimal @db.Decimal(14,4)
  closedAt    DateTime? // esgotado ou descartado
  closedReason String?  // ESGOTADO | VENCIDO | CONTAMINADO
  openedById  String
  @@index([companyId, itemId, closedAt])
  @@map("stock_open_containers")
}

// ---- COMPRAS ----

model PurchaseOrder {
  id          String              @id @default(cuid())
  companyId   String
  number      Int                 // sequencial por clínica
  supplierId  String
  status      PurchaseOrderStatus // RASCUNHO | AGUARDANDO_APROVACAO | APROVADO | ENVIADO | PARCIAL | RECEBIDO | CANCELADO
  expectedAt  DateTime?
  notes       String?
  total       Decimal             @db.Decimal(12,2)
  createdById String
  approvedById String?
  approvedAt  DateTime?
  items       PurchaseOrderItem[]
  @@unique([companyId, number])
  @@map("stock_purchase_orders")
}

model PurchaseOrderItem {
  id            String  @id @default(cuid())
  companyId     String
  orderId       String
  itemId        String
  qtyPurchase   Decimal @db.Decimal(14,4) // em unidade de compra
  unitPrice     Decimal @db.Decimal(12,2)
  qtyReceived   Decimal @default(0) @db.Decimal(14,4)
  order PurchaseOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@map("stock_purchase_order_items")
}

model StockReceipt {              // recebimento (conferência da entrega)
  id             String   @id @default(cuid())
  companyId      String
  supplierId     String?
  purchaseOrderId String?
  invoiceNumber  String?  // nº da NF
  invoiceKey     String?  // chave de acesso (44 dígitos) — Fase 8 importa o XML
  invoiceDate    DateTime?
  freight        Decimal  @default(0) @db.Decimal(12,2) // rateado no custo
  discount       Decimal  @default(0) @db.Decimal(12,2)
  total          Decimal  @db.Decimal(12,2)
  payableId      String?  // Payable gerado (escalar)
  status         StockReceiptStatus // RASCUNHO | CONFIRMADO | ESTORNADO
  receivedAt     DateTime @default(now())
  createdById    String
  items          StockReceiptItem[]
  @@map("stock_receipts")
}

model StockReceiptItem {
  id          String   @id @default(cuid())
  companyId   String
  receiptId   String
  itemId      String
  lotNumber   String
  expiresAt   DateTime?
  locationId  String
  qtyPurchase Decimal  @db.Decimal(14,4)
  unitPrice   Decimal  @db.Decimal(12,2) // por unidade de compra
  receipt StockReceipt @relation(fields: [receiptId], references: [id], onDelete: Cascade)
  @@map("stock_receipt_items")
}

// ---- FICHA TÉCNICA ----

model ProcedureKit {
  id                String  @id @default(cuid())
  companyId         String
  appointmentTypeId String  // AppointmentType (escalar) — âncora do kit
  name              String
  consumptionMode   StockConsumptionMode? // null = herda o padrão da clínica (ver §5.14)
  isActive          Boolean @default(true)
  items             ProcedureKitItem[]
  @@unique([companyId, appointmentTypeId])
  @@map("stock_procedure_kits")
}

model ProcedureKitItem {
  id        String  @id @default(cuid())
  companyId String
  kitId     String
  itemId    String
  quantity  Decimal @db.Decimal(14,4) // padrão, em unidade base
  variable  Boolean @default(false)   // quantidade decidida na hora (ex.: unidades de toxina)
  optional  Boolean @default(false)   // vem desmarcado na baixa
  kit ProcedureKit @relation(fields: [kitId], references: [id], onDelete: Cascade)
  @@map("stock_procedure_kit_items")
}

// ---- INVENTÁRIO ----

model InventoryCount {
  id          String               @id @default(cuid())
  companyId   String
  locationId  String?              // null = todos os locais
  categoryId  String?              // contagem cíclica por categoria
  status      InventoryCountStatus // ABERTO | EM_CONTAGEM | EM_REVISAO | CONCLUIDO | CANCELADO
  blind       Boolean @default(true) // contagem cega: não mostra o saldo do sistema
  startedAt   DateTime @default(now())
  closedAt    DateTime?
  createdById String
  approvedById String?
  items       InventoryCountItem[]
  @@map("stock_inventory_counts")
}

model InventoryCountItem {
  id          String   @id @default(cuid())
  companyId   String
  countId     String
  itemId      String
  lotId       String
  locationId  String
  systemQty   Decimal  @db.Decimal(14,4) // congelado na abertura
  countedQty  Decimal? @db.Decimal(14,4)
  countedById String?
  note        String?
  count InventoryCount @relation(fields: [countId], references: [id], onDelete: Cascade)
  @@map("stock_inventory_count_items")
}
```

### Enums

```prisma
enum StockMovementType {
  ENTRADA_COMPRA        // via StockReceipt
  ENTRADA_BONIFICACAO   // amostra/brinde do fornecedor (custo 0 ou informado)
  ENTRADA_DEVOLUCAO     // paciente/sala devolveu
  CONSUMO_ATENDIMENTO   // baixa do kit no atendimento
  CONSUMO_INTERNO       // uso administrativo/limpeza
  VENDA                 // revenda/home care
  PERDA                 // vencimento, quebra, contaminação, temperatura
  DEVOLUCAO_FORNECEDOR
  TRANSFERENCIA_SAIDA
  TRANSFERENCIA_ENTRADA
  AJUSTE_INVENTARIO     // diferença da contagem
  AJUSTE_MANUAL         // com motivo obrigatório
  ESTORNO               // inverso de uma movimentação
}

enum ControlledList {  // listas da Portaria SVS/MS 344/98
  A1 A2 A3   // entorpecentes / psicotrópicos (notificação A)
  B1 B2      // psicotrópicos / anorexígenos (notificação B)
  C1 C2 C3 C4 C5 // controle especial, retinoides, imunossupressores, antirretrovirais, anabolizantes
}

enum StockConsumptionMode {
  AUTOMATICA  // baixa o kit ao marcar ATTENDED
  CONFIRMADA  // baixa só após confirmação no painel "Materiais utilizados"
}
```

Configurações da clínica no módulo (tabela `StockSettings`, 1 linha por `companyId`):
`defaultConsumptionMode` (default `CONFIRMADA`), `expiryAlertDays`,
`overconsumptionAlertPct`.

```prisma
```

`AuditLog.EntityType` ganha: `STOCK_ITEM`, `STOCK_LOT`, `STOCK_LOCATION`,
`STOCK_MOVEMENT`, `STOCK_RECEIPT`, `PURCHASE_ORDER`, `PROCEDURE_KIT`, `INVENTORY_COUNT`.

## 5. Regras de negócio

1. **O razão é a verdade.** `StockMovement` é append-only. Corrigir = `ESTORNO` apontando
   `reversalOfId`. `StockBalance` é cache atualizado na **mesma transação** do movimento;
   um job/rota de manutenção recalcula do razão e reporta divergências.
2. **Concorrência.** Saída usa `UPDATE stock_balances SET quantity = quantity - $q
   WHERE id = $id AND quantity >= $q` dentro da transação; 0 linhas afetadas = saldo
   insuficiente → erro 409. Sem leitura-depois-escrita.
3. **Saldo negativo: NUNCA (decidido: Danilo, 2026-10-08).** Não existe configuração
   para liberar. Toda saída sem saldo suficiente (no local/lote escolhido) é **recusada e
   emite alerta**:
   - **na tela**, para quem tentou: mensagem clara com item, saldo disponível × pedido,
     e saídas possíveis (outro lote, outro local com saldo, transferir, registrar entrada);
   - **para a gestão**: notificação "Saída recusada por falta de saldo" (item, local,
     quantidade, usuário, atendimento/paciente quando houver) no sino de notificações +
     `FollowUpTask` ADMINISTRATIVO para regularizar (uma tarefa aberta por item×local,
     sem duplicar);
   - **registro**: a tentativa recusada fica no `AuditLog` (`STOCK_MOVEMENT`,
     ação `REJECTED_NO_BALANCE`), para o relatório de rupturas.
   O atendimento clínico **não trava**: o atendimento é marcado como realizado e o item
   não baixado fica como pendência no painel "Materiais utilizados" até haver saldo.
4. **FEFO** (vence primeiro, sai primeiro): a baixa sugere automaticamente o lote liberado
   de menor validade no local do atendimento; o usuário pode trocar o lote.
5. **Validade bloqueia.** Lote vencido não sai por consumo/venda — só por `PERDA`. O status
   "vencido" é **derivado** (`expiresAt < agora`), sem cron (mesmo padrão de Tarefas).
6. **Lote em QUARENTENA/BLOQUEADO/RECOLHIDO** não sai, exceto como perda ou devolução.
7. **Custo médio ponderado** por item, recalculado a cada entrada:
   `novoCusto = (saldoTotal × custoAtual + qtdEntrada × custoEntrada) / (saldoTotal + qtdEntrada)`.
   Saídas usam o custo médio vigente (snapshot em `unitCost`). Frete e desconto da nota
   são rateados proporcionalmente ao valor de cada item.
8. **Conversão de unidades** acontece só na entrada (compra → base). Tudo depois é unidade base.
9. **Rastreio de paciente:** item com `tracksPatient` só sai com `patientId`. Toda saída de
   injetável gera linha consultável "lote X → paciente Y → data → profissional".
10. **Multidose:** abrir frasco = movimento de saída do frasco inteiro para o
    `StockOpenContainer` (sai do saldo e passa a ser controlado no frasco). Consumos debitam o
    `remainingQty`. Sobra no fechamento por vencimento vira `PERDA` registrada com quantidade
    → o relatório de perdas mostra o desperdício real de toxina.
11. **Medicamentos controlados (Portaria SVS/MS 344/98) — as clínicas usam (confirmado:
    Danilo, 2026-10-08).**
    - **Cadastro:** item marcado `isControlled` exige a **lista** da portaria
      (`controlledList`) e aceita uma **observação** (`controlledNote`), por exemplo
      "Guardar no armário trancado — conferir receita retida antes de aplicar".
    - **Observação sempre visível:** onde o item aparecer (catálogo, detalhe, painel
      "Materiais utilizados", recebimento, transferência, inventário, registro no
      prontuário) aparece o selo **CONTROLADO · lista X** e a observação em destaque. Na
      baixa, o usuário precisa **marcar que leu** a observação antes de confirmar.
    - **Nunca saem automaticamente:** mesmo no modo AUTOMATICA (§5.14), item controlado
      vira pendência e só sai com confirmação de quem tem a capacidade `controlled`.
    - **Saída exige:** paciente + profissional responsável + justificativa (texto
      obrigatório), além de lote. Item controlado também é sempre `tracksPatient`.
    - **Guarda:** só pode ficar em local `controlledStorage`; recebimento e transferência
      para outro local são recusados.
    - **Ajuste, perda e estorno:** só gestão (OWNER/MANAGER), com motivo; inventário de
      controlados não aceita contagem cega com diferença sem aprovação.
    - **Livro de registro:** relatório de entradas/saídas/saldo por item e lote no formato
      do livro, exportável. É um **apoio** ao registro exigido da clínica: o sistema não
      substitui o responsável técnico nem a escrituração oficial (mesmo princípio de "sem
      validade jurídica" do pedido de exames).
12. **Transferência** = duas pernas (`SAIDA` + `ENTRADA`) com o mesmo `transferId`, numa
    transação. Valida temperatura: item `REFRIGERADO` não vai para local `AMBIENTE` sem
    confirmação.
13. **Snapshot:** cada movimento congela nome do item, lote, validade, paciente e custo.
    Renomear item ou mudar custo depois não reescreve o histórico.
14. **Baixa no atendimento — dois modos (decidido: Danilo, 2026-10-08).**
    Padrão por clínica (configuração do módulo), sobrescrevível por kit
    (`ProcedureKit.consumptionMode`; `null` herda o da clínica).
    - **CONFIRMADA:** marcar `ATTENDED` não mexe no estoque; abre o painel "Materiais
      utilizados" pré-preenchido pelo kit. Nada é baixado até alguém confirmar.
    - **AUTOMATICA:** marcar `ATTENDED` baixa na mesma transação os itens **fixos e não
      opcionais** do kit, com lote FEFO do local da sala do atendimento (ou o local padrão).
      Itens `variable` (ex.: unidades de toxina) e `optional` **nunca** saem sozinhos:
      ficam como pendência de confirmação no painel.
    - Na automática, **falta de saldo ou lote inválido não impede o atendimento**: o item
      não baixado vira pendência (alerta + tarefa). Atendimento clínico nunca trava por
      estoque.
    - Corrigir depois (nos dois modos) = estorno da linha + nova baixa, pelo mesmo painel,
      com motivo e auditoria. Item `tracksPatient` baixado automaticamente também gera o
      registro de aplicação no prontuário.
    - Toda baixa grava a origem (`snapshot.consumptionMode` = AUTOMATICA | CONFIRMADA),
      para o relatório separar o que foi conferido do que foi presumido pelo kit.

## 6. Integrações com os módulos existentes

| Módulo | Integração |
|---|---|
| **Fornecedores** (`Supplier`) | Reaproveitado. Item ganha fornecedor preferencial; lote guarda fornecedor de origem. Ficha do fornecedor mostra histórico de compras e prazo médio real. |
| **Contas a Pagar** | Confirmar um `StockReceipt` gera `Payable` (fornecedor, categoria "Material clínico", centro de custo, vencimento/parcelas informados) e grava `payableId`. Estornar o recebimento cancela o Payable se ainda não pago; se pago, bloqueia e exige devolução ao fornecedor. |
| **Agenda** | Ao marcar `ATTENDED`, a baixa segue o modo do kit (§5.14): **CONFIRMADA** abre o painel "Materiais utilizados" pré-preenchido para confirmar; **AUTOMATICA** baixa o kit na hora (FEFO) e o painel fica disponível para corrigir. Cancelar/desfazer atendimento estorna as baixas. Atendimento sem baixa (ou com itens pendentes) aparece como pendência. |
| **Prontuário** | Baixa de item `tracksPatient` cria/complementa `MedicalRecord` tipo PROCEDURE com produto, lote, validade, quantidade e região (texto) → registro de aplicação. |
| **Paciente** | Nova seção na aba Prontuário (ou aba "Produtos aplicados"): lotes aplicados no paciente. |
| **Contas a Receber** | Venda de produto (REVENDA) cria `Receivable` com novo `sourceType = PRODUCT_SALE` + movimentos `VENDA`. Material cobrado à parte no atendimento continua usando a origem `APPOINTMENT` (já suporta N cobranças por atendimento). |
| **Orçamentos** | `ClinicalQuoteItem` ganha `stockItemId?` opcional para orçar produto de revenda com preço do catálogo. |
| **Tarefas** | Alertas acionáveis viram `FollowUpTask` ADMINISTRATIVO ("Repor X", "Descartar lote Y vencido", "Concluir inventário") — uma tarefa aberta por alerta, sem duplicar. |
| **Dashboard / Relatórios** | KPIs de estoque e custo de material por atendimento entram na margem. |
| **Financeiro (DRE futura, Fase 11)** | CMV = Σ custo das saídas por consumo/venda no período; perdas em linha própria. |
| **Auditoria** | `writeAudit` em todo cadastro, ajuste, estorno, mudança de status de lote e aprovação. |
| **Controle SaaS** | `moduleKey = 'estoque'` em `Module`; `requireModuleEnabled` nas rotas; sidebar oculta quando desligado. |
| **Portal do Paciente** | Default-deny: nada de estoque é exposto. (Futuro opcional: paciente vê "produto e lote aplicados" se a clínica liberar.) |

> **Por que o kit fica no `AppointmentType`:** não existe catálogo de procedimentos na base
> (`Appointment.type` é texto e `ClinicalQuoteItem.description` também). `AppointmentType` é o
> cadastro estruturado mais próximo. Se um catálogo de procedimentos surgir, `ProcedureKit`
> ganha `procedureId?` sem migração destrutiva.

## 7. Permissões (`stock-caps.ts`, client-safe)

| Capacidade | O que libera |
|---|---|
| `view` | Ver itens, saldos, lotes, validades |
| `view_cost` | Ver custos, valor do estoque, margens |
| `consume` | Dar baixa em atendimento / consumo interno |
| `receive` | Registrar recebimento de mercadoria |
| `transfer` | Transferir entre locais |
| `adjust` | Ajuste manual, perda, estorno |
| `count` | Contar inventário |
| `approve_count` | Aprovar inventário (gera ajustes) |
| `purchase` | Criar pedido de compra |
| `approve_purchase` | Aprovar pedido |
| `manage` | Cadastros (itens, locais, kits, categorias), status de lote/recall |
| `controlled` | Movimentar itens controlados |
| `sell` | Venda de produtos |

| Papel | Capacidades (proposta) |
|---|---|
| OWNER / MANAGER / SUPER_ADMIN | todas |
| FINANCE | view, view_cost, receive, purchase, approve_purchase, sell |
| DOCTOR | view, consume, controlled (só nos próprios atendimentos) |
| RECEPTION | view, consume, receive, transfer, count, sell |
| ATTENDANCE / MARKETING | nenhuma |

**Médico não vê custo de nada (decidido: Danilo, 2026-10-08).** `DOCTOR` nunca recebe
`view_cost`. A regra vale **no servidor**: para quem não tem `view_cost`, as APIs do
estoque **removem do JSON** todos os campos de valor (`avgCost`, `lastCost`, `unitCost`,
`totalCost`, `salePrice` de revenda, valores de nota/pedido, custo do kit, valor em
estoque, perdas em R$, margem), sem só esconder na tela. Para esses papéis, a Visão geral,
a ficha técnica, o kardex, os relatórios e o painel "Materiais utilizados" mostram só
quantidades. Relatórios de valor (ABC, custo/margem por procedimento, perdas em R$) não
aparecem para eles.

**Baixa no atendimento (decidido: Danilo, 2026-10-08): médico E recepção.** O médico
confirma/corrige a baixa dos atendimentos em que é o `professionalId`; a recepção, de
qualquer atendimento da clínica (gestão também). Cada linha grava quem baixou
(`createdById`) e o profissional do atendimento (`professionalId`), e o painel mostra
"baixado por <nome>". Quem confirmou primeiro fecha o painel; o outro só corrige
(estorno + nova baixa, com motivo), sem baixa em dobro.

Igual a Contas a Pagar, recebimento que **gera Payable** exige `receive` E acesso a Contas a
Pagar (`payableCan`). Sem esse acesso, a recepção dá entrada física e o Payable fica como
pendência para o financeiro.

## 8. Telas

Rota `/estoque`, com abas:

1. **Visão geral:** KPIs (valor em estoque, itens abaixo do mínimo, vencendo em 30/60/90
   dias, perdas no mês em R$, giro, cobertura em dias); lista "Ação necessária"; gráfico
   de consumo × entradas.
2. **Itens:** catálogo com saldo total, selo **CONTROLADO** + observação, status (ok / repor / crítico / zerado), filtros por
   categoria, local, tipo e controlado. **Detalhe do item:** saldos por local×lote,
   validades, kardex com filtros, consumo médio diário, fornecedores e últimos preços,
   kits em que aparece.
3. **Movimentar:** entrada avulsa, consumo interno, perda, transferência, ajuste (atalhos
   rápidos, com formulário de lote).
4. **Recebimentos:** conferência da nota (a partir de pedido ou avulsa) → confirmar gera
   movimentos + Payable.
5. **Compras:** pedidos de compra; **sugestão de reposição** = itens com saldo ≤ ponto de
   pedido, quantidade = `maxQty − saldo − pedido em aberto`, agrupados por fornecedor
   preferencial.
6. **Inventário:** abrir contagem (total ou cíclica), contagem cega no celular, revisão
   das divergências, aprovação → ajustes.
7. **Fichas técnicas:** kit por tipo de atendimento, com custo estimado do kit.
8. **Rastreabilidade:** busca por lote → pacientes, datas, profissionais; ação **Recolher
   lote** (bloqueia o saldo + lista de pacientes para contato via Mensageria).
9. **Frascos abertos:** multidose em uso, tempo restante e alerta de vencimento.
10. **Relatórios:** ver §10.
11. **Configurações:** locais, categorias, unidades, **modo padrão de baixa no atendimento
    (automática/confirmada)**, dias de
    antecedência dos alertas de validade.

**No atendimento (Agenda):** painel "Materiais utilizados" no drawer do agendamento.
**No paciente:** lista de "Produtos aplicados".

## 9. Alertas

Calculados na leitura (sem cron), exibidos na Visão geral e no sino de notificações;
os acionáveis geram Tarefa:

- **saída recusada por falta de saldo** (ruptura) — imediato, ver §5.3;
- abaixo do mínimo (crítico) / no ponto de pedido (repor);
- lote vencendo (30/60/90 dias, configurável) / vencido com saldo;
- frasco aberto perto do vencimento;
- atendimento realizado sem baixa de material;
- consumo acima do kit (> X% configurável) — possível desperdício ou erro;
- pedido de compra atrasado (passou de `expectedAt`);
- inventário com divergência acima de X%.

## 10. Relatórios

- Posição de estoque (por local, categoria, lote) com valor;
- Kardex por item / período;
- Curva ABC (valor consumido);
- Giro e cobertura (dias de estoque);
- Validades (a vencer / vencidos);
- Perdas por motivo, item e local (R$ e quantidade);
- **Custo por procedimento** (real × kit) e **margem por atendimento** (receita − material);
- Consumo por profissional (normalizado por atendimento);
- Rastreabilidade lote → paciente;
- Compras por fornecedor (preço médio, prazo real × prometido);
- Livro de controlados;
- Divergências de inventário.

Todos exportam CSV (padrão da Fase 10 do Financeiro).

## 11. Fases de implementação

| Fase | Entrega | Depende de |
|---|---|---|
| **0** | Schema base (item, categoria, local, lote, saldo, movimento) + `stock-caps` + módulo SaaS + auditoria | — |
| **1** | Catálogo (com marcação de controlado, lista e observação já visível), locais, entrada avulsa, consumo interno, perda, ajuste, transferência, kardex, saldo | 0 |
| **2** | Recebimento de mercadoria → Contas a Pagar, custo médio, rateio de frete | 1 |
| **3** | Fichas técnicas + baixa no atendimento (FEFO) + rastreio do paciente + registro no prontuário | 1 |
| **4** | Visão geral, alertas, integração com Tarefas | 1 |
| **5** | Multidose (frascos abertos) + regras completas de controlados (bloqueio da baixa automática, justificativa, local trancado, livro de registro) | 3 |
| **6** | Inventário (cego, cíclico, aprovação) | 1 |
| **7** | Pedidos de compra + sugestão de reposição + aprovação | 2 |
| **8** | Venda de produtos → Contas a Receber (`PRODUCT_SALE`) + item no orçamento | 2 |
| **9** | Relatórios (ABC, giro, perdas, custo/margem por procedimento, livro de controlados) | 3 |
| **10** | Importação de XML de NF-e, leitura de código de barras, recall com disparo pela Mensageria | 2, 3 |

O MVP útil é **0 → 1 → 2 → 3**: a clínica passa a saber quanto tem, quanto custou e em quem
aplicou.

## 12. Decisões a confirmar com o Danilo

1. ~~**Baixa no atendimento**~~ — **DECIDIDO (2026-10-08): os dois modos**, configurável
   por clínica e por kit. Ver §5.14.
2. ~~**Saldo negativo**~~ — **DECIDIDO (2026-10-08): nunca permitir; recusar a saída e
   emitir alerta** (tela + gestão + tarefa + auditoria). Ver §5.3.
3. ~~**Quem dá baixa**~~ — **DECIDIDO (2026-10-08): médico e recepção.** Médico nos
   próprios atendimentos; recepção em qualquer atendimento. Ver §7.
4. ~~**Venda de produtos (home care)**~~ — **DECIDIDO (2026-10-10): fica para a Fase 8.**
   O MVP é 0 → 1 → 2 → 3; o cadastro já aceita `kind = REVENDA` e `salePrice`, mas nada
   gera `Receivable` até a Fase 8.
5. ~~**Custo visível para o médico**~~ — **DECIDIDO (2026-10-08): o médico não vê custo
   de nada.** Ver §7.
6. ~~**Controlados**~~ — **DECIDIDO (2026-10-08): as clínicas usam.** Marcação + observação
   desde a Fase 1; regras completas na Fase 5. Ver §5.11.

## 13. Implementação — Fases 0 e 1 (2026-10-10)

**Entregue:** schema base (`StockSettings`, `StockCategory`, `StockItem`, `StockLocation`,
`StockLot`, `StockBalance`, `StockMovement`) com RLS FORCE + GUC (mesmo padrão do Financeiro,
via `withFinanceTenant`), `lib/stock-caps.ts`, módulo SaaS `estoque`, auditoria; telas
`/estoque` (catálogo), `/estoque/itens/[id]` (saldos por local×lote, lotes, kardex),
`/estoque/movimentacoes` (entrada avulsa, consumo interno, perda, transferência, ajuste,
estorno) e `/estoque/configuracoes` (locais, categorias, parâmetros).

**Onde está:** motor em `src/lib/stock/movements.ts` (regras puras em `rules.ts`), alerta de
saída recusada em `alerts.ts`, rotas em `src/app/api/estoque/*`. Testes: unitários em
`src/lib/stock/__tests__`, integração em `src/test/integration/stock-ledger.integration.test.ts`
(RLS com role sem bypass, concorrência, CHECK, FEFO, estornos, controlados).

**Decisões tomadas na implementação (sem mudar o desenho):**

- **`ENTRADA_AVULSA`** entrou no enum: saldo inicial e compra já lançada fora do
  Recebimento, **sem** gerar Payable. Compra com nota → Contas a Pagar continua sendo o
  Recebimento (Fase 2).
- **Defesa no banco:** `CHECK (quantity >= 0)` em `stock_balances`, além do UPDATE
  condicional. Saldo negativo é impossível mesmo por fora do motor.
- **Custo sem informar** na entrada: devolução e avulsa entram pelo custo médio (não
  distorcem a média); bonificação entra a custo zero. Recepção (sem `view_cost`) não vê nem
  digita custo.
- **Estorno de entrada desfaz o custo médio**; o estorno de uma perna de transferência
  estorna as duas. Estorno que deixaria saldo negativo é recusado como qualquer saída.
- **Transferência de lote bloqueado/vencido é permitida** (mover para quarentena); consumo
  não.
- **Controlado na Fase 1:** a regra completa de saída (paciente + profissional + justificativa
  + "li a observação") já vale no consumo interno; perda/ajuste/estorno só pela gestão;
  guarda só em local `controlledStorage`. Livro de registro e bloqueio da baixa automática
  ficam na Fase 5, como previsto.
- **Unidade base e controle de lote ficam travados** depois da primeira movimentação (mudar
  reescreveria o significado do saldo). Item com saldo não é desativado nem excluído;
  exclusão é lógica e libera o nome.
- **Primeiro acesso** cria categorias sugeridas e o local "Almoxarifado" (padrão).
- **Alerta de ruptura**: sino para OWNER/MANAGER + uma `FollowUpTask` ADMINISTRATIVO aberta
  por item×local (dedup pela marca `[estoque:ruptura:item:local]` na descrição) + `AuditLog`
  `REJECTED_NO_BALANCE`.

**Para ir a produção:** aplicar a migration em produção (`npm run db:migrate:prod`) **antes**
do merge. A migration é só aditiva (tabelas/enums novos + valores novos em `EntityType`/
`ActionType`).

