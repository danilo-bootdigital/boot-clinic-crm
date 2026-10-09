-- Gestor que também atende: OWNER/MANAGER com este flag entram na agenda como
-- médico(a), sem perder o nível de gestão (um usuário tem um único papel).
ALTER TABLE "users" ADD COLUMN "attendsAsDoctor" BOOLEAN NOT NULL DEFAULT false;
