-- Auditoria de edição em cadastros administrativos (Usuários e Clínicas).
-- Aditivo (apenas novos valores de enum) — não altera dados existentes.
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'USER';
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'COMPANY';
