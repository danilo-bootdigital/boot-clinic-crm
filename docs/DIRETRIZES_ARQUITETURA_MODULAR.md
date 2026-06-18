# Diretrizes de Arquitetura — Módulos Clínicos, Telemedicina e Controle SaaS

> Documento de **diretriz** (não de implementação). Registra decisões de
> arquitetura para que módulos futuros sejam construídos de forma integrada,
> modular e controlada por plano/permissão — sem bloqueios técnicos.
>
> Registrado em 2026-06-17. Fonte: diretrizes do Danilo (dono do produto).

---

## DIRETRIZ 1 — Módulo Clínico Documental

O CRM suporta (já **implementado** nesta data — ver `## Estado atual`):

- Anamnese digital personalizável (modelos + perguntas);
- Prontuário operacional (evolução / observação / histórico / procedimento);
- Contratos personalizáveis (modelos com variáveis dinâmicas);
- Orçamentos clínicos (itens + desconto + validade);
- Imagens e anexos do paciente (fotos, exames, documentos).

Esses recursos **sempre** vinculam-se ao paciente (`patientId`) e aparecem na
página de detalhe do paciente em abas:

`Dados · Timeline · Tags · Anexos · Anamnese · Prontuário · Contratos · Orçamentos · Imagens`

As abas clínicas só aparecem conforme o **acesso por área** do usuário
(`GET /api/clinico/access`). Cada aba clínica nunca aparece para quem não tem
ao menos `view` na área correspondente.

**Restrições de escopo (mantidas):** sem prescrição, CID, TISS, integração
hospitalar ou IA médica. Prontuário é **operacional/documental**, não médico
avançado.

---

## DIRETRIZ 2 — Telemedicina Integrada (NÃO implementar agora)

Quando implementada, a Telemedicina **não** será uma chamada de vídeo isolada.
Toda teleconsulta deverá:

- estar vinculada ao **paciente**;
- **nascer da Agenda** (modalidade presencial vs. teleconsulta no `Appointment`);
- aparecer na **timeline** do paciente;
- permitir **envio do link por WhatsApp** (lembretes 24h/1h/15min, atraso, reagendamento);
- permitir **anamnese pré-consulta** vinculada à consulta;
- permitir **registro em prontuário** ao encerrar;
- permitir **anexos/imagens**, **follow-up**, **contrato** e **orçamento** durante/após;
- atualizar **CRM/Pipeline** (agendada → move etapa; realizada → atualiza; faltou → follow-up);
- alimentar o **Dashboard** (realizadas, canceladas, faltas, duração, comparecimento, conversão);
- preparar ganchos para **Financeiro futuro** (cobrança/pagamento/comissão/repasse);
- respeitar **RBAC, companyId/clinicId e auditoria**.

### Caminho de integração previsto (sem implementar)

| Integração     | Como encaixa na arquitetura atual                                              |
|----------------|--------------------------------------------------------------------------------|
| Paciente       | `Teleconsultation.patientId` (escalar, padrão Deal/Appointment).               |
| Agenda         | Add `Appointment.modality` (PRESENCIAL/TELEMEDICINA) + `roomUrl`. Sem migration destrutiva. |
| Anamnese       | `PatientAnamnesis` ganha `appointmentId?`/`teleconsultationId?` (opcional).     |
| Prontuário     | `MedicalRecord` ganha `appointmentId?` opcional — registro nasce da consulta.   |
| WhatsApp       | `runAutomations('APPOINTMENT_CREATED', ...)` já existe → ação SEND_WHATSAPP.    |
| CRM/Follow-up  | Engine de automações já dispara em APPOINTMENT_CREATED/DEAL_WON; adicionar eventos TELECONSULT_*. |
| Imagens/Docs   | `PatientImage`/`PatientDocument` já aceitam upload durante atendimento.          |
| Auditoria      | `EntityType` ganha `TELECONSULTATION`; `writeAudit` já é genérico.              |
| Vídeo          | Provider-agnóstico: gerar **link de sala** (ex.: Jitsi por URL, zero-dependência) configurável por env; SDK só se necessário. |

**Nenhum desses ganchos exige refatorar o que existe** — são adições opcionais
(colunas nuláveis + novos modelos com FK escalar), exatamente como os módulos
atuais foram acrescentados.

---

## DIRETRIZ 3 — Controle SaaS por Módulo ✅ IMPLEMENTADO (2026-06-18)

> **Implementado** nesta data. Tabelas `Module` / `CompanyModule` / `PlanFeature`
> (migration `20260617220000_add_modular_control`, aplicada). Helper
> `lib/api/modules.ts` (`getEnabledModules`, `isModuleEnabled`, `requireModuleEnabled`,
> catálogo + auto-seed) implementa os 3 níveis. `/api/me` devolve `modules` habilitados;
> `Sidebar` oculta o que não está habilitado; guard de URL nas APIs via
> `resolveModuleUser(moduleKey)` (session) e `requireModuleEnabled` aplicado em
> patients/crm/agenda/followup/whatsapp/automacoes/clinico. Admin: `/admin` → botão
> **Módulos** por clínica (`/api/admin/companies/[id]/modules`). Backward-compatible:
> sem config, tudo habilitado; módulos `isCore` (dashboard/configuracoes) nunca desligam.
> Validado por `scripts/modular-smoke.mjs` (default + nível clínica + core + plano + URL guard).
> Endpoints de **config compartilhada** (specialties/rooms/professionals/schedule-blocks)
> ficam acessíveis de propósito (professionals é lido pelo Clínico) — preserva integração.

