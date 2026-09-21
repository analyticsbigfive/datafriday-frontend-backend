-- Lecture des paniers par transaction (getTransactionBasketsBatch / getAnalyseUnmappedBatch) :
-- toutes les colonnes lues sont dans la clé, index-only scan, plus d'accès aléatoire aux lignes
-- de 769 octets (rawData JSON) de la table. Mesuré le 2026-09-21 : 2 475 → 27 pages disque pour
-- 11 000 paniers. En production l'index a été créé CONCURRENTLY à la main (57 s, 415 MB) puis
-- cette migration marquée appliquée (prisma migrate resolve).
CREATE INDEX IF NOT EXISTS "WeezeventTransactionItem_tx_basket_cover_idx"
  ON "WeezeventTransactionItem"("transactionId", "productId", "productName", "quantity", "unitPrice", "vat");
