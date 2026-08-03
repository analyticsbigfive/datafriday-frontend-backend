-- Écrit à la main (comme les migrations HR précédentes, cf. 20260730160000_hr_staffing_module) :
-- `prisma migrate dev` échoue en aval sur la replay shadow-db d'une migration antérieure à
-- cette session (20260704160000_menu_assignment_config_scope, référence ExternalMerch sans
-- migration de création dans cet historique local — prisma/migrations/ est gitignoré, ADR-0002 ;
-- `npx prisma migrate status` confirme que la vraie base cible est déjà à jour, donc le problème
-- est propre à la shadow-db éphémère, pas à la base réelle). SQL identique à ce que Prisma aurait
-- généré pour le modèle SimulationRun (schema.prisma), appliqué via `prisma migrate deploy`
-- (aucune shadow-db, juste _prisma_migrations sur la vraie base).

-- CreateTable
CREATE TABLE "SimulationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "intervalMs" INTEGER NOT NULL,
    "realMode" BOOLEAN NOT NULL DEFAULT true,
    "configId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedByUserId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedByUserId" TEXT,
    "stoppedAt" TIMESTAMP(3),
    "tickCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveErrorCount" INTEGER NOT NULL DEFAULT 0,
    "lastTickAt" TIMESTAMP(3),
    "lastTickStatus" TEXT,
    "lastTickError" TEXT,
    "lastElementId" TEXT,
    "lastElementName" TEXT,
    "lastTransactionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimulationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimulationRun_tenantId_spaceId_status_idx" ON "SimulationRun"("tenantId", "spaceId", "status");

-- CreateIndex
CREATE INDEX "SimulationRun_tenantId_status_startedAt_idx" ON "SimulationRun"("tenantId", "status", "startedAt");
