-- Indicação clínica passa a ser opcional: o "pedido em branco" é só a lista de
-- exames digitada, sem os campos do painel. Aditiva — nenhuma linha existente é
-- afetada (todas já têm valor).
ALTER TABLE "exam_requests" ALTER COLUMN "clinicalIndication" DROP NOT NULL;
