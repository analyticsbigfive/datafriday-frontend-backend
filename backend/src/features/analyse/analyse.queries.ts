import { Prisma } from '@prisma/client';
import { SqlClient } from '../../core/database/sql-client';

/** Statistiques de prix du catalogue d'articles du tenant. */
export function menuItemPriceStats(db: SqlClient, tenantId: string): Promise<Array<{
        totalItems: number;
        avgPrice: number | null;
        avgCost: number | null;
        avgMargin: number | null;
        lowMarginItems: number;
        highMarginItems: number;
      }>> {
  return db.$queryRaw<Array<{
        totalItems: number;
        avgPrice: number | null;
        avgCost: number | null;
        avgMargin: number | null;
        lowMarginItems: number;
        highMarginItems: number;
      }>>(Prisma.sql`
        SELECT
          COUNT(*)::int                                                             AS "totalItems",
          AVG(COALESCE("basePrice", 0))::float                                      AS "avgPrice",
          AVG(COALESCE("totalCost", 0))::float                                      AS "avgCost",
          AVG(COALESCE("margin", 0))::float                                         AS "avgMargin",
          COUNT(*) FILTER (WHERE "margin" > 0 AND "margin" < 30)::int               AS "lowMarginItems",
          COUNT(*) FILTER (WHERE "margin" >= 60)::int                               AS "highMarginItems"
        FROM "MenuItem"
        WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL
      `);
}

/** Nombre d'articles par type. */
export function menuItemCountByType(db: SqlClient, tenantId: string): Promise<Array<{ typeId: string; count: number }>> {
  return db.$queryRaw<Array<{ typeId: string; count: number }>>(Prisma.sql`
        SELECT COALESCE("typeId", 'unclassified') AS "typeId", COUNT(*)::int AS count
        FROM "MenuItem"
        WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL
        GROUP BY COALESCE("typeId", 'unclassified')
      `);
}

/** Totaux des events (nombre, CA) du tenant, filtre d'espace déjà résolu. */
export function eventTotals(db: SqlClient, tenantId: string, spaceFilter: Prisma.Sql): Promise<Array<{
      totalEvents: number;
      totalRevenue: number | null;
      totalTransactions: number | null;
      upcoming: number;
      completed: number;
    }>> {
  return db.$queryRaw<Array<{
      totalEvents: number;
      totalRevenue: number | null;
      totalTransactions: number | null;
      upcoming: number;
      completed: number;
    }>>(Prisma.sql`
      SELECT
        COUNT(*)::int                                                              AS "totalEvents",
        SUM(COALESCE("revenue", 0))::float                                         AS "totalRevenue",
        SUM(COALESCE("transactionCount", 0))::bigint                               AS "totalTransactions",
        COUNT(*) FILTER (WHERE "eventDate" > NOW())::int                           AS "upcoming",
        COUNT(*) FILTER (WHERE "status" IN ('success', 'completed'))::int          AS "completed"
      FROM "Event"
      WHERE "tenantId" = ${tenantId}
        ${spaceFilter}
    `);
}

/** Timeline minute d'un event, filtres optionnels déjà construits. Bornée par `limit`. */
export function eventMinuteTimeline(db: SqlClient, tenantId: string, eventId: string, shopFilter: Prisma.Sql, menuItemFilter: Prisma.Sql, startTimeFilter: Prisma.Sql, endTimeFilter: Prisma.Sql, limit: number): Promise<any[]> {
  return db.$queryRaw<any[]>(Prisma.sql`
      SELECT
        ${eventId}::text                                                              AS "eventId",
        TO_CHAR(DATE_TRUNC('minute', t."transactionDate"), 'HH24:MI')               AS minute,
        EXTRACT(HOUR FROM t."transactionDate")::integer                              AS hour,
        t."merchantId"                                                               AS "shopId",
        COALESCE(m.name, t."merchantName")                                          AS "shopName",
        ti."productId"                                                               AS "weezeventProductId",
        wpm."menuItemId",
        COALESCE(mi.name, ti."productName")                                         AS "menuItemName",
        SUM(ti.quantity)::integer                                                    AS quantity,
        COUNT(DISTINCT t.id)::integer                                               AS "transactionCount",
        -- BUG-352-01 : paiements réels via rawData au lieu de unitPrice*quantity, cf.
        -- aggregation.service.ts pour l'explication et la mesure d'impact. Le test de clé
        -- jsonb (affinage même jour) ne retombe sur unitPrice que si la clé est ABSENTE
        -- (produit normal, donnée manquante) — jamais si elle est présente-et-vide
        -- (vraie ligne formule/menu, cf. aggregation.service.ts pour la mesure des 2 cas).
        SUM(
          CASE WHEN t."provider" = 'WEEZEVENT' AND ti."rawData" ? 'payments' THEN
            COALESCE((
              SELECT SUM((p->>'amount')::numeric - (p->>'amount_vat')::numeric)
              FROM jsonb_array_elements(ti."rawData"->'payments') AS p
            ), 0) / 100
          ELSE
            (ti."unitPrice" * ti."quantity" - COALESCE(ti."reduction", 0)) / (1 + ti."vat" / 100)
          END
        )::numeric(12,2) AS revenue
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventTransactionItem" ti
        ON ti."transactionId" = t.id
      LEFT JOIN "WeezeventMerchant" m
        ON m.id = t."merchantId" AND m."tenantId" = ${tenantId}
      LEFT JOIN "WeezeventProductMapping" wpm
        ON wpm."weezeventProductId" = ti."productId"
       AND wpm."tenantId" = ${tenantId}
      LEFT JOIN "MenuItem" mi
        ON mi.id = wpm."menuItemId"
      WHERE t."tenantId" = ${tenantId}
        AND t."eventId"  = ${eventId}
        AND t.status = 'V'
        ${shopFilter}
        ${menuItemFilter}
        ${startTimeFilter}
        ${endTimeFilter}
      GROUP BY
        DATE_TRUNC('minute', t."transactionDate"),
        t."merchantId", m.name, t."merchantName",
        ti."productId", wpm."menuItemId", mi.name, ti."productName"
      ORDER BY minute ASC
      LIMIT ${limit}
    `);
}
