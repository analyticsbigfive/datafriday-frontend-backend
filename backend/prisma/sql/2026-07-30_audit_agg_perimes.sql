-- Audit des agrégats SpaceRevenueMinuteAgg périmés (TTC stocké dans une colonne "revenueHt")
-- (2026-07-30, branche feat/Hr)
--
-- ⚠️ SCRIPT DE LECTURE SEULE. Aucun DDL, aucun UPDATE. Ne corrige rien : il liste
-- ce qui doit être rejoué via POST /aggregation/process-events.
--
-- Pourquoi : jusqu'au commit a71045b (2026-07-21, BUG-015), le pipeline vivant
-- (aggregation.service.ts:297) écrivait SUM(unitPrice * quantity - reduction) dans
-- SpaceRevenueMinuteAgg."revenueHt" SANS diviser par (1 + vat/100) — donc du TTC sous un
-- libellé HT. La formule est corrigée depuis, mais les lignes écrites AVANT n'ont jamais
-- été recalculées : elles restent en TTC, et c'est elles que lisent la RPC
-- get_space_shop_details, les cartes de la home page et le rollup Event.revenue
-- (aggregation.service.ts:363-376).
--
-- Mesuré le 2026-07-30 sur datafriday-dev : 8 espaces, 35 events, ≈ 1,26 M€ affichés en TTC
-- sous un libellé HT. Sur l'espace Auxerre (cmovsjbiz01lzvwyn30wweqpf), le contrôle est
-- sans ambiguïté — les events agrégés le 2026-07-07 ont un `stored` égal au TTC recalculé
-- au centime près (ratio 1,10 à 1,15 selon le mix de taux), ceux agrégés après le 07-21 ont
-- un `stored` égal au HT au centime près (ratio 1,0000).
--
-- Deux causes candidates ont été mesurées et écartées, ne pas les réexplorer :
--   - `reduction` (soustraite par l'agrégat, ignorée par l'item-level) :
--     SUM(reduction) = 0,00 € sur 899 308 lignes de WeezeventTransactionItem ;
--   - filtre `status = 'V'` (présent côté item-level, absent côté agrégat) : sur la journée
--     de contrôle, TTC total = TTC filtré. Aucun écart.
-- L'intégralité de l'écart shop-level vs item-level est de la TVA (taux 10 / 20 / 5,5 %,
-- moyenne pondérée ≈ 14,3 % sur un match d'Auxerre).
--
-- ⚠️ AVANT DE REJOUER L'AGRÉGATION : toujours passer `integrationId` explicitement.
-- Sans lui, `integrationClause` est vide (aggregation.service.ts:260-262) et la requête
-- devient tenant-wide. Or deux integrationId peuvent porter les mêmes transactions
-- (constat fiche 247-01 § « Effet de bord ») → un recalcul non scopé DOUBLE le CA.
--
-- À rejouer après toute future migration de formule de CA : sans cet audit, le prochain
-- correctif laissera le même angle mort (code corrigé, données périmées).

-- ── Requête 1 : vue d'ensemble par espace ────────────────────────────────────────────
-- Quels espaces portent des agrégats antérieurs au fix, et pour quel montant.

SELECT
  s.name                                        AS espace,
  a."spaceId",
  a."tenantId",
  COUNT(DISTINCT a."weezeventEventId")          AS events_perimes,
  COUNT(*)                                      AS lignes,
  SUM(a."revenueHt")::numeric(14, 2)            AS montant_stocke_ttc,
  MAX(a."createdAt")::date                      AS dernier_calcul
FROM "SpaceRevenueMinuteAgg" a
JOIN "Space" s ON s.id = a."spaceId"
WHERE a."createdAt" < '2026-07-21'   -- date du fix BUG-015 (commit a71045b)
GROUP BY 1, 2, 3
ORDER BY montant_stocke_ttc DESC;

-- ── Requête 2 : détail par event, avec recalcul comparatif ───────────────────────────
-- Pour chaque event : montant stocké vs TTC et HT recalculés sur la même fenêtre.
-- Lecture : ratio ≈ 1,0000 → ligne saine (déjà HT). Ratio > 1,05 → ligne périmée, à rejouer.
--
-- Renseigner :ESPACE et :INTEGRATION. L'intégration rattachée à l'espace se lit dans
-- "WeezeventLocationSpaceMapping"."weezeventLocationId" — colonne mal nommée, elle contient
-- un integrationId (schema.prisma:2523-2535, spaces.service.ts:1160-1163,1196-1198) :
--   SELECT "weezeventLocationId" FROM "WeezeventLocationSpaceMapping" WHERE "spaceId" = :ESPACE;

WITH agg AS (
  SELECT
    "weezeventEventId"                  AS eid,
    SUM("revenueHt")::numeric(14, 2)    AS stocke,
    MIN("createdAt")::date              AS calcule_le,
    COUNT(*)                            AS lignes
  FROM "SpaceRevenueMinuteAgg"
  WHERE "spaceId" = :ESPACE
  GROUP BY 1
),
ev AS (
  -- Même fenêtre que l'item-level : eventDate → (eventEndDate ?? eventDate) + 1 jour
  -- (spaces.service.ts:1178-1191).
  SELECT
    id,
    name,
    "eventDate"::date                                       AS debut,
    (COALESCE("eventEndDate", "eventDate")::date + 1)       AS fin
  FROM "Event"
  WHERE "spaceId" = :ESPACE
),
calc AS (
  SELECT
    ev.id                                                                     AS eid,
    SUM(ti."unitPrice" * ti.quantity)::numeric(14, 2)                         AS ttc,
    SUM(ti."unitPrice" * ti.quantity / (1 + ti.vat / 100))::numeric(14, 2)    AS ht
  FROM ev
  JOIN "WeezeventTransaction" t
    ON  t."transactionDate" >= ev.debut
    AND t."transactionDate" <  ev.fin
    AND t."integrationId"    = :INTEGRATION
    AND t."deletedAt" IS NULL
    AND t.status = 'V'
  JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t.id
  GROUP BY 1
)
SELECT
  COALESCE(ev.name, '(event introuvable)')      AS event,
  agg.calcule_le,
  agg.lignes,
  agg.stocke,
  calc.ttc                                      AS ttc_recalcule,
  calc.ht                                       AS ht_recalcule,
  ROUND(agg.stocke / NULLIF(calc.ht, 0), 4)     AS ratio_stocke_sur_ht,
  (agg.stocke - calc.ht)::numeric(14, 2)        AS tva_a_retirer
FROM agg
LEFT JOIN ev   ON ev.id   = agg.eid
LEFT JOIN calc ON calc.eid = agg.eid
ORDER BY agg.stocke DESC;

-- ── Requête 3 : décomposition des taux de TVA sur une fenêtre ────────────────────────
-- Sert à expliquer un ratio observé : il varie avec le mix bière (20 %) / soft-food (10 %)
-- / 5,5 %, donc d'un match à l'autre. Un ratio hors de [1,055 ; 1,20] n'est PAS un pur
-- effet TVA et signale autre chose (périmètre, double intégration).

SELECT
  ti.vat                                                              AS taux,
  COUNT(*)                                                            AS lignes,
  SUM(ti."unitPrice" * ti.quantity)::numeric(14, 2)                   AS ttc,
  ROUND(100 * SUM(ti."unitPrice" * ti.quantity)
            / SUM(SUM(ti."unitPrice" * ti.quantity)) OVER (), 1)      AS pct_du_ca,
  (SUM(ti."unitPrice" * ti.quantity)
   - SUM(ti."unitPrice" * ti.quantity / (1 + ti.vat / 100)))::numeric(14, 2) AS tva_eur
FROM "WeezeventTransaction" t
JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t.id
WHERE t."integrationId" = :INTEGRATION
  AND t."transactionDate" >= :DEBUT
  AND t."transactionDate" <  :FIN
  AND t."deletedAt" IS NULL
GROUP BY 1
ORDER BY ttc DESC;

-- ── Requête 4 : contrôle anti-double-comptage AVANT recalcul ─────────────────────────
-- Plusieurs integrationId portant les mêmes transactions sur la même journée = piège.
-- Si cette requête renvoie plus d'une ligne pour une date, ne JAMAIS lancer un recalcul
-- sans `integrationId` : le total serait multiplié par le nombre d'intégrations.

SELECT
  t."transactionDate"::date       AS jour,
  t."integrationId",
  COUNT(DISTINCT t.id)            AS transactions,
  COUNT(ti.id)                    AS lignes,
  SUM(ti."unitPrice" * ti.quantity)::numeric(14, 2) AS ttc
FROM "WeezeventTransaction" t
JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t.id
WHERE t."transactionDate" >= :DEBUT
  AND t."transactionDate" <  :FIN
  AND t."deletedAt" IS NULL
GROUP BY 1, 2
ORDER BY jour, ttc DESC;
