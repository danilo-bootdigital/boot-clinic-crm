-- Biblioteca de painéis de exame do SaaS (nível plataforma). Aditiva.
CREATE TABLE "exam_panel_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "exam_panel_presets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exam_panel_preset_items" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "subgroup" TEXT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "exam_panel_preset_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "exam_panel_preset_items_presetId_idx" ON "exam_panel_preset_items"("presetId");

ALTER TABLE "exam_panel_preset_items" ADD CONSTRAINT "exam_panel_preset_items_presetId_fkey"
    FOREIGN KEY ("presetId") REFERENCES "exam_panel_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
