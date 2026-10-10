# seed-dos-clinic — clínica demonstrativa "DOS CLINIC"

Popula uma clínica fictícia completa para demonstrações comerciais e vídeos de usabilidade. Ela usa
o mesmo banco, as mesmas APIs e os mesmos componentes das outras clínicas. Não existe modo "fake" na
interface: a única diferença é ter dados.

## Comandos (rodar em `apps/web`)

| Comando | O que faz |
|---|---|
| `npm run seed:dos-clinic` | Contra banco **local**: cria ou complementa os dados. Auth e Storage ficam desligados. |
| `npm run seed:dos-clinic -- --yes` | Contra banco **remoto** (o `.env` aponta para produção). O `--yes` é obrigatório. |
| `npm run seed:dos-clinic -- --verify` | Somente leitura: integridade, totais e cadeias financeiras. |
| `npm run seed:dos-clinic -- --reset --yes` | Apaga **só** os dados da DOS CLINIC (empresa e dono preservados) e semeia de novo. |

Para testar localmente sem tocar produção, exporte as duas URLs para o Postgres descartável
(o `--env-file` não sobrescreve variáveis já exportadas):

```bash
L=$(grep LOCAL_DATABASE_URL .env | cut -d= -f2- | tr -d '"')
DATABASE_URL="$L" MIGRATE_DATABASE_URL="$L" npm run seed:dos-clinic
```

### Variáveis opcionais

- `DEMO_ANCHOR_DATE=YYYY-MM-DD`: desloca todas as datas. A referência é 06/10/2026, que é "hoje"
  no dataset. Use junto com `--reset` antes de uma demo em outra data, para a agenda e o dashboard
  mostrarem "hoje", "semana" e "mês" preenchidos. Consultas que caírem em fim de semana vão para a
  segunda-feira.
- `DOS_OWNER_PASSWORD`: senha da conta `user@bootclinic.com.br`, usada **somente** se a conta ainda
  não existir no Supabase Auth. Sem ela, o script gera uma senha forte e a mostra uma única vez.
  Conta existente nunca tem a senha alterada.

## Garantias

- **Isolamento:**
  - Toda escrita usa o `companyId` da DOS CLINIC.
  - A empresa é localizada por nome **e** pelo CNPJ demo. Se existir outra "DOS CLINIC" sem esse
    CNPJ, o script aborta.
  - O reset confere nome e CNPJ antes de apagar qualquer coisa.
- **Idempotência:** cada registro é procurado pela chave natural antes de ser criado (CPF, título,
  paciente + horário, orçamento de origem…). A 2ª execução informa "nada — tudo já existia".
- **Serviços reais:**
  - Financeiro: `createReceivable`, `registerPayment`, `billAppointment`, `createPayable` e
    `registerPayablePayment`, dentro de `withFinanceTenant` (RLS) e com os schemas zod do app.
  - Telemedicina: `createSessionForAppointment`.
  - Contratos: `buildContractVariables`, `renderContractContent`, `buildSignedContractPdf` e
    `contractContentHash`.
  - Storage: `uploadClinicalFile` e `uploadCompanyLogo`.
- **Nada externo:**
  - Nenhuma `ChannelAccount` (WhatsApp/Instagram) é criada. Sem conta, `sendWhatsappForCompany`
    retorna antes de chamar a Evolution API, inclusive no cron de lembretes de telemedicina.
  - Nenhum e-mail, cobrança Asaas, PIX ou webhook é disparado.
  - Mensagens e conversas são gravadas só na camada interna.
- **Dados sintéticos:**
  - CPF e CNPJ têm dígito verificador **inválido** de propósito, então não pertencem a ninguém.
  - E-mails usam domínios reservados (`example.com`, `dosclinic.demo`).
  - Imagens e PDFs vêm de `assets/`, são gerados e marcados "DEMONSTRATIVO". Não há foto de pessoa.

> ⚠ **Não conecte um WhatsApp à DOS CLINIC.** Se houver uma conta de canal, os lembretes
> automáticos de teleconsulta passariam a ser enviados aos telefones fictícios do dataset.

## Conteúdo

O dataset está em `data.ts`:

- **Equipe e estrutura:**
  - Equipe com 6 usuários (sem login, exceto o dono) e 1 profissional sem usuário.
  - 5 especialidades, 5 salas, horários de atendimento e bloqueios.
- **Pacientes e comercial:**
  - 40 pacientes com origens e tags variadas, criados entre setembro e outubro de 2026.
  - 9 leads, 15 conversas e mensagens prontas.
  - 30 oportunidades em todas as etapas do pipeline padrão, com histórico.
- **Agenda:** 66 agendamentos em setembro e outubro, com 6 teleconsultas.
- **Orçamentos, contratos e financeiro:**
  - 18 orçamentos e 13 contratos, 11 deles assinados com PDF real.
  - Recebíveis com parcelas e pagamentos à vista, entrada + parcelas, 6x, parcela vencida e
    pagamento parcial.
  - Contas a pagar.
- **Clínico:** anamneses, prontuário, pedidos de exame, documentos e imagens.
- **Tarefas e automações:** tarefas e follow-ups em todos os estados, e automações internas.
