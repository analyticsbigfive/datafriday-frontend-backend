-- ADR-0006 (chantier 377, étape 5) : contrainte unique basée sur l'identité stable, en plus de
-- la contrainte texte "uniq_stock_level" (les deux coexistent tant qu'itemKey reste la clé
-- effective de double-écriture). Vérifié avant application : 0 violation potentielle.

-- DropIndex
DROP INDEX "StockLevel_itemRefId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_tenantId_elementId_itemRefId_key" ON "StockLevel"("tenantId", "elementId", "itemRefId");
