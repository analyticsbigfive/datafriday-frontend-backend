import { Prisma } from '@prisma/client';
import { BASKET_UNRESOLVED_PREFIX } from '../aggregation/event-aggregation-sql';

/**
 * Lecture des paniers pré-agrégés (SpaceBasketMinuteAgg) pour getTransactionBasketsBatch.
 * Même forme de sortie que l'ancienne requête brute sur WeezeventTransaction : une ligne par
 * (event, minute locale, PdV, combinaisons catégorie/type/article).
 *
 * Les libellés sont résolus ICI, à la lecture, depuis les clés produit de la ligne
 * (WeezeventProductMapping → MenuItem → type/catégorie ; WeezeventProduct.name en repli ;
 * 'name:<libellé>' pour une ligne sans produit résolu). Une catégorie/type absent reste `null`
 * DANS le tableau : le front le rend en « Non rattachés ». Deux compositions différentes qui
 * donnent les mêmes libellés (même article vendu sous deux ids) fusionnent au GROUP BY final,
 * comme deux transactions le faisaient dans la requête brute.
 *
 * `agg` est MATERIALIZED pour la même raison que event-timeline-window.sql.ts : lecture par
 * event via l'index (tenantId, spaceId, weezeventEventId), puis filtre shops sur le résultat.
 */
export function readBasketAggSql(input: {
  tenantId: string;
  spaceId: string;
  eventIds: string[];
  /** Clause shops de resolveEventSalesScope : référence `mem."spaceElementId"`. */
  shopScopeClause: Prisma.Sql;
  spaceTimezone: string;
}): Prisma.Sql {
  const { tenantId } = input;
  const itemName = Prisma.sql`COALESCE(mi.name, wp.name, CASE WHEN k LIKE ${BASKET_UNRESOLVED_PREFIX + '%'} THEN substr(k, ${BASKET_UNRESOLVED_PREFIX.length + 1}::int) END)`;

  return Prisma.sql`
    WITH agg AS MATERIALIZED (
      SELECT mem.*
      FROM "SpaceBasketMinuteAgg" mem
      WHERE mem."tenantId" = ${tenantId}
        AND mem."spaceId" = ${input.spaceId}
        AND mem."weezeventEventId" IN (${Prisma.join(input.eventIds)})
    ),
    -- Libellés résolus UNE fois par composition distincte (quelques centaines par event), pas
    -- par ligne minute × PdV (des milliers) : c'est ce qui rend la lecture moins chère que le
    -- brut même à chaud. ARRAY_AGG(DISTINCT x ORDER BY x) exige deux fois la MÊME expression :
    -- les libellés sont donc calculés dans lab, puis agrégés par leur nom.
    compositions AS (
      SELECT DISTINCT "productKeys" FROM agg
    ),
    labels AS (
      SELECT
        lab."productKeys",
        ARRAY_AGG(DISTINCT lab."category" ORDER BY lab."category") AS "categoryCombo",
        ARRAY_AGG(DISTINCT lab."type" ORDER BY lab."type")         AS "typeCombo",
        ARRAY_AGG(DISTINCT lab."item" ORDER BY lab."item")         AS "itemCombo"
      FROM (
        SELECT
          c."productKeys",
          pc.name     AS "category",
          pt.name     AS "type",
          ${itemName} AS "item"
        FROM compositions c
        CROSS JOIN unnest(c."productKeys") AS k
        LEFT JOIN "WeezeventProductMapping" wpm ON wpm."weezeventProductId" = k AND wpm."tenantId" = ${tenantId}
        LEFT JOIN "MenuItem" mi ON mi.id = wpm."menuItemId"
        LEFT JOIN "ProductType" pt ON pt.id = mi."typeId"
        LEFT JOIN "ProductCategory" pc ON pc.id = mi."categoryId"
        LEFT JOIN "WeezeventProduct" wp ON wp.id = k
      ) lab
      GROUP BY lab."productKeys"
    ),
    resolved AS (
      SELECT
        mem."weezeventEventId"                                                  AS "eventId",
        DATE_TRUNC('minute', mem."minute" AT TIME ZONE 'UTC' AT TIME ZONE ${input.spaceTimezone}) AS "minuteLocal",
        COALESCE(mem."spaceElementId", mem."weezeventLocationId")               AS "shopId",
        COALESCE(se.name, mem."weezeventLocationName", mem."weezeventLocationId") AS "shopName",
        COALESCE(se.attributes::jsonb->>'originalType', se.type::text)          AS "shopType",
        se.attributes::jsonb->>'area'                                           AS "shopArea",
        l."categoryCombo",
        l."typeCombo",
        l."itemCombo",
        mem."transactionsCount",
        mem."itemsQuantity",
        mem."revenueHt"
      FROM agg mem
      JOIN labels l ON l."productKeys" = mem."productKeys"
      LEFT JOIN "SpaceElement" se ON se.id = mem."spaceElementId"
      WHERE ${input.shopScopeClause}
    )
    SELECT
      "eventId",
      TO_CHAR("minuteLocal", 'HH24:MI')                 AS minute,
      TO_CHAR("minuteLocal", 'YYYY-MM-DD"T"HH24:MI')    AS "minuteLocal",
      "shopId", "shopName", "shopType", "shopArea",
      "categoryCombo", "typeCombo", "itemCombo",
      SUM("transactionsCount")::integer                 AS "transactionCount",
      SUM("itemsQuantity")::integer                     AS quantity,
      SUM("revenueHt")::numeric(12,2)                   AS "revenueHt"
    FROM resolved
    GROUP BY
      "eventId", "minuteLocal", "shopId", "shopName", "shopType", "shopArea",
      "categoryCombo", "typeCombo", "itemCombo"
    ORDER BY "eventId", "minuteLocal" ASC
  `;
}
