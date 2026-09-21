import { Prisma } from '@prisma/client';

/**
 * CTEs communes aux deux lectures de getEventTimelineBatch (grain summary et minute) sur la
 * pré-agrégation SpaceRevenueMinuteItemAgg.
 *
 * `win` est MATERIALIZED, c'est le coeur du correctif du 2026-09-21 : sans cette barrière, le
 * planificateur voyait la clause shops (`spaceElementId IS NULL OR = ANY(...)`) comme sélective
 * et lisait TOUTES les lignes de l'espace via l'index spaceElementId (702k lignes, 12 à 32 s
 * mesurés, 502 côté proxy) avant de filtrer par fenêtre d'event. Matérialiser la fenêtre
 * force la lecture par l'index (tenantId, spaceId, minute) event par event (~3k lignes par
 * event, 342 ms pour 6 events), puis le filtre shops s'applique sur ce petit résultat.
 *
 * `dedup` (BUG-130-01) : élimination des lignes jumelles inter-writers PAR minute (les deux
 * pipelines d'agrégation peuvent écrire la même vente sous l'id Event et sous le tag brut),
 * inchangée. Les consommateurs agrègent ensuite dedup selon leur grain.
 */
export function eventTimelineWindowCtes(input: {
  tenantId: string;
  spaceId: string;
  valuesSql: Prisma.Sql;
  shopScopeClause: Prisma.Sql;
}): Prisma.Sql {
  return Prisma.sql`
    WITH ev("eventId", "windowStart", "windowEnd", "tagId", "eventIntegrationId") AS (VALUES ${input.valuesSql}),
    win AS MATERIALIZED (
      SELECT
        ev."eventId"                 AS "eventId",
        mem."minute"                 AS "minute",
        mem."spaceElementId"         AS "spaceElementId",
        mem."weezeventLocationId"    AS "weezeventLocationId",
        mem."weezeventLocationName"  AS "weezeventLocationName",
        mem."weezeventMerchantId"    AS "weezeventMerchantId",
        mem."weezeventProductId"     AS "weezeventProductId",
        mem."itemsCount"             AS "itemsCount",
        mem."transactionsCount"      AS "transactionsCount",
        mem."revenueHt"              AS "revenueHt"
      FROM ev
      INNER JOIN "SpaceRevenueMinuteItemAgg" mem
        ON mem."minute" >= ev."windowStart"
       AND mem."minute" <  ev."windowEnd"
       -- BUG-146-01 : quand l'event est lié à son conteneur de club (ev."tagId"), ne prendre que
       -- les lignes agrégées SOUS cet event (id Event DataFriday, writer aggregation.service) ou
       -- sous le tag brut (id WeezeventEvent, writer space-aggregation). tagId NULL → fenêtre
       -- seule (BUG-123-01 : events qui n'existent qu'en WeezeventEvent).
       AND (ev."tagId" IS NULL OR mem."weezeventEventId" IN (ev."eventId", ev."tagId"))
       AND mem."tenantId" = ${input.tenantId}
       AND mem."spaceId"  = ${input.spaceId}
    ),
    dedup AS (
      SELECT
        mem."eventId"                AS "eventId",
        mem."minute"                 AS "minute",
        mem."spaceElementId"         AS "spaceElementId",
        mem."weezeventLocationId"    AS "weezeventLocationId",
        mem."weezeventLocationName"  AS "weezeventLocationName",
        mem."weezeventProductId"     AS "weezeventProductId",
        MAX(mem."itemsCount")        AS "itemsCount",
        MAX(mem."transactionsCount") AS "transactionsCount",
        MAX(mem."revenueHt")         AS "revenueHt"
      FROM win mem
      WHERE ${input.shopScopeClause}
      GROUP BY
        mem."eventId", mem."minute",
        mem."spaceElementId", mem."weezeventLocationId", mem."weezeventLocationName",
        mem."weezeventMerchantId", mem."weezeventProductId"
    )
  `;
}
