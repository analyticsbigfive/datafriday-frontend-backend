import { Prisma } from '@prisma/client';
import { SqlClient } from '../../core/database/sql-client';

/** Volume et chiffre d'affaires par jour d'une intégration (index tenantId + integrationId). */
export function dailyTransactionTotals(
  db: SqlClient,
  tenantId: string,
  integrationId: string,
): Promise<Array<{ date: Date | string; transactionCount: number; revenue: number }>> {
  return db.$queryRaw(Prisma.sql`
    SELECT DATE(t."transactionDate") AS "date",
           COUNT(*)::int AS "transactionCount",
           SUM(t."amount")::float AS "revenue"
    FROM "WeezeventTransaction" t
    WHERE t."tenantId" = ${tenantId} AND t."integrationId" = ${integrationId}
    GROUP BY DATE(t."transactionDate")
    ORDER BY DATE(t."transactionDate") DESC
  `);
}

/** PdV de l'intégration qui ont des ventes mais aucun rattachement à un élément d'espace. */
export function unmappedLocationsWithSales(db: SqlClient, tenantId: string, integrationId: string): Promise<Array<{ id: string }>> {
  return db.$queryRaw(Prisma.sql`
    SELECT l."id"
    FROM "WeezeventLocation" l
    WHERE l."tenantId" = ${tenantId} AND l."integrationId" = ${integrationId}
      AND NOT EXISTS (
        SELECT 1 FROM "WeezeventLocationShopMapping" m
        WHERE m."tenantId" = l."tenantId" AND m."weezeventLocationId" = l."id"
      )
      AND EXISTS (
        SELECT 1 FROM "WeezeventTransaction" t
        WHERE t."tenantId" = l."tenantId" AND t."locationId" = l."id" AND t."integrationId" = l."integrationId"
      )
  `);
}
