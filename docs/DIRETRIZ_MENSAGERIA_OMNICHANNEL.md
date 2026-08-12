# DIRETRIZ — Mensageria Omnichannel (Inbox unificado → CRM / Agenda / Paciente)

> **Status:** DESENHO APROVADO, NADA IMPLEMENTADO. Este documento precede o
> código. Registrado em 2026-08-12. Fonte: decisão do Danilo (dono do produto).
>
> **Escopo:** substituir o "módulo WhatsApp" por uma **mensageria de canais**.
> O WhatsApp deixa de ser um módulo e passa a ser **um canal** dela.
>
> **Diretrizes relacionadas:** [`DIRETRIZES_ARQUITETURA_MODULAR.md`](DIRETRIZES_ARQUITETURA_MODULAR.md)
> (SaaS modular), [`DIRETRIZ_PORTAL_PACIENTE.md`](DIRETRIZ_PORTAL_PACIENTE.md)
> (default-deny em dado clínico — vale para o que a mensageria expõe).

---

## 0. O PROBLEMA DE PRODUTO

A clínica recebe contato por WhatsApp, Instagram e TikTok. Hoje cada canal é uma
caixa separada (e só o WhatsApp existe no sistema). O atendente não tem uma fila
única, e o contato que chega por mensagem **não entra no funil**: alguém relê a
conversa e redigita o lead no CRM, no cadastro de paciente e na agenda.

A mensageria resolve as duas pontas: **uma fila para todos os canais** e, da
própria conversa, **conversão em oportunidade, paciente e agendamento** sem
redigitação.

---

## 1. AS 6 REGRAS ESTRUTURAIS

1. **Canal é dado, não é módulo.** Existe UMA tabela de conversa e UMA de
   mensagem, com um campo `channel`. Proibido criar `InstagramConversation`,
   `TikTokConversation` ou qualquer variação por canal.
2. **Todo canal entra por um adapter.** O núcleo (ingest, dedup, mídia, status)
   não conhece Evolution API nem Meta. O adapter traduz o payload do provedor
   para o formato canônico e entrega ao `ingest`.
3. **Identidade mora no `Contact`, não na conversa.** A conversa aponta para um
   `Contact`; o `Contact` tem N identidades (telefone, @ do Instagram, id do
   TikTok). A mesma pessoa em dois canais é UM contato.
4. **`Patient` continua íntegro.** Não afrouxamos `cpf`/`phone` nem o
   `@@unique([companyId, cpf])`. Contato de rede social vive como `Contact` até
   virar paciente de verdade, com os dados obrigatórios preenchidos.
5. **Nenhum canal é prometido na tela sem conector real.** Canal sem integração
   ativa não aparece como se recebesse mensagem.
6. **Webhook nunca registra payload cru.** Mantém o padrão já existente em
   `WhatsAppWebhookEvent`: hash + metadados sanitizados (LGPD).

---

## 2. DECISÕES TOMADAS (2026-08-12)

| Decisão | Escolha | Consequência |
|---|---|---|
| **TikTok** | Adapter pronto, sem integração | Não existe API pública de DM do TikTok. O modelo e a UI suportam `TIKTOK`, mas nenhum conector é ligado. Sem promessa falsa na tela. |
| **Modelo de dados** | Generalizar as tabelas atuais | `WhatsApp*` → `Conversation`/`Message`/`Attachment` com `channel`. Migration com `RENAME`, histórico preservado, zero código duplicado. |
| **Direção** | Receber **e** responder | Envio, status de entrega, retry e as regras de janela de cada canal entram no escopo. |
| **Identidade** | Criar entidade `Contact` | `Deal` aponta para `Contact`; `Patient` só nasce no agendamento, com CPF e telefone. |

### 2.1 Por que não reescrever do zero

