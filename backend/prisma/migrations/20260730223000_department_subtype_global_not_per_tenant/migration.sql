-- Correction : Department/Subtype doivent être GLOBAUX (un seul jeu pour toute la plateforme,
-- édité par le super-admin uniquement), pas par tenant comme initialement modélisé à l'Étape 1.
-- Les deux tables ont été vidées manuellement avant cette migration (aucune donnée à préserver —
-- rien ne les consommait encore, cf. commentaire du modèle Department).

-- DropIndex
DROP INDEX "Department_tenantId_name_key";
DROP INDEX "Department_tenantId_idx";
DROP INDEX "Subtype_tenantId_departmentId_name_key";
DROP INDEX "Subtype_tenantId_idx";

-- AlterTable
ALTER TABLE "Department" DROP COLUMN "tenantId";
ALTER TABLE "Subtype" DROP COLUMN "tenantId";

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Subtype_departmentId_name_key" ON "Subtype"("departmentId", "name");
