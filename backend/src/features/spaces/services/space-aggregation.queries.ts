import { Decimal } from '@prisma/client/runtime/library';
import { SqlClient } from '../../../core/database/sql-client';
import { revenueHtExpr as REVENUE_HT_EXPR } from '../../aggregation/event-aggregation.queries';

/** CA HT par minute, event et PdV sur une période. `locationIds` non vide. */
export function minuteRevenueByLocation(db: SqlClient, tenantId: string, locationIds: string[], fromDate: Date, toDate: Date): Promise<Array<{
        minute: Date;
        weezeventEventId: string | null;
        weezeventLocationId: string | null;
        weezeventMerchantId: string | null;
        spaceElementId: string | null;
        revenueHt: Decimal;
        transactionsCount: bigint;
        itemsCount: number;
      }>> {
  return db.$queryRaw<Array<{
        minute: Date;
        weezeventEventId: string | null;
        weezeventLocationId: string | null;
        weezeventMerchantId: string | null;
        spaceElementId: string | null;
        revenueHt: Decimal;
        transactionsCount: bigint;
        itemsCount: number;
      }>>`
      SELECT 
        DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC') as minute,
        t."eventId" as "weezeventEventId",
        t."locationId" as "weezeventLocationId",
        t."merchantId" as "weezeventMerchantId",
        mem."spaceElementId" as "spaceElementId",
        SUM(${REVENUE_HT_EXPR}) as "revenueHt",
        COUNT(DISTINCT t.id) as "transactionsCount",
        SUM(ti.quantity) as "itemsCount"
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t.id
      LEFT JOIN "WeezeventLocationShopMapping" mem 
        ON mem."weezeventLocationId" = t."merchantId" 
        AND mem."tenantId" = ${tenantId}
      WHERE 
        t."tenantId" = ${tenantId}
        AND t."locationId" = ANY(${locationIds})
        AND t."transactionDate" >= ${fromDate}
        AND t."transactionDate" <= ${toDate}
        AND t.status = 'V'
      GROUP BY 
        minute,
        t."eventId",
        t."locationId",
        t."merchantId",
        mem."spaceElementId"
    `;
}

/** CA HT par jour (fuseau de l'espace) et par produit. */
export function dailyRevenueByProduct(db: SqlClient, tenantId: string, timezone: string, locationIds: string[], fromDate: Date, toDate: Date): Promise<Array<{
        day: Date;
        weezeventProductId: string;
        revenueHt: Decimal;
        quantity: number;
      }>> {
  return db.$queryRaw<Array<{
        day: Date;
        weezeventProductId: string;
        revenueHt: Decimal;
        quantity: number;
      }>>`
      SELECT 
        DATE(t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) as day,
        ti."productId" as "weezeventProductId",
        SUM(${REVENUE_HT_EXPR}) as "revenueHt",
        SUM(ti.quantity) as quantity
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t.id
      WHERE 
        t."tenantId" = ${tenantId}
        AND t."locationId" = ANY(${locationIds})
        AND t."transactionDate" >= ${fromDate}
        AND t."transactionDate" <= ${toDate}
        AND t.status = 'V'
        AND ti."productId" IS NOT NULL
      GROUP BY day, ti."productId"
    `;
}

/** CA HT par minute, event, PdV et produit. */
export function minuteRevenueByProduct(db: SqlClient, tenantId: string, locationIds: string[], fromDate: Date, toDate: Date): Promise<Array<{
        minute: Date;
        weezeventEventId: string | null;
        weezeventLocationId: string | null;
        weezeventLocationName: string | null;
        weezeventMerchantId: string | null;
        spaceElementId: string | null;
        weezeventProductId: string | null;
        revenueHt: Decimal;
        transactionsCount: bigint;
        itemsCount: number;
      }>> {
  return db.$queryRaw<Array<{
        minute: Date;
        weezeventEventId: string | null;
        weezeventLocationId: string | null;
        weezeventLocationName: string | null;
        weezeventMerchantId: string | null;
        spaceElementId: string | null;
        weezeventProductId: string | null;
        revenueHt: Decimal;
        transactionsCount: bigint;
        itemsCount: number;
      }>>`
      SELECT
        DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC') as minute,
        t."eventId" as "weezeventEventId",
        t."locationId" as "weezeventLocationId",
        t."locationName" as "weezeventLocationName",
        t."merchantId" as "weezeventMerchantId",
        lsm."spaceElementId" as "spaceElementId",
        ti."productId" as "weezeventProductId",
        SUM(${REVENUE_HT_EXPR}) as "revenueHt",
        COUNT(DISTINCT t.id) as "transactionsCount",
        SUM(ti.quantity) as "itemsCount"
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t.id
      LEFT JOIN "WeezeventLocationShopMapping" lsm
        ON lsm."weezeventLocationId" = t."locationId"
        AND lsm."tenantId" = ${tenantId}
      WHERE
        t."tenantId" = ${tenantId}
        AND t."locationId" = ANY(${locationIds})
        AND t."transactionDate" >= ${fromDate}
        AND t."transactionDate" <= ${toDate}
        AND t.status = 'V'
        AND t."deletedAt" IS NULL
      GROUP BY
        minute,
        t."eventId",
        t."locationId",
        t."locationName",
        t."merchantId",
        lsm."spaceElementId",
        ti."productId"
    `;
}

/** Marchands avec ventes sur la période mais sans mapping. */
export function unmappedMerchantsWithSales(db: SqlClient, tenantId: string, locationIds: string[], fromDate: Date, toDate: Date): Promise<Array<{
        merchantId: string;
        merchantName: string;
        transactionCount: bigint;
        revenueHt: Decimal;
      }>> {
  return db.$queryRaw<Array<{
        merchantId: string;
        merchantName: string;
        transactionCount: bigint;
        revenueHt: Decimal;
      }>>`
      SELECT 
        t."merchantId",
        t."merchantName",
        COUNT(DISTINCT t.id) as "transactionCount",
        SUM(t.amount) as "revenueHt"
      FROM "WeezeventTransaction" t
      WHERE 
        t."tenantId" = ${tenantId}
        AND t."locationId" = ANY(${locationIds})
        AND t."transactionDate" >= ${fromDate}
        AND t."transactionDate" <= ${toDate}
        AND t."merchantId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "WeezeventLocationShopMapping" mem
          WHERE mem."weezeventLocationId" = t."merchantId"
          AND mem."tenantId" = ${tenantId}
        )
      GROUP BY t."merchantId", t."merchantName"
    `;
}

/** PdV avec ventes sur la période mais sans mapping. */
export function unmappedLocationsWithSalesInPeriod(db: SqlClient, tenantId: string, fromDate: Date, toDate: Date): Promise<Array<{
        locationId: string;
        locationName: string;
        transactionCount: bigint;
        revenueHt: Decimal;
      }>> {
  return db.$queryRaw<Array<{
        locationId: string;
        locationName: string;
        transactionCount: bigint;
        revenueHt: Decimal;
      }>>`
      SELECT 
        t."locationId",
        t."locationName",
        COUNT(DISTINCT t.id) as "transactionCount",
        SUM(t.amount) as "revenueHt"
      FROM "WeezeventTransaction" t
      WHERE 
        t."tenantId" = ${tenantId}
        AND t."transactionDate" >= ${fromDate}
        AND t."transactionDate" <= ${toDate}
        AND t."locationId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "WeezeventLocationSpaceMapping" lsm
          WHERE lsm."weezeventLocationId" = t."locationId"
          AND lsm."tenantId" = ${tenantId}
        )
      GROUP BY t."locationId", t."locationName"
    `;
}
