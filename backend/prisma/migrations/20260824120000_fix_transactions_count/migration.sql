-- BUG-135-01 : recalcul de SpaceRevenueMinuteAgg."transactionsCount"
--
-- PROBLEME
-- La colonne s appelle "transactionsCount" mais un des deux ecrivains
-- (aggregation.service.ts) y ecrivait COUNT(ti."id"), c est a dire le nombre de
-- LIGNES de vente et non le nombre de tickets. L autre ecrivain
-- (space-aggregation.service.ts) ecrivait deja COUNT(DISTINCT t."id"). Les deux
-- sont desormais alignes dans le code ; ce fichier repare l historique.
--
-- Mesure sur "Le Mans-Brest" du 22/08/2026 (espace Le Mans FC) :
--   13 925 lignes de vente   <- ce que la page affichait
--    5 721 tickets distincts <- la valeur juste
--   panier moyen 4,71 EUR    -> 11,46 EUR
--
-- PORTEE : 547 954 lignes, 31 espaces, 305 events, 2019-09 a 2026-08.
--
-- METHODE : on recalcule PAR LE GRAIN (minute, locationId, merchantId,
-- spaceElementId), jamais par "weezeventEventId". Raison : les deux pipelines
-- d ecriture taguent cette colonne avec des conventions d id differentes
-- (Event.id DataFriday pour aggregation.service.ts, WeezeventEvent.id brut pour
-- space-aggregation.service.ts). Le grain, lui, est identique quel que soit
-- l ecrivain. Une transaction n a qu une date, une location et un merchant : elle
-- tombe donc dans exactement UN groupe, et la somme de la colonne redevient le
-- nombre reel de tickets.
--
-- IDEMPOTENT : rejouable sans effet de bord.
--
-- LIMITE MESUREE (dev, 2026-08-24) : 282 250 des 547 954 lignes se rattachent au
-- grain courant et sont donc reparables ici. Les 265 704 restantes portent une
-- convention d id ANTERIEURE (spaceElementId d un mapping depuis modifie, ou
-- weezeventMerchantId recopie de locationId avant BUG-014) : leur grain ne
-- correspond plus a la realite, et reparer leur seul compteur serait cosmetique.
-- Par event : 196 events entierement reparables, 55 partiellement, 54 pas du tout
-- (aucun posterieur au 2026-06-19). Ces 109 events doivent passer par une
-- re-agregation complete : POST /aggregation/process-events sur leur espace.
--
-- CONTROLE : lister les events NON entierement reparables apres execution --
--   WITH l AS (
--     SELECT DISTINCT t."tenantId" AS tid,
--            date_trunc('minute', t."transactionDate") AS mn,
--            t."locationId" AS lid, t."merchantId" AS mid,
--            lsm."spaceElementId" AS sid
--     FROM "WeezeventTransaction" t
--     JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
--     LEFT JOIN "WeezeventLocationShopMapping" lsm
--       ON lsm."weezeventLocationId" = t."locationId" AND lsm."tenantId" = t."tenantId"
--     WHERE t."deletedAt" IS NULL
--   )
--   SELECT a."spaceId", a."weezeventEventId",
--          COUNT(*) AS rows, COUNT(l.mn) AS reparables
--   FROM "SpaceRevenueMinuteAgg" a
--   LEFT JOIN l ON a."tenantId" = l.tid AND a."minute" = l.mn
--     AND a."weezeventLocationId" IS NOT DISTINCT FROM l.lid
--     AND a."weezeventMerchantId" IS NOT DISTINCT FROM l.mid
--     AND a."spaceElementId"      IS NOT DISTINCT FROM l.sid
--   GROUP BY 1, 2
--   HAVING COUNT(l.mn) < COUNT(*)
--   ORDER BY 1, 2;
--
-- NOTE sur les deux ecrivains : space-aggregation.service.ts filtre status = 'V' et
-- joint le mapping PdV sur t."merchantId" la ou tout le reste joint sur
-- t."locationId". Ce recalcul applique la semantique CANONIQUE (celle
-- d aggregation.service.ts). La divergence des deux ecrivains est suivie a part.
--
-- CONTROLE AVANT (attendu : 13925) :
--   SELECT SUM("transactionsCount") FROM "SpaceRevenueMinuteAgg"
--   WHERE "weezeventEventId" = '5d8d0500-f7ad-4bdf-9767-bbe5a5e15a89';
-- CONTROLE APRES (attendu : 5721) : meme requete.
--   SELECT "transactionCount", "avgSpendPerTx" FROM "Event"
--   WHERE id = '5d8d0500-f7ad-4bdf-9767-bbe5a5e15a89';   -- attendu : 5721 / ~11.46

