-- Chantier décimaux (2026-08-02) — cf. docs/PROPOSITION_MIGRATIONS_DECIMAUX.md.
--
-- 1) Quantités de vente Int → Float : les ventes fractionnaires (poids, formules
--    à ratio) étaient tronquées à l'ingestion Digifood (Math.trunc) = perte de CA.
--    Conversions sans perte (Int ⊂ Float), aucune réécriture de données.
ALTER TABLE "WeezeventTransactionItem" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::DOUBLE PRECISION;
ALTER TABLE "WeezeventPayment"         ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::DOUBLE PRECISION;

-- Agrégats qui somment ces quantités (SUM devient fractionnaire).
ALTER TABLE "SpaceProductRevenueDailyAgg" ALTER COLUMN "quantity"   TYPE DOUBLE PRECISION USING "quantity"::DOUBLE PRECISION;
ALTER TABLE "SpaceRevenueMinuteAgg"       ALTER COLUMN "itemsCount" TYPE DOUBLE PRECISION USING "itemsCount"::DOUBLE PRECISION;

-- 2) reduction est un MONTANT de remise (pas un %) : (5,2) plafonnait à 999,99 €
--    → overflow Postgres sur une grosse remise/annulation. Élargissement sans perte.
ALTER TABLE "WeezeventTransactionItem" ALTER COLUMN "reduction" TYPE NUMERIC(10,2);