O módulo WhatsApp já contém, com outro nome, a maior parte do núcleo da
mensageria: `ingest.ts` (fonte única de gravação, dedup por
`(instanceId, externalId)`), pipeline de mídia (`media-inbound`, `media-client`,
storage privado com `scanStatus`), ciclo de vida de status
(`message-status.ts`), observabilidade de webhook sem payload
(`webhook-log.ts`). "Deixar o módulo WhatsApp de lado" significa **parar de
tratá-lo como módulo próprio** — não descartar esse núcleo.

---

## 3. REALIDADE DE CADA CANAL

| Canal | Como entra | Pré-requisitos | Status |
|---|---|---|---|
| **WhatsApp** | Evolution API (já integrada) | Instância pareada por clínica (`WhatsAppInstance` → `ChannelAccount`) | Funcional hoje |
| **Instagram** | Meta Messenger Platform (Instagram Messaging) | Conta profissional vinculada a uma Página, permissão `instagram_manage_messages`, App Review da Meta, webhook verificado | A construir |
| **TikTok** | — | Não há API pública de DM. Oficial existe só Lead Generation (formulário de anúncio) e mensageria via parceiro autorizado | Adapter preparado, sem conector |

> **Janela de resposta (Instagram):** a Meta só permite resposta livre dentro de
> 24h da última mensagem do usuário. Fora disso, o envio falha. A UI precisa
> mostrar a janela, e o adapter precisa recusar antes de chamar a API — não
> depois de tomar erro.

---

## 4. MODELO DE DADOS

### 4.1 Renomeações (generalização do que existe)

| Hoje | Passa a ser | Observação |
|---|---|---|
| `WhatsAppInstance` | `ChannelAccount` | Conta/número conectado de um canal. Ganha `channel`. Campos de Evolution (`instanceName`, `qrCode`, `evolutionInstanceId`) viram `providerConfig Json?` |
| `WhatsAppConversation` | `Conversation` | Ganha `channel` + `contactId`. `contactPhone` sai (vira identidade do contato) |
| `WhatsAppMessage` | `Message` | Ganha `channel`. `externalId` + dedup permanecem |
| `WhatsAppAttachment` | `MessageAttachment` | Sem mudança estrutural |
| `WhatsAppWebhookEvent` | `ChannelWebhookEvent` | Ganha `channel` |
| `WhatsAppQuickReply` | `QuickReply` | Sem mudança estrutural |
| `WhatsAppInstanceStatus` | `ChannelAccountStatus` | `QRCODE` vira estado só do adapter WhatsApp |

### 4.2 Entidades novas

```prisma
enum Channel {
  WHATSAPP
  INSTAGRAM
  TIKTOK
}

// Pessoa que fala com a clínica por qualquer canal. Pode ainda não ser paciente.
model Contact {
  id        String    @id @default(cuid())
  companyId String
  name      String
  phone     String?   // pode não existir (DM de rede social)
  email     String?
  patientId String?   // vínculo quando/se virar paciente
  notes     String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  identities ContactIdentity[]

  @@index([companyId, phone])
  @@index([patientId])
  @@map("contacts")
}

// Identidade do contato EM UM canal. É a chave de resolução do ingest.
model ContactIdentity {
  id         String   @id @default(cuid())
  companyId  String
  contactId  String
  channel    Channel
  externalId String   // telefone E164 (WhatsApp) | IGSID (Instagram) | open_id (TikTok)
  handle     String?  // @ do perfil, quando o canal expõe
  avatarUrl  String?
  createdAt  DateTime @default(now())

  contact Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)

  // Uma identidade por canal por clínica — é o que impede contato duplicado.
  @@unique([companyId, channel, externalId])
  @@index([contactId])
  @@map("contact_identities")
}
```

### 4.3 Regra de resolução de identidade (o coração do ingest)

Ao chegar mensagem de `(channel, externalId)`:

1. Existe `ContactIdentity`? → usa o `Contact` dela.
2. Não existe, mas o canal deu telefone e há `Contact` com esse telefone na
   clínica? → **anexa** a identidade nova ao contato existente.
