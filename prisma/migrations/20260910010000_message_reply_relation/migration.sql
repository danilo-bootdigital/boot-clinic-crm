-- "Responder"/citar mensagem: replyToMessageId já existia como coluna solta
-- (sem FK, nunca escrita por código nenhum — confirmado 0 linhas preenchidas
-- em produção). Esta migration só adiciona a relação de verdade, pra poder
-- fazer `include: { replyToMessage: ... }` ao serializar a bolha.
CREATE INDEX "messages_replyToMessageId_idx" ON "messages"("replyToMessageId");

ALTER TABLE "messages" ADD CONSTRAINT "messages_replyToMessageId_fkey"
    FOREIGN KEY ("replyToMessageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
