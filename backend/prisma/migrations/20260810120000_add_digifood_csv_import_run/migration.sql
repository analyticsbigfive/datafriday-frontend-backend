-- Écrit à la main (comme les migrations précédentes, cf. 20260804180000_add_seasons) :
-- SQL identique à ce que Prisma aurait généré pour le modèle DigifoodCsvImportRun (schema.prisma),
-- appliqué via `prisma migrate deploy` (drift pré-existant sur la shadow database).

-- CreateTable
CREATE TABLE "DigifoodCsvImportRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "fileName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "ordersDetected" INTEGER NOT NULL DEFAULT 0,
    "ordersCreated" INTEGER NOT NULL DEFAULT 0,
    "ordersUpdated" INTEGER NOT NULL DEFAULT 0,
    "ordersSkipped" INTEGER NOT NULL DEFAULT 0,
    "productsCreated" INTEGER NOT NULL DEFAULT 0,
    "locationsCreated" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DigifoodCsvImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DigifoodCsvImportRun_tenantId_integrationId_startedAt_idx" ON "DigifoodCsvImportRun"("tenantId", "integrationId", "startedAt");

-- AddForeignKey
ALTER TABLE "DigifoodCsvImportRun" ADD CONSTRAINT "DigifoodCsvImportRun_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
