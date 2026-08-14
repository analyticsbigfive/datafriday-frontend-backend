-- Écrite à la main (migrations manuelles, cf. ADR-0002 — jamais `prisma migrate dev`).
-- BUG-317-02 / BUG-318-02 (docs/bugs/) : SpaceRevenueMinuteAgg, SpaceRevenueMinuteItemAgg et
-- SpaceProductRevenueDailyAgg n'avaient aucune colonne integrationId, empêchant
-- executeProcessEvents/executeSynchronize (aggregation.service.ts) de purger/reconstruire les
-- agrégats d'UNE SEULE intégration sans effacer la contribution des autres intégrations
-- partageant le même Space. Colonnes nullable, AUCUNE contrainte @@unique modifiée : l'unicité de
-- ces 3 tables reste garantie sans integrationId (weezeventLocationId/weezeventMerchantId/
-- weezeventProductId sont déjà des cuid uniques par intégration en pratique) — cette colonne sert
-- uniquement à scoper les deleteMany par intégration, pas à distinguer des lignes qui se
-- confondraient sinon.

ALTER TABLE "SpaceRevenueMinuteAgg" ADD COLUMN "integrationId" TEXT;
ALTER TABLE "SpaceRevenueMinuteItemAgg" ADD COLUMN "integrationId" TEXT;
ALTER TABLE "SpaceProductRevenueDailyAgg" ADD COLUMN "integrationId" TEXT;

CREATE INDEX "SpaceRevenueMinuteAgg_tenantId_spaceId_integrationId_idx"
  ON "SpaceRevenueMinuteAgg"("tenantId", "spaceId", "integrationId");
CREATE INDEX "SpaceRevenueMinuteItemAgg_tenantId_spaceId_integrationId_idx"
  ON "SpaceRevenueMinuteItemAgg"("tenantId", "spaceId", "integrationId");
CREATE INDEX "SpaceProductRevenueDailyAgg_tenantId_spaceId_integrationId_idx"
  ON "SpaceProductRevenueDailyAgg"("tenantId", "spaceId", "integrationId");

-- Backfill best-effort des lignes déjà en base, dérivé de la location/du marchand/du produit
-- Weezevent d'origine (résout la grande majorité des lignes existantes). Reste NULL si ni
-- weezeventLocationId ni weezeventMerchantId n'est renseigné (déjà rare aujourd'hui) — ces lignes
-- ne seront simplement pas ciblées par un deleteMany scopé tant qu'elles n'auront pas été
-- réécrites (le prochain "Traiter"/"Synchroniser" les réécrit avec integrationId renseigné, voir
-- "integrationId" = EXCLUDED."integrationId" ajouté aux DO UPDATE SET côté service).

UPDATE "SpaceRevenueMinuteAgg" a
SET "integrationId" = loc."integrationId"
FROM "WeezeventLocation" loc
WHERE a."weezeventLocationId" = loc."id" AND a."integrationId" IS NULL;

UPDATE "SpaceRevenueMinuteAgg" a
SET "integrationId" = m."integrationId"
FROM "WeezeventMerchant" m
WHERE a."weezeventMerchantId" = m."id" AND a."integrationId" IS NULL;

UPDATE "SpaceRevenueMinuteItemAgg" a
SET "integrationId" = loc."integrationId"
FROM "WeezeventLocation" loc
WHERE a."weezeventLocationId" = loc."id" AND a."integrationId" IS NULL;

UPDATE "SpaceRevenueMinuteItemAgg" a
SET "integrationId" = m."integrationId"
FROM "WeezeventMerchant" m
WHERE a."weezeventMerchantId" = m."id" AND a."integrationId" IS NULL;

UPDATE "SpaceProductRevenueDailyAgg" a
SET "integrationId" = p."integrationId"
FROM "WeezeventProduct" p
WHERE a."weezeventProductId" = p."id" AND a."integrationId" IS NULL;
