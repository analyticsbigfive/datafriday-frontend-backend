import { Prisma } from '@prisma/client';
import { SqlClient } from '../../core/database/sql-client';

/**
 * Requêtes de prix de vente. `tenantId` est toujours le premier paramètre métier et
 * toujours appliqué dans le WHERE.
 */

/** Colonnes de SalesPriceAgg utilisables comme clé (liste fermée, jamais une entrée utilisateur). */
export type PriceAggKey = 'productNameNorm' | 'itemWeezeventId' | 'productId';
const KEY_COLUMN: Record<PriceAggKey, Prisma.Sql> = {
  productNameNorm: Prisma.raw('"productNameNorm"'),
  itemWeezeventId: Prisma.raw('"itemWeezeventId"'),
  productId: Prisma.raw('"productId"'),
};

export interface PriceAggFilter {
  integrationId?: string;
  /** Liste non vide : restreint aux locations d'un espace. */
  locationIds?: string[];
}

export interface PriceRow {
  key: string | null;
  unitPrice: unknown;
  vat: unknown;
}

function aggConditions(tenantId: string, key: PriceAggKey, values: string[], filter: PriceAggFilter): Prisma.Sql {
  const conds: Prisma.Sql[] = [
    Prisma.sql`"tenantId" = ${tenantId}`,
    Prisma.sql`${KEY_COLUMN[key]} IN (${Prisma.join(values)})`,
  ];
  if (filter.integrationId) conds.push(Prisma.sql`"integrationId" = ${filter.integrationId}`);
  if (filter.locationIds && filter.locationIds.length > 0) {
    conds.push(Prisma.sql`"locationId" IN (${Prisma.join(filter.locationIds)})`);
  }
  return Prisma.join(conds, ' AND ');
}

/** Dernier prix vendu par clé (BUG-337-02 : lu sur l'agrégat SalesPriceAgg). `values` non vide. */
export function latestPricesFromAgg(
  db: SqlClient,
  tenantId: string,
  key: PriceAggKey,
  values: string[],
  filter: PriceAggFilter = {},
): Promise<PriceRow[]> {
  const col = KEY_COLUMN[key];
  return db.$queryRaw<PriceRow[]>(Prisma.sql`
    SELECT DISTINCT ON (agg.k) agg.k AS "key", agg."unitPrice", agg."vat"
    FROM (
      SELECT ${col} AS k, "unitPrice", "vat", MAX("lastSoldAt") AS last_sold
      FROM "SalesPriceAgg"
      WHERE ${aggConditions(tenantId, key, values, filter)}
      GROUP BY ${col}, "unitPrice", "vat"
    ) agg
    ORDER BY agg.k, agg.last_sold DESC
  `);
}

/** Distribution des prix par clé, du plus pratiqué au moins pratiqué. `values` non vide. */
export function modalPricesFromAgg(
  db: SqlClient,
  tenantId: string,
  key: PriceAggKey,
  values: string[],
  filter: PriceAggFilter = {},
): Promise<Array<PriceRow & { n: number }>> {
  const col = KEY_COLUMN[key];
  return db.$queryRaw<Array<PriceRow & { n: number }>>(Prisma.sql`
    SELECT ${col} AS "key", "unitPrice", "vat", SUM("salesCount")::int AS n
    FROM "SalesPriceAgg"
    WHERE ${aggConditions(tenantId, key, values, filter)}
    GROUP BY ${col}, "unitPrice", "vat"
    ORDER BY ${col}, n DESC
  `);
}

/**
 * Dernier prix non nul par produit, filtré par event : SalesPriceAgg n'a pas de dimension
 * event, d'où la lecture des transactions. Le filtre tenant sur `t` engage l'index
 * (tenantId, locationId, transactionDate) (BUG-332-02 : sans lui, seq scan de toute la table).
 */
export function latestPricesForEvents(
  db: SqlClient,
  tenantId: string,
  productIds: string[],
  filter: { locationIds?: string[]; eventIds: string[] },
): Promise<Array<{ productId: string; unitPrice: unknown; vat: unknown }>> {
  const conds: Prisma.Sql[] = [
    Prisma.sql`t."tenantId" = ${tenantId}`,
    Prisma.sql`ti."productId" IN (${Prisma.join(productIds)})`,
    Prisma.sql`ti."unitPrice" > 0`,
    Prisma.sql`t."eventId" IN (${Prisma.join(filter.eventIds)})`,
  ];
  if (filter.locationIds && filter.locationIds.length > 0) {
    conds.push(Prisma.sql`t."locationId" IN (${Prisma.join(filter.locationIds)})`);
  }
  return db.$queryRaw(Prisma.sql`
    SELECT DISTINCT ON (ti."productId") ti."productId", ti."unitPrice", ti."vat"
    FROM "WeezeventTransactionItem" ti
    JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
    WHERE ${Prisma.join(conds, ' AND ')}
    ORDER BY ti."productId", t."transactionDate" DESC
  `);
}

export interface ProductSalesTotals {
  productId: string;
  qty: number;
  gross_ttc: number;
  gross_ht: number;
  reduction_ttc: number;
  net_ht: number;
}

/**
 * Totaux de ventes réelles par produit. `integrationId`, `fromDate` et `toDate` engagent
 * l'index [tenantId, integrationId, transactionDate] (~12 s sans, quelques ms avec).
 */
export function salesTotalsByProduct(
  db: SqlClient,
  tenantId: string,
  productIds: string[],
  filter: { integrationId?: string; fromDate?: Date; toDate?: Date } = {},
): Promise<ProductSalesTotals[]> {
  const conds: Prisma.Sql[] = [
    Prisma.sql`t."tenantId" = ${tenantId}`,
    Prisma.sql`ti."productId" IN (${Prisma.join(productIds)})`,
  ];
  if (filter.integrationId) conds.push(Prisma.sql`t."integrationId" = ${filter.integrationId}`);
  if (filter.fromDate) conds.push(Prisma.sql`t."transactionDate" >= ${filter.fromDate}`);
  if (filter.toDate) conds.push(Prisma.sql`t."transactionDate" <= ${filter.toDate}`);
  return db.$queryRaw<ProductSalesTotals[]>(Prisma.sql`
    SELECT ti."productId" AS "productId",
      SUM(ti."quantity")::float8                                              AS qty,
      SUM(ti."unitPrice" * ti."quantity")::float8                             AS gross_ttc,
      SUM(ti."unitPrice" * ti."quantity" / (1 + ti."vat" / 100.0))::float8    AS gross_ht,
      SUM(ti."reduction")::float8                                             AS reduction_ttc,
      SUM((ti."unitPrice" * ti."quantity" - ti."reduction")
          / (1 + ti."vat" / 100.0))::float8                                   AS net_ht
    FROM "WeezeventTransactionItem" ti
    JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
    WHERE ${Prisma.join(conds, ' AND ')}
    GROUP BY ti."productId"
  `);
}
