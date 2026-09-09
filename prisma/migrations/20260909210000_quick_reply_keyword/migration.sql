-- Palavra-chave da mensagem pronta: digitada como "/palavra" no campo de
-- envio da mensageria, troca o botão de clique por um atalho de teclado.
--
-- Aditiva e nulável — linhas existentes (as 3 padrão semeadas por clínica)
-- ganham uma palavra-chave derivada do título, então continuam utilizáveis
-- sem exigir edição manual imediata. Não é unique: duas mensagens com o
-- mesmo título raro colidiriam no slug, e isso não deve derrubar a migration
-- (a página de cadastro barra duplicata nova na aplicação).
ALTER TABLE "quick_replies" ADD COLUMN "keyword" TEXT;

UPDATE "quick_replies"
SET "keyword" = regexp_replace(lower(title), '[^a-z0-9]+', '', 'g')
WHERE "keyword" IS NULL AND "deletedAt" IS NULL;

CREATE INDEX "quick_replies_companyId_keyword_idx" ON "quick_replies"("companyId", "keyword");
