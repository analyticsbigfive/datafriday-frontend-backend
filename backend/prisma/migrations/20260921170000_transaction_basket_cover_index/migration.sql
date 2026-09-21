-- Lecture des paniers (getTransactionBasketsBatch / getAnalyseUnmappedBatch) : fenêtre par event
-- sur (tenantId, integrationId, status, transactionDate) avec toutes les colonnes lues dans la
-- clé, index-only scan, plus d'accès aléatoire aux lignes de 1,5 Ko (rawData JSON).
-- Mesuré le 2026-09-21 : 15 events 18,9 s → 4,3 s (395k pages → 42k). En production l'index a
-- été créé CONCURRENTLY à la main (57 s, 396 MB) puis cette migration marquée appliquée.
CREATE INDEX IF NOT EXISTS "WeezeventTransaction_basket_cover_idx"
  ON "WeezeventTransaction"("tenantId", "integrationId", "status", "transactionDate", "deletedAt", "eventId", "locationId", "locationName", "id");
