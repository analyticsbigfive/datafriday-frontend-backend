-- Backfill de WeezeventTransactionItem.reduction en EUROS, recalculée depuis rawData
-- (la ligne brute Weezevent, en centimes). Corrige les lignes écrites par l'ancien
-- transaction-sync qui stockait des centimes bruts (incohérent avec incremental-sync
-- en euros et avec aggregation qui traite reduction comme un montant €).
--
-- IDEMPOTENT : on dérive toujours de rawData (jamais de la valeur stockée), donc
-- ré-exécuter ne divise pas par 100 une 2e fois. No-op sur les lignes déjà correctes.
-- Ne touche que les lignes dont rawData porte la clé 'reduction'.
UPDATE "WeezeventTransactionItem"
SET "reduction" = COALESCE(NULLIF("rawData" ->> 'reduction', '')::numeric, 0) / 100
WHERE "rawData" ->> 'reduction' IS NOT NULL;
