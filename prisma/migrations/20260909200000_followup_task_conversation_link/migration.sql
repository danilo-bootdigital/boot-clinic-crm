-- Vínculo FollowUpTask → Conversation: a tarefa criada a partir do botão
-- "Nova tarefa" na mensageria aponta para a conversa que a originou.
--
-- Aditiva e nulável: tarefa criada em /followup (sem conversa) não é afetada.
ALTER TABLE "follow_up_tasks" ADD COLUMN "conversationId" TEXT;

-- Suporta o lookup em lote "quais destas conversas têm tarefa pendente?" que
-- alimenta o badge na lista e o botão de notificação ao abrir a conversa.
CREATE INDEX "follow_up_tasks_companyId_conversationId_idx" ON "follow_up_tasks"("companyId", "conversationId");
