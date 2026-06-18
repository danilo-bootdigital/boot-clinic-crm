# Checklist de Validação Manual — Módulo Clínico Documental (pós-deploy)

> Rodar após o deploy na Vercel. Logar como usuário **OWNER/MANAGER** (acesso total)
> e, idealmente, repetir pontos de RBAC com **FINANCE** e **MARKETING**.

## Pré-requisitos de ambiente (Vercel)
- [ ] `DATABASE_URL` (Postgres Supabase) — já existente.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — já existentes.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — **obrigatória** para upload de imagens/documentos
      (bucket `clinical-media`). Sem ela, os uploads retornam **503** (resto funciona).
- [ ] Migration `20260617190000_add_clinical_module` aplicada (confirmado no banco compartilhado).

> Nenhuma variável de ambiente NOVA foi introduzida. O bucket `clinical-media` é
> criado automaticamente no primeiro upload (idempotente).

## Navegação / Sidebar
- [ ] Item **"Clínico"** aparece na sidebar para quem tem o módulo (ocultado p/ Marketing).
- [ ] `/clinico` abre o hub com os 5 cards (anamneses, prontuário, contratos, orçamentos, imagens).
- [ ] Cada card respeita o acesso por área (Financeiro só vê contratos/orçamentos).

## Rotas /clinico/*
- [ ] `/clinico/anamneses` lista anamneses da clínica (vazio → mensagem amigável).
- [ ] `/clinico/prontuario` lista registros.
- [ ] `/clinico/contratos` lista contratos.
- [ ] `/clinico/orcamentos` lista orçamentos.
- [ ] `/clinico/imagens` mostra galeria de imagens + lista de documentos.
- [ ] Acesso direto por URL a uma rota sem permissão → bloqueado (sem dados/erro tratado).

## Ficha do paciente — /pacientes/[id]
- [ ] Abas **Anamnese, Prontuário, Contratos, Orçamentos, Imagens** aparecem (conforme acesso).
- [ ] **Anamnese:** criar com modelo → perguntas renderizadas → salva → marcar "revisada" → arquivar.
- [ ] **Prontuário:** novo registro (tipo + título + conteúdo + profissional) → aparece com autor.
- [ ] **Contratos:** escolher modelo → variáveis `{{...}}` resolvidas → gerar → enviar/assinar.
- [ ] **Orçamentos:** adicionar itens → total recalcula (subtotal − desconto) → aprovar/recusar.
- [ ] **Imagens:** upload de imagem (categoria) → miniatura aparece → remover.
- [ ] **Documentos:** upload de documento → abre por link assinado → remover.

## RBAC por papel (repetir login)
- [ ] **DOCTOR:** edita prontuário/anamnese/imagens; **vê** contratos/orçamentos mas não cria.
- [ ] **RECEPTION:** cria anamnese e anexa documentos; prontuário **somente leitura**.
- [ ] **FINANCE:** vê contratos/orçamentos; prontuário/anamnese/imagens **bloqueados (403)**.
- [ ] **MARKETING:** sem acesso a nenhuma área clínica.

## Isolamento / Auditoria
- [ ] Dados de outra clínica não aparecem nem são acessíveis por ID (404).
- [ ] Em **Configurações → Auditoria** (ou AuditLog), aparecem ações CREATE/UPDATE/ARCHIVE/
      UPLOAD_ATTACHMENT/DELETE_ATTACHMENT com entityType clínico.

## Smoke automatizado
- [ ] `BASE_URL=https://<url-prod> SEED_ADMIN... npm run clinico-smoke` (ou local com `next start`) → verde.