O Boot Clinic CRM é um **SaaS modular**. Todo módulo deve poder ser:

1. **existente** no sistema (catálogo de módulos);
2. **contratado ou não** pela clínica (nível SaaS / plano);
3. **ativado/desativado** internamente pela clínica (nível Clínica);
4. **liberado/bloqueado** por perfil (nível Usuário / RBAC).

Sidebar, rotas e APIs devem respeitar **plano contratado + módulos habilitados +
permissões do usuário**. Nenhum módulo bloqueado pode aparecer no menu **nem**
ser acessado por URL direta.

Módulos futuros sob este padrão: Telemedicina, Anamnese, Prontuário, Contratos,
Orçamentos, Imagens, Financeiro, IA, Portal do Paciente, Relatórios avançados.

### Três níveis de controle — desenho previsto

```
Nível 1 (SaaS / plano)      Company.plan + tabela PlanFeature (plano → módulos)  ──┐
Nível 2 (Clínica)           tabela CompanyModule (companyId, moduleKey, enabled)  ──┼─► módulo "efetivo"
Nível 3 (Usuário / RBAC)    User.permissions[moduleKey] = none|view|edit          ──┘
```

Módulo só é visível/acessível se: **contratado no plano** **E** **ativo na
clínica** **E** **permitido ao usuário**.

---

## Estado atual da arquitetura (avaliação de prontidão modular)

### O que JÁ existe e favorece o controle modular

- **Catálogo de módulos central:** `src/lib/api/permissions.ts` → `MODULES` +
  `MODULE_LABELS`. Adicionar um módulo = uma entrada no array (sem hardcode espalhado).
- **Gating de menu por módulo:** `components/shell/nav-config.ts` (`NavItem.module`)
  + `Sidebar.tsx` ocultam itens sem `view`. Já existe gate `superAdmin` para a seção SaaS.
- **Gating de menu por papel:** `NavItem.superAdmin` + `/api/me` retorna `role` e `permissions`.
- **Enforcement por rota:** `requirePermission(user, module, level)` em todas as APIs;
  helpers `resolveDbUser`/`resolvePatientAccess`/`resolveClinicalUser` padronizam auth+escopo.
- **RBAC fino por área (novo):** `src/lib/api/clinical-access.ts` mostra que dá para ter
  controle **mais granular que módulo** (matriz papel × área) sem quebrar o padrão.
- **Bloqueio por assinatura (nível SaaS embrionário):** `subscriptionBlock()` já bloqueia
  toda a clínica por `Company.status` (SUSPENDED/CANCELED). Existe `Company.plan` (string).
- **Isolamento multiempresa:** `companyId` em todos os modelos; auditoria genérica (`AuditLog`).

### Bloqueios arquiteturais atuais

- **Nenhum bloqueio rígido.** A base é aditiva: novos modelos usam `companyId`/`patientId`
  escalares (padrão Deal/Appointment), então telemedicina e o controle modular podem ser
  acrescentados sem refatoração global.
- **Lacunas (não bloqueiam, mas faltam para o controle SaaS completo):**
  1. Não há tabela de **catálogo de módulos** nem de **entitlement por clínica**
     (`CompanyModule`) — hoje o "contratado" é só `Company.plan` (string solta).
  2. Não há mapa **plano → módulos** (`PlanFeature`). O gating é só por permissão de usuário.
  3. O gating de menu/rotas considera **permissão do usuário**, mas ainda **não**
     "contratado no plano" nem "ativo na clínica".
  4. Isolamento ainda é **por aplicação** (`companyId`), sem **RLS** no Postgres (dívida já conhecida).

### Ajustes mínimos futuros (quando for implementar a Diretriz 3)

1. **Modelos:** `Module` (catálogo: key, label, isCore), `CompanyModule`
   (companyId, moduleKey, enabled), e `PlanFeature` (plan, moduleKey) — todos aditivos.
2. **Helper único de entitlement:** `isModuleEnabled(company, moduleKey)` = contratado(plano)
   ∧ ativo(CompanyModule). Compor com `hasPermission(user, ...)` num `canAccessModule()`.
3. **`/api/me`** passa a devolver, além de `permissions`, os **módulos efetivos** da clínica.
4. **Sidebar/nav** filtram por módulo efetivo **antes** da permissão (já filtram por permissão).
5. **Guard de rota/URL:** middleware ou wrapper de API nega módulo bloqueado (403/redirect),
   fechando o acesso direto por URL — reusar o padrão de `requirePermission`.
6. **Telemedicina (Diretriz 2):** adicionar como um `moduleKey` no catálogo + colunas
   nuláveis na Agenda — segue o mesmo trilho, sem desvio.

### Conclusão

- **A tarefa atual (Módulo Clínico Documental) NÃO sofre desvio de escopo** com estas diretrizes.
- A arquitetura atual **comporta** o controle modular em três níveis; o que falta é **aditivo**
  (3 tabelas + 1 helper de entitlement + ajuste do gating para considerar plano/ativação).
- **Telemedicina e Financeiro NÃO foram implementados** (conforme instruído) — apenas os
  ganchos de integração foram documentados acima.
