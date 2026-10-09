import { Prisma } from '@prisma/client';
import { SqlClient } from '../../core/database/sql-client';

export interface TenantIntegrityCounters {
  danglingShopElement: number;
  danglingShopLocation: number;
  mappingsToDeletedMenuItem: number;
  spaceLinksToDeletedMenuItem: number;
  duplicateProductGroups: number;
  duplicateLocationGroups: number;
}

/** Compteurs d'intégrité Data Integration d'un tenant (mappings cassés, doublons). */
export async function tenantIntegrityCounters(db: SqlClient, tenantId: string): Promise<TenantIntegrityCounters> {
  const count = async (q: Promise<Array<{ n: bigint }>>) => Number((await q)[0]?.n ?? 0);
  const [danglingShopElement, danglingShopLocation, mappingsToDeletedMenuItem, spaceLinksToDeletedMenuItem, duplicateProductGroups, duplicateLocationGroups] = await Promise.all([
    count(db.$queryRaw`
      SELECT count(*)::bigint AS n FROM "WeezeventLocationShopMapping" m
      LEFT JOIN "SpaceElement" se ON se.id = m."spaceElementId"
      WHERE m."tenantId" = ${tenantId} AND se.id IS NULL`),
    count(db.$queryRaw`
      SELECT count(*)::bigint AS n FROM "WeezeventLocationShopMapping" m
      LEFT JOIN "WeezeventLocation" l ON l.id = m."weezeventLocationId"
      WHERE m."tenantId" = ${tenantId} AND l.id IS NULL`),
    count(db.$queryRaw`
      SELECT count(*)::bigint AS n FROM "WeezeventProductMapping" m
      JOIN "MenuItem" mi ON mi.id = m."menuItemId"
      WHERE m."tenantId" = ${tenantId} AND mi."deletedAt" IS NOT NULL`),
    count(db.$queryRaw`
      SELECT count(*)::bigint AS n FROM "SpaceMenuItem" sm
      JOIN "MenuItem" mi ON mi.id = sm."menuItemId"
      WHERE mi."tenantId" = ${tenantId} AND mi."deletedAt" IS NOT NULL`),
    count(db.$queryRaw`
      SELECT count(*)::bigint AS n FROM (
        SELECT 1 FROM "WeezeventProduct" WHERE "tenantId" = ${tenantId}
        GROUP BY "weezeventId" HAVING count(*) > 1) d`),
    count(db.$queryRaw`
      SELECT count(*)::bigint AS n FROM (
        SELECT 1 FROM "WeezeventLocation" WHERE "tenantId" = ${tenantId}
        GROUP BY "weezeventId" HAVING count(*) > 1) d`),
  ]);
  return { danglingShopElement, danglingShopLocation, mappingsToDeletedMenuItem, spaceLinksToDeletedMenuItem, duplicateProductGroups, duplicateLocationGroups };
}
/** Lignes de vente sans produit, avec l'intégration de la transaction et l'item_id Weezevent. */
export function orphanTransactionItems(db: SqlClient, tenantId: string, integrationId: string | undefined): Promise<Array<{ id: string; integrationId: string | null; itemWid: string | null; productName: string | null }>> {
  return db.$queryRaw<Array<{ id: string; integrationId: string | null; itemWid: string | null; productName: string | null }>>(Prisma.sql`
            SELECT ti."id" AS "id", t."integrationId" AS "integrationId",
                   (ti."rawData"->>'item_id') AS "itemWid", ti."productName" AS "productName"
            FROM "WeezeventTransactionItem" ti
            JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
            WHERE ti."productId" IS NULL AND t."tenantId" = ${tenantId}
              ${integrationId ? Prisma.sql`AND t."integrationId" = ${integrationId}` : Prisma.empty}
        `);
}
