import { Prisma } from '@prisma/client';
import { SqlClient } from '../../../core/database/sql-client';
import { lineRevenueTtcSql } from '../../../shared/sales/line-revenue.queries';

/** Filtre des transactions d'une analyse (tenant, non supprimées, événement et période facultatifs). */
export interface AnalyticsFilter {
  tenantId: string;
  eventId?: string;
  fromDate?: Date;
  toDate?: Date;
}

const transactionFilter = (f: AnalyticsFilter) =>
  Prisma.join(
    [
      Prisma.sql`t."tenantId" = ${f.tenantId}`,
      Prisma.sql`t."deletedAt" IS NULL`,
      ...(f.eventId ? [Prisma.sql`t."eventId" = ${f.eventId}`] : []),
      ...(f.fromDate ? [Prisma.sql`t."transactionDate" >= ${f.fromDate}`] : []),
      ...(f.toDate ? [Prisma.sql`t."transactionDate" <= ${f.toDate}`] : []),
    ],
    ' AND ',
  );

/** Ventes par produit : quantité, montant TTC encaissé (lineRevenueTtcSql), nombre de lignes. */
export async function salesByProduct(db: SqlClient, f: AnalyticsFilter) {
  const rows = await db.$queryRaw<
    { productId: string; productName: string; quantity: number; totalAmount: Prisma.Decimal | number; transactionCount: bigint }[]
  >`
    SELECT COALESCE(i."productId", 'unknown') AS "productId",
           COALESCE(MIN(i."productName"), 'Unknown Product') AS "productName",
           SUM(i."quantity") AS "quantity",
           SUM(${lineRevenueTtcSql('t', 'i')}) AS "totalAmount",
           COUNT(*) AS "transactionCount"
    FROM "WeezeventTransactionItem" i
    JOIN "WeezeventTransaction" t ON t."id" = i."transactionId"
    WHERE ${transactionFilter(f)}
    GROUP BY COALESCE(i."productId", 'unknown')
    ORDER BY "totalAmount" DESC
  `;
  return rows.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    quantity: Number(r.quantity),
    totalAmount: Number(r.totalAmount),
    transactionCount: Number(r.transactionCount),
  }));
}

/** Ventes par événement : montant des transactions, nombre de transactions et de lignes. */
export async function salesByEvent(db: SqlClient, f: AnalyticsFilter) {
  const rows = await db.$queryRaw<
    { eventId: string; eventName: string; totalAmount: Prisma.Decimal | number; transactionCount: bigint; itemCount: bigint }[]
  >`
    SELECT COALESCE(t."eventId", 'unknown') AS "eventId",
           COALESCE(MIN(t."eventName"), 'Unknown Event') AS "eventName",
           SUM(t."amount") AS "totalAmount",
           COUNT(*) AS "transactionCount",
           COALESCE(SUM(ic."n"), 0) AS "itemCount"
    FROM "WeezeventTransaction" t
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "n" FROM "WeezeventTransactionItem" i WHERE i."transactionId" = t."id"
    ) ic ON true
    WHERE ${transactionFilter(f)}
    GROUP BY COALESCE(t."eventId", 'unknown')
    ORDER BY "totalAmount" DESC
  `;
  return rows.map((r) => ({
    eventId: r.eventId,
    eventName: r.eventName,
    totalAmount: Number(r.totalAmount),
    transactionCount: Number(r.transactionCount),
    itemCount: Number(r.itemCount),
  }));
}

/** Lignes vendues avec leur article de menu rattaché (null si non rattaché) et le coût de l'article. */
export async function soldLinesWithMenuItemCost(db: SqlClient, f: AnalyticsFilter) {
  const rows = await db.$queryRaw<
    {
      productId: string | null;
      productName: string | null;
      quantity: number;
      sales: Prisma.Decimal | number;
      menuItemId: string | null;
      menuItemName: string | null;
      menuItemTotalCost: Prisma.Decimal | number | null;
    }[]
  >`
    SELECT i."productId", i."productName", i."quantity",
           ${lineRevenueTtcSql('t', 'i')} AS "sales",
           mi."id" AS "menuItemId", mi."name" AS "menuItemName", mi."totalCost" AS "menuItemTotalCost"
    FROM "WeezeventTransactionItem" i
    JOIN "WeezeventTransaction" t ON t."id" = i."transactionId"
    LEFT JOIN "WeezeventProductMapping" pm ON pm."weezeventProductId" = i."productId"
    LEFT JOIN "MenuItem" mi ON mi."id" = pm."menuItemId"
    WHERE ${transactionFilter(f)}
  `;
  return rows.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    quantity: Number(r.quantity),
    sales: Number(r.sales),
    menuItemId: r.menuItemId,
    menuItemName: r.menuItemName,
    menuItemTotalCost: r.menuItemTotalCost == null ? null : Number(r.menuItemTotalCost),
  }));
}

/** Produits les plus vendus : quantité, chiffre d'affaires, catégorie du produit. */
export async function productRevenue(db: SqlClient, f: AnalyticsFilter) {
  const rows = await db.$queryRaw<
    { productId: string; productName: string; category: string | null; quantity: number; revenue: Prisma.Decimal | number }[]
  >`
    SELECT COALESCE(i."productId", 'unknown') AS "productId",
           COALESCE(MIN(i."productName"), 'Unknown Product') AS "productName",
           MIN(p."categoryId") AS "category",
           SUM(i."quantity") AS "quantity",
           SUM(${lineRevenueTtcSql('t', 'i')}) AS "revenue"
    FROM "WeezeventTransactionItem" i
    JOIN "WeezeventTransaction" t ON t."id" = i."transactionId"
    LEFT JOIN "WeezeventProduct" p ON p."id" = i."productId"
    WHERE ${transactionFilter(f)}
    GROUP BY COALESCE(i."productId", 'unknown')
    ORDER BY "revenue" DESC
  `;
  return rows.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    category: r.category,
    quantity: Number(r.quantity),
    revenue: Number(r.revenue),
  }));
}
