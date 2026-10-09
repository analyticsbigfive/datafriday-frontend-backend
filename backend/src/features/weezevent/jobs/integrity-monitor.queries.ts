import { SqlClient } from '../../../core/database/sql-client';

export interface IntegrityCounters {
  danglingShopElement: number;
  danglingShopLocation: number;
  mappingsToDeletedMenuItem: number;
  duplicateProductGroups: number;
  duplicateLocationGroups: number;
}

/**
 * Compteurs de surveillance de l'intégration de données, TOUS TENANTS CONFONDUS par
 * conception (cron de monitoring global, lecture seule, aucune donnée renvoyée hors compteurs).
 */
export async function integrityCounters(db: SqlClient): Promise<IntegrityCounters> {
  const count = async (q: Promise<Array<{ n: bigint }>>) => Number((await q)[0]?.n ?? 0);
  const [danglingShopElement, danglingShopLocation, mappingsToDeletedMenuItem, duplicateProductGroups, duplicateLocationGroups] =
    await Promise.all([
      count(db.$queryRaw`
        SELECT count(*)::bigint AS n FROM "WeezeventLocationShopMapping" m
        LEFT JOIN "SpaceElement" se ON se.id = m."spaceElementId"
        WHERE se.id IS NULL`),
      count(db.$queryRaw`
        SELECT count(*)::bigint AS n FROM "WeezeventLocationShopMapping" m
        LEFT JOIN "WeezeventLocation" l ON l.id = m."weezeventLocationId"
        WHERE l.id IS NULL`),
      count(db.$queryRaw`
        SELECT count(*)::bigint AS n FROM "WeezeventProductMapping" m
        JOIN "MenuItem" mi ON mi.id = m."menuItemId"
        WHERE mi."deletedAt" IS NOT NULL`),
      count(db.$queryRaw`
        SELECT count(*)::bigint AS n FROM (
          SELECT 1 FROM "WeezeventProduct"
          GROUP BY "tenantId", "weezeventId" HAVING count(*) > 1) d`),
      count(db.$queryRaw`
        SELECT count(*)::bigint AS n FROM (
          SELECT 1 FROM "WeezeventLocation"
          GROUP BY "tenantId", "weezeventId" HAVING count(*) > 1) d`),
    ]);
  return { danglingShopElement, danglingShopLocation, mappingsToDeletedMenuItem, duplicateProductGroups, duplicateLocationGroups };
}
