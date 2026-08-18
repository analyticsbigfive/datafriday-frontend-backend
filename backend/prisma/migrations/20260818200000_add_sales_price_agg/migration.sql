-- Écrite à la main (migrations manuelles, cf. ADR-0002 — jamais `prisma migrate dev`, shadow DB
-- cassée sur l'historique existant, symptôme connu et déjà documenté dans cet ADR).
-- BUG-337-02 (docs/bugs/) : pré-agrégat de la cascade de prix (productId / item_id Weezevent /
-- nom normalisé), remplace le raw JOIN WeezeventTransactionItem/WeezeventTransaction (17-40s
-- mesurés sur un tenant réel) par une lecture indexée sur une table tenue à jour à l'écriture.
-- Purement additive : nouvelle table, aucune colonne/table existante touchée.

CREATE TABLE "SalesPriceAgg" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL DEFAULT '',
    "itemWeezeventId" TEXT NOT NULL DEFAULT '',
    "productNameNorm" TEXT NOT NULL DEFAULT '',
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "vat" DECIMAL(5,2) NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "lastSoldAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPriceAgg_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesPriceAgg_tenantId_locationId_productId_itemWeezeven_key"
  ON "SalesPriceAgg"("tenantId", "locationId", "productId", "itemWeezeventId", "productNameNorm", "unitPrice", "vat");

CREATE INDEX "SalesPriceAgg_tenantId_locationId_productId_idx" ON "SalesPriceAgg"("tenantId", "locationId", "productId");
CREATE INDEX "SalesPriceAgg_tenantId_locationId_itemWeezeventId_idx" ON "SalesPriceAgg"("tenantId", "locationId", "itemWeezeventId");
CREATE INDEX "SalesPriceAgg_tenantId_locationId_productNameNorm_idx" ON "SalesPriceAgg"("tenantId", "locationId", "productNameNorm");
CREATE INDEX "SalesPriceAgg_tenantId_integrationId_idx" ON "SalesPriceAgg"("tenantId", "integrationId");
