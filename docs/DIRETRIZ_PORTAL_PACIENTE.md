# DIRETRIZ OBRIGATÓRIA — Portal do Paciente, PatientAccount e Confidencialidade Clínica

> **Status:** REGRA ESTRUTURAL VINCULANTE. Não é comportamento de tela — é
> contrato de arquitetura. Qualquer PR que toque no Portal do Paciente, no
> `PatientAccount` ou em exposição de dado clínico ao paciente **deve** cumprir
> este documento. Revisor que aprovar PR que viole esta diretriz é co-responsável.
>
> **Escopo:** Workstream 3 do plano de fundação (identidade do paciente + portal).
> Registrado em 2026-06-18. Fonte: decisão do Danilo (dono do produto).
> **Nada implementado** — este documento é o desenho que precede o código.

---

## 0. AS 8 REGRAS INEGOCIÁVEIS

Estas regras valem para **todo** desenvolvimento futuro do Portal do Paciente
(web, mobile, white-label, telemedicina paciente-facing):

1. **O paciente NUNCA acessa o prontuário bruto.** Não existe endpoint de portal
   que retorne o registro clínico completo.
2. **O paciente só acessa conteúdo explicitamente liberado** (`PATIENT_VISIBLE`).
3. **Todo conteúdo clínico nasce `INTERNAL` por padrão.** Default-deny: o que não
   foi liberado, não existe para o portal.
4. **`INTERNAL_NOTE` jamais pode ser compartilhado** — trava de produto no código,
   independente de qualquer flag ou chamada de API.
5. **O portal usa endpoints próprios, DTOs próprios e allowlist de campos.**
6. **Nunca reutilizar endpoints internos da equipe no portal.**
7. **Toda visualização do paciente é auditada** (quem, o quê, quando, IP/UA).
8. **RLS deve reforçar estas regras no banco** (defesa em profundidade — Workstream 4).

> Princípio-guia: **o paciente não "lê o prontuário"; ele lê o que o profissional
> publicou para ele.** Confidencialidade é garantida por construção, em camadas —
> não por disciplina de quem escreve a query.

---

## 1. IDENTIDADE — `PatientAccount` (conta única, multi-clínica)

**Conceito:** `PatientAccount` = quem a pessoa é (login global, sem `companyId`).
`Patient` = o que a clínica sabe sobre ela (registro clínico por-clínica, **já
existe**, `@@unique([companyId, cpf])`). A ligação é explícita e carrega acesso +
consentimento por clínica.

```
PatientAccount 1 ──── N PatientAccountLink 1 ──── 1 Patient (existente, por clínica)
 (identidade global)      (vínculo + LGPD + acesso)     (companyId + cpf, dado clínico)
```

```prisma
// Identidade GLOBAL do paciente. SEM companyId: é cross-clínica.
model PatientAccount {
  id          String   @id @default(cuid())
  authUserId  String   @unique          // usuário Supabase Auth (OTP/magic-link)
  email       String?  @unique
  phone       String?
  name        String
  status      PatientAccountStatus @default(ACTIVE)
  lastLoginAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?
  links       PatientAccountLink[]
  @@map("patient_accounts")
}

// VÍNCULO conta ↔ paciente-de-uma-clínica. "Cartão de acesso" + consentimento por clínica.
model PatientAccountLink {
  id                String   @id @default(cuid())
  patientAccountId  String
  patientId         String   @unique     // 1 Patient => no máx. 1 conta de portal
  companyId         String                // denormalizado p/ RLS / escopo / white-label
  status            PatientLinkStatus @default(PENDING)
  verifiedVia       String?               // 'OTP_PHONE' | 'OTP_EMAIL' | 'CLINIC_INVITE'
  consentAcceptedAt DateTime?             // aceite de uso do portal NESTA clínica (LGPD)
  consentIp         String?
  linkedAt          DateTime?
  revokedAt         DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  account PatientAccount @relation(fields: [patientAccountId], references: [id], onDelete: Cascade)
  @@unique([patientAccountId, patientId])
  @@index([patientAccountId])
  @@index([companyId, status])
  @@map("patient_account_links")
}

enum PatientAccountStatus { ACTIVE  BLOCKED }
enum PatientLinkStatus    { PENDING  ACTIVE  REVOKED }
```

**Decisão de modelagem:** tabela de vínculo dedicada (não um campo
`Patient.patientAccountId`). Permite revogar o portal sem apagar o prontuário,
modelar convite/claim com `status`, consentimento por marca (white-label) e
garante "no máximo uma conta por registro clínico" (`patientId @unique`).

**Isolamento por clínica:** a sessão do portal resolve **um** vínculo `ACTIVE` por
vez e seta `app.company_id` + `app.patient_id`. "Trocar de clínica" = escolher
outro vínculo. Nenhuma query cruza `patientId` de clínicas diferentes. O dado
clínico **nunca muda de dono** (segue com `companyId`).