-- 1) Recalcul de la colonne, au grain de la table.
WITH truth AS (
  SELECT
    t."tenantId"                                        AS "tenantId",
    date_trunc('minute', t."transactionDate")           AS "minute",
    t."locationId"                                      AS "locationId",
    t."merchantId"                                      AS "merchantId",
    lsm."spaceElementId"                                AS "spaceElementId",
    COUNT(DISTINCT t."id")::int                         AS "txCount"
  FROM "WeezeventTransaction" t
  JOIN "WeezeventTransactionItem" ti
    ON ti."transactionId" = t."id"
  LEFT JOIN "WeezeventLocationShopMapping" lsm
    ON lsm."weezeventLocationId" = t."locationId"
   AND lsm."tenantId" = t."tenantId"
  WHERE t."deletedAt" IS NULL
  GROUP BY
    t."tenantId",
    date_trunc('minute', t."transactionDate"),
    t."locationId",
    t."merchantId",
    lsm."spaceElementId"
)
UPDATE "SpaceRevenueMinuteAgg" a
SET "transactionsCount" = truth."txCount",
    "updatedAt"         = NOW()
FROM truth
WHERE a."tenantId" = truth."tenantId"
  AND a."minute"   = truth."minute"
  AND a."weezeventLocationId" IS NOT DISTINCT FROM truth."locationId"
  AND a."weezeventMerchantId" IS NOT DISTINCT FROM truth."merchantId"
  AND a."spaceElementId"      IS NOT DISTINCT FROM truth."spaceElementId"
  AND a."transactionsCount"  IS DISTINCT FROM truth."txCount";

-- 2) Re-rollup sur Event, UNIQUEMENT pour les events dont TOUTES les lignes ont pu
--    etre rattachees a l etape 1. Un event partiellement repare donnerait une somme
--    hybride (moitie tickets, moitie lignes) : fausse, et surtout indetectable — le
--    script verify-event-analytics.ts signale aujourd hui le defaut par l egalite
--    "transactionCount == nombre de lignes", que ce melange casserait en silence.
--    Les events partiels gardent donc leur ancienne valeur, visiblement fausse,
--    jusqu a leur re-agregation par POST /aggregation/process-events.
--    Ne concerne par ailleurs que les lignes taguees avec un Event.id DataFriday ;
--    les lignes tagees WeezeventEvent.id brut n alimentent pas ces colonnes.
WITH matchable AS (
  SELECT DISTINCT
    t."tenantId"                              AS "tenantId",
    date_trunc('minute', t."transactionDate") AS "minute",
    t."locationId"                            AS "locationId",
    t."merchantId"                            AS "merchantId",
    lsm."spaceElementId"                      AS "spaceElementId"
  FROM "WeezeventTransaction" t
  JOIN "WeezeventTransactionItem" ti
    ON ti."transactionId" = t."id"
  LEFT JOIN "WeezeventLocationShopMapping" lsm
    ON lsm."weezeventLocationId" = t."locationId"
   AND lsm."tenantId" = t."tenantId"
  WHERE t."deletedAt" IS NULL
),
coverage AS (
  SELECT
    a."weezeventEventId"                        AS "eventId",
    COUNT(*)                                    AS "rows",
    COUNT(m."minute")                           AS "repaired",
    SUM(a."transactionsCount")::int             AS "txCount",
    SUM(a."revenueHt")                          AS "revenueHt"
  FROM "SpaceRevenueMinuteAgg" a
  LEFT JOIN matchable m
    ON a."tenantId" = m."tenantId"
   AND a."minute"   = m."minute"
   AND a."weezeventLocationId" IS NOT DISTINCT FROM m."locationId"
   AND a."weezeventMerchantId" IS NOT DISTINCT FROM m."merchantId"
   AND a."spaceElementId"      IS NOT DISTINCT FROM m."spaceElementId"
  WHERE a."weezeventEventId" IS NOT NULL
  GROUP BY a."weezeventEventId"
),
rollup AS (
  SELECT "eventId", "txCount", "revenueHt"
  FROM coverage
  WHERE "repaired" = "rows"
)
UPDATE "Event" e
SET "transactionCount" = rollup."txCount",
    "avgSpendPerTx"    = CASE
                           WHEN rollup."txCount" > 0
                           THEN ROUND((COALESCE(e."revenue", rollup."revenueHt") / rollup."txCount")::numeric, 2)
                           ELSE NULL
                         END
FROM rollup
WHERE e."id" = rollup."eventId"
  AND e."transactionCount" IS DISTINCT FROM rollup."txCount";
