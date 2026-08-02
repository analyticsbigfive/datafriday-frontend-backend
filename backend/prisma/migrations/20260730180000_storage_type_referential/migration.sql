-- Storage Type devient un référentiel CRUD-éditable (Configurations) au lieu d'un enum figé.
-- Conversion en place enum -> texte (précédent : 20260708135326_remove_good_type_enum), les
-- valeurs Cold/Dry/Frozen déjà en base sont préservées automatiquement.
ALTER TABLE "Ingredient"         ALTER COLUMN "storageType" TYPE TEXT USING "storageType"::TEXT;
ALTER TABLE "Packaging"          ALTER COLUMN "storageType" TYPE TEXT USING "storageType"::TEXT;
ALTER TABLE "MenuComponent"      ALTER COLUMN "storageType" TYPE TEXT USING "storageType"::TEXT;
ALTER TABLE "MenuItemComponent"  ALTER COLUMN "storageType" TYPE TEXT USING "storageType"::TEXT;
ALTER TABLE "MenuItemIngredient" ALTER COLUMN "storageType" TYPE TEXT USING "storageType"::TEXT;
ALTER TABLE "MenuItemPackaging"  ALTER COLUMN "storageType" TYPE TEXT USING "storageType"::TEXT;
ALTER TABLE "MenuItem"           ALTER COLUMN "storageType" TYPE TEXT[] USING "storageType"::TEXT[];

-- L'ancien type enum doit être supprimé AVANT de créer la table StorageType ci-dessous : Postgres
-- refuse une table et un type enum du même nom coexistant dans le même schéma (chaque table crée
-- implicitement un row type du même nom).
DROP TYPE "StorageType";

-- CreateTable
CREATE TABLE "StorageType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorageType_tenantId_idx" ON "StorageType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StorageType_tenantId_name_key" ON "StorageType"("tenantId", "name");