**Vinculação verificada (anti-account-takeover):** nunca por CPF auto-declarado.
Só por OTP no canal que **a clínica já tem** no `Patient`, ou convite emitido pela
clínica. Sucesso → `status = ACTIVE`. Clínica pode `REVOKE` a qualquer momento.

---

## 2. VISIBILIDADE DO REGISTRO CLÍNICO (regra estrutural)

**Todo conteúdo clínico nasce `INTERNAL`.** A exposição ao paciente é uma
**publicação deliberada**, item a item, pelo profissional.

```prisma
enum RecordVisibility {
  INTERNAL          // PADRÃO — raciocínio clínico, observações, hipóteses
  PATIENT_VISIBLE   // liberado deliberadamente ao paciente
}

// Tipo dedicado que o sistema SE RECUSA a compartilhar (regra 4):
enum MedicalRecordType { EVOLUTION  OBSERVATION  HISTORY  PROCEDURE  INTERNAL_NOTE }
```

Campos de compartilhamento aplicados aos modelos clínicos elegíveis
(`MedicalRecord`, `PatientImage`, `PatientDocument`, e por extensão os demais):

```prisma
  visibility          RecordVisibility @default(INTERNAL)
  sharedWithPatientAt DateTime?        // quando foi liberado (null = nunca)
  sharedById          String?          // quem liberou (auditoria)
```

Invariantes (verdadeiras em qualquer ponto do sistema):
- `visibility` default **sempre** `INTERNAL` — migração de dados existentes entra como `INTERNAL`.
- `MedicalRecordType.INTERNAL_NOTE` ⇒ `visibility` **forçado** `INTERNAL`; tentativa
  de liberar é **rejeitada no código** (não é validação de UI, é regra de domínio).
- Liberar (`PATIENT_VISIBLE`) exige ação explícita do profissional + grava
  `sharedWithPatientAt`/`sharedById`.

---

## 3. REGRAS DE COMPARTILHAMENTO

1. **Default-deny:** sem ação de liberar, o item não existe para o portal.
2. **Liberação é item a item**, nunca em massa por paciente.
3. **Liberação é reversível** (`PATIENT_VISIBLE → INTERNAL`); revogar esconde
   imediatamente no portal (sem apagar o dado).
4. **`INTERNAL_NOTE` é não-liberável** — o domínio recusa.
5. **Toda liberação/revogação é auditada** (`writeAudit`, ação `UPDATE`/`UPDATE_STATUS`).
6. **Anamnese:** o paciente vê as **próprias respostas** que preencheu; notas de
   revisão/avaliação do profissional permanecem `INTERNAL`.
7. **Contratos/Orçamentos:** são paciente-facing por natureza (assinar/aprovar) —
   visíveis conforme status, mas anotações internas a eles seguem `INTERNAL`.

---

## 4. MATRIZ DE ACESSO DO PORTAL (default-deny)

| Conteúdo | Paciente vê? | Regra |
|---|---|---|
| Evolução / observação / histórico clínico | ❌ por padrão | `INTERNAL`; só via item liberado |
| **Anotações internas do médico** (`INTERNAL_NOTE`) | ❌ **nunca** | não-liberável por regra de domínio |
| Resultado de exame / laudo finalizado | ✅ se liberado | `PATIENT_VISIBLE` + ação do profissional |
| Orientações / receitas / instruções | ✅ se liberado | idem |
| Anamnese (respostas do próprio paciente) | ✅ próprias respostas | notas do revisor ficam `INTERNAL` |
| Contratos | ✅ | paciente-facing (visualizar/aceitar) |
| Orçamentos | ✅ | paciente-facing (visualizar/aprovar) |
| Imagens clínicas (fotos) | ❌ por padrão | só itens/categorias liberados |
| Documentos | ⚠️ por item | `visibility` por documento |
| Agenda | ✅ metadados | data, profissional, status — sem conteúdo clínico |
| Teleconsultas | ✅ metadados + sala | acesso à sessão; prontuário gerado é `INTERNAL` salvo liberação |
| Timeline / Histórico | ✅ versão **curada** | só eventos liberados, nunca anotações cruas |

---

## 5. IMPACTO POR MÓDULO

- **Prontuário (`MedicalRecord`):** ganha `visibility`/`sharedWithPatientAt`/`sharedById`
  + tipo `INTERNAL_NOTE`. Tudo existente vira `INTERNAL`. Portal nunca lê `content`
  cru; só itens liberados, via DTO de allowlist.
- **Anamnese (`PatientAnamnesis`/`Answer`):** paciente vê as próprias respostas;
  `reviewedById`/notas de revisão ficam `INTERNAL`. Anamnese pré-consulta (já tem
  `appointmentId/teleconsultationId`) é preenchível pelo paciente, mas a avaliação não.
- **Contratos (`PatientContract`):** paciente-facing; expõe status/contrato, não
  anotações internas. Preparado para aceite/assinatura futura.
