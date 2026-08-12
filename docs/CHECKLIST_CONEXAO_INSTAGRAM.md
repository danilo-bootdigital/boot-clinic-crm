# CHECKLIST — Ligar o Instagram na mensageria

> **Status:** código pronto e deployado (commit `b70059e`). **Pendente do lado da
> Meta** — bloqueado em 2026-08-12 por falta de acesso à conta Meta do negócio.
>
> Nada aqui é tarefa de programação: é configuração no painel da Meta e na
> Vercel. O adapter, o webhook, o OAuth e a tela já existem e esperam por isso.
>
> Desenho: [`DIRETRIZ_MENSAGERIA_OMNICHANNEL.md`](DIRETRIZ_MENSAGERIA_OMNICHANNEL.md) §3 e Fase 5.

---

## 0. Pré-requisito da conta (o que mais trava na prática)

- [ ] A conta do Instagram da clínica é **Profissional** (Business ou Criador) —
      conta pessoal não tem DM por API, e isso não tem contorno.
- [ ] Essa conta está **vinculada a uma Página do Facebook**.
- [ ] Você é **administrador** dessa Página.

Se qualquer um dos três falhar, o botão "Conectar Instagram" vai devolver
`sem_instagram_profissional` — e a mensagem na tela diz exatamente isso.

---

## 1. Criar o app na Meta

Em [developers.facebook.com/apps](https://developers.facebook.com/apps):

- [ ] **Criar app** → tipo **Business**
- [ ] Adicionar o produto **Messenger**
- [ ] Dentro do Messenger, adicionar **Instagram**

Guarde `App ID` e `App Secret` (Configurações → Básico). **Não coloque esses
valores em nenhum arquivo do repositório.**

---

## 2. Variáveis de ambiente na Vercel

Project → Settings → Environment Variables (Production):

| Variável | De onde vem |
|---|---|
| `META_APP_ID` | painel do app → Configurações → Básico |
| `META_APP_SECRET` | idem (campo "Chave secreta do app") |
| `META_WEBHOOK_VERIFY_TOKEN` | **você inventa** uma string longa; a mesma vai no painel da Meta |
| `MESSAGING_SECRET_KEY` | gere na hora: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

Sobre a `MESSAGING_SECRET_KEY`:

- É o que cifra o token de Página no banco (AES-256-GCM, `lib/crypto/secret-box.ts`).
- **Gere uma nova no momento de configurar.** Qualquer chave que já tenha
  circulado por conversa, chat ou ticket deve ser considerada queimada.
- Sem ela o sistema **se recusa a conectar** (503) em vez de gravar credencial em
  texto puro. Isso é intencional.
- Trocar a chave depois invalida os tokens já guardados: as clínicas precisam
  reconectar. Não rotacione sem avisar.

Depois de salvar as variáveis, **force um redeploy** — variável nova não entra
em build já publicado.

---

## 3. Cadastrar as URLs no painel da Meta

- [ ] **Webhook** (Messenger → Configurações → Webhooks):
      `https://app.bootclinic.com.br/api/mensageria/webhook/instagram`
      - Verify token: o mesmo valor de `META_WEBHOOK_VERIFY_TOKEN`
      - Campos assinados: **`messages`** (e, se quiser procedência de campanha,
        `messaging_postbacks` e `messaging_referral`)
- [ ] **OAuth redirect** (Login do Facebook → Configurações):
      `https://app.bootclinic.com.br/api/mensageria/accounts/instagram/callback`

O handshake do webhook (`GET` com `hub.challenge`) já está implementado: se o
verify token conferir, a Meta assina na hora. Se der erro no painel, é o token
que não bate ou o redeploy que não aconteceu.

---

## 4. Conectar

- [ ] No CRM: **Configurações → Instagram → Conectar Instagram**
- [ ] Autorizar na Meta (a senha é digitada **no site da Meta**, nunca no CRM)
- [ ] Confirmar que a tela mostra `@usuario` e "Conectado"

Se aparecer `webhook_nao_assinado`, a conta conectou mas a Página não foi
assinada — mensagem não vai chegar. Reconecte.

- [ ] Teste real: manda um DM de outro Instagram para a conta da clínica e
      confira se a conversa aparece em `/mensageria` com a **etiqueta Instagram**.
- [ ] Teste a resposta pela tela (dentro da janela de 24h).

---

## 5. App Review (só para atender outras clínicas)

Para a **sua própria** conta, o modo de desenvolvimento do app já funciona — dá
para validar tudo antes de submeter.

Para o SaaS atender clínicas de terceiros, a Meta exige App Review das permissões
`instagram_manage_messages`, `pages_messaging` e `pages_show_list`, com caso de
uso escrito e **vídeo demonstrando o fluxo**. Prazo fora do nosso controle
(dias a semanas). Isso não bloqueia nada das Fases 3 e 4.

---

## O que esperar de atrito no primeiro teste

Honestidade sobre o estado do código: o formato do webhook e das respostas da
Graph API foi implementado **a partir da documentação**, sem tráfego real
observado. Os testes usam payload sintético. Então:

- Campos de payload podem vir com nome/aninhamento diferente do previsto em
  `adapters/instagram/classify.ts`.
- **Expiração/revogação de token não é tratada:** se a permissão for revogada, a
  conta continua `CONNECTED` com token inválido e o erro só aparece na hora de
  enviar. Está na lista de pendências.

Nada disso é bloqueante para o primeiro teste — mas espere um ou dois ajustes.