3. Nada bateu? → cria `Contact` + `ContactIdentity`.

Merge de contatos (juntar dois que eram a mesma pessoa) é **ação manual do
atendente**, nunca automática por semelhança de nome. Fusão automática por nome
gera vazamento de histórico entre pessoas diferentes.

---

## 5. CONVERSÃO: DA CONVERSA PARA OS MÓDULOS

A tela de conversa tem um painel de ações. Cada ação é explícita e auditada
(`AuditLog`), e **nenhuma acontece em silêncio**.

| Ação | O que cria | Bloqueio real |
|---|---|---|
| **Criar oportunidade** | `Deal` com `contactId`, `source` derivado do canal, no primeiro estágio do pipeline | Nenhum. `Deal.patientId` é opcional |
| **Vincular a paciente existente** | Preenche `Contact.patientId` | Busca por nome/telefone/CPF |
| **Cadastrar como paciente** | `Patient` + vínculo no `Contact` | **Exige CPF e telefone.** Modal pré-preenche o que o canal deu e cobra o resto |
| **Agendar** | `Appointment` | **Exige `Patient`.** Se o contato não é paciente, o fluxo passa antes pelo cadastro — não dá para pular |
| **Criar follow-up** | `FollowUpTask` | Nenhum |

> **Restrição de schema documentada:** `Appointment.patientId` é obrigatório e
> `Patient` exige `cpf` (único por clínica) + `phone`. Logo, **não existe**
> caminho de "DM do Instagram direto para a agenda" sem alguém informar CPF e
> telefone. Isso é decisão de produto (regra 4), não limitação a contornar.

---

## 6. FASES

| Fase | Entrega | Depende de |
|---|---|---|
| **0** | Resolver o WIP do WhatsApp: a migration `20260717120000_add_whatsapp_webhook_events_version` está **criada e não aplicada** em produção. Decidir entre aplicar antes de renomear ou dobrar a coluna na migration de generalização | — |
| **1** | Schema: renomeações + `Contact`/`ContactIdentity`/`Channel`. Migration com `RENAME` (preserva dados) + backfill de `Contact` a partir de `contactPhone`/`contactName` das conversas existentes | Fase 0 |
| **2** | Refatorar o núcleo para canal-agnóstico: `ingest`, `webhook-log`, `message-status`, mídia. Adapter WhatsApp encapsula a Evolution. Rotas `/api/whatsapp/*` → `/api/mensageria/*` | Fase 1 |
| **3** | Tela da mensageria: fila unificada com filtro por canal, thread, envio, painel do contato e painel de conversão | Fase 2 |
| **4** | Ações de conversão (§5) com auditoria | Fase 3 |
| **5** | Adapter Instagram: App na Meta, webhook, envio, janela de 24h | Fase 2 |
| **6** | Adapter TikTok: só a interface do adapter e o canal no enum. Sem conector | Fase 2 |

**Ordem não negociável:** Fase 1 e 2 são um bloco. Renomear os models quebra
todas as referências (13 rotas de API + `ingest` + `WhatsAppCentral.tsx`) — ou
se faz inteiro, ou não se começa. Não existe estado intermediário que builde.

---

## 7. RISCOS

| Risco | Mitigação |
|---|---|
| Rename de tabela em produção | `RENAME TABLE`/`RENAME COLUMN` preserva dados, mas é irreversível na prática. Conferir volume das tabelas `whatsapp_*` em produção antes; aplicar em janela combinada |
| App Review da Meta | Prazo fora do nosso controle. Fase 5 não bloqueia as fases 1-4 |
| Expectativa de TikTok | Documentado na regra 5: canal sem conector não finge receber mensagem |
| Contato duplicado | `@@unique([companyId, channel, externalId])` + merge manual, nunca automático |
| Vazamento de histórico entre contatos | Merge é ação manual, auditada e reversível por `AuditLog` |