- **Orçamentos (`ClinicalQuote`):** paciente-facing; visualizar/aprovar; itens
  internos de custo/margem (se existirem) não vão ao portal.
- **Imagens (`PatientImage`):** `visibility` por imagem; foto clínica é `INTERNAL`
  por padrão; exame liberado pode aparecer.
- **Documentos (`PatientDocument`):** `visibility` por documento; categorias como
  laudo/exame podem ser liberadas, termos internos não.
- **Telemedicina (`TelemedicineSession` + anexos):** paciente acessa a sala e os
  metadados da própria sessão; o `MedicalRecord` gerado nasce `INTERNAL`; anexos
  seguem `visibility`. (O acesso pontual por slug/token continua para a sala.)
- **Timeline (`TimelineEvent`):** o portal mostra uma **timeline curada** —
  derivada apenas de itens liberados/eventos paciente-facing; nunca o stream interno.

> Nenhum desses modelos muda de **dono**: todos seguem chaveados por
> `patientId + companyId`. A mudança é **aditiva** (campos de visibilidade) e o
> portal os lê por um caminho separado, com allowlist.

---

## 6. GUARD-RAILS TÉCNICOS (defesa em camadas)

1. **Endpoints próprios:** tudo do paciente sob `/api/v1/portal/*`. Proibido o
   portal chamar rotas de equipe.
2. **DTOs próprios + allowlist:** o portal projeta **só** campos da allowlist
   (sem `content` interno, `professionalId`, `createdById`, custos). Proibido
   `SELECT *`/serializer de equipe no portal.
3. **Resolver dedicado `resolvePatientSelf`:** valida que o `patientId` pedido
   pertence a vínculo `ACTIVE` da conta logada **antes** de qualquer query; aplica
   `visibility = PATIENT_VISIBLE` no `where`; seta `app.company_id`/`app.patient_id`.
4. **RLS (Workstream 4):** política do portal exige
   `company_id = current_setting('app.company_id')` **e**, nas tabelas clínicas,
   `patient_visible`/`patient_id` — bug de app ⇒ linhas-zero, nunca vazamento.
5. **Auditoria de leitura:** toda visualização do paciente gera registro
   (entidade, id, conta, IP, UA, timestamp).
6. **Separação de eixos de identidade:** equipe (`User`) e paciente
   (`PatientAccount`) são resolvidos por caminhos distintos; um `authUserId` não
   pode ser os dois.

---

## 7. CRITÉRIOS DE ACEITE (Definition of Done para qualquer PR de Portal)

- ✅ Por padrão, **nenhum** registro clínico aparece no portal (default-deny verificável).
- ✅ Só itens `PATIENT_VISIBLE` (liberados por ação explícita) aparecem.
- ✅ `INTERNAL_NOTE` é não-compartilhável mesmo via chamada direta de API (teste negativo).
- ✅ Endpoint de portal nunca retorna `content` interno, autor ou metadados de equipe.
- ✅ Nenhuma rota de equipe é reutilizada pelo portal.
- ✅ `resolvePatientSelf` é obrigatório em 100% das rotas de portal.
- ✅ Paciente só enxerga dados da clínica do vínculo ativo selecionado (sem cruzar clínicas).
- ✅ Revogar vínculo/liberação esconde imediatamente, sem apagar dado clínico.
- ✅ Toda visualização do paciente é auditada.
- ✅ (Quando RLS existir) query crua do portal sem contexto ⇒ 0 linhas.

---

## 8. RISCOS

- 🔴 **Vazamento de prontuário interno:** mitigado por default-deny + DTO allowlist
  + filtro `PATIENT_VISIBLE` + RLS. Três camadas; cada uma falha "fechando".
- 🔴 **Account takeover (vincular paciente alheio):** só verificação por canal da
  clínica; nunca CPF auto-declarado.
- 🟡 **Liberação acidental em massa:** liberação é item a item + auditada + reversível.
- 🟡 **Reuso indevido de endpoint de equipe no portal:** proibido por diretriz;
  checar em code review (regra 6).
- 🟡 **Colisão de identidade equipe×paciente:** eixos separados; `authUserId` único por papel.
- 🟢 **Patient sem conta:** estado normal (maioria) — `PatientAccountLink` apenas não existe.

---

## 9. SEQUÊNCIA SEGURA (quando for implementar — fora do escopo deste doc)

1. Bearer token (Workstream 1) — destrava mobile/portal sem tocar rotas.
2. `/api/v1` (Workstream 2) — congela contrato antes de cliente externo.
3. `PatientAccount` + visibilidade (este doc) — aditivo; **só vai a produção com a regra de visibilidade ativa**.
4. RLS (Workstream 4) — 2ª barreira; enforce faseado.

> **Esta diretriz é pré-requisito de qualquer rota `/api/v1/portal/*`.** Código de
> portal sem default-deny + DTO de allowlist + auditoria **não deve ser mergeado.**
