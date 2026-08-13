-- Modelos de pedido de exames. Aditiva.
CREATE TABLE "exam_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clinicalIndication" TEXT,
    "observations" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "exam_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "exam_templates_companyId_name_idx" ON "exam_templates"("companyId", "name");

CREATE TABLE "exam_template_items" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "subgroup" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "exam_template_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "exam_template_items_templateId_idx" ON "exam_template_items"("templateId");

ALTER TABLE "exam_template_items" ADD CONSTRAINT "exam_template_items_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "exam_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
