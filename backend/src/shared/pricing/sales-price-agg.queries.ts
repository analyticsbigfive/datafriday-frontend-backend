import { Prisma } from '@prisma/client';
import { SqlClient } from '../../core/database/sql-client';
import { SalesPriceAggDeltaRow } from './sales-price-agg-delta';

/** Écritures de SalesPriceAgg (BUG-337-02). `tenantId` toujours appliqué. */

function deltaValues(tenantId: string, integrationId: string, r: SalesPriceAggDeltaRow): Prisma.Sql {
  return Prisma.sql`(gen_random_uuid(), ${tenantId}, ${integrationId}, ${r.locationId}, ${r.productId}, ${r.itemWeezeventId}, ${r.productNameNorm}, ${r.unitPrice}::numeric, ${r.vat}::numeric, ${r.delta}::int, ${r.lastSoldAt}::timestamp, NOW(), NOW())`;
}

/** +n / -n sur salesCount par clé, en un seul INSERT ... ON CONFLICT. `rows` non vide. */
export function upsertPriceAggDeltas(
  db: SqlClient,
  tenantId: string,
  integrationId: string,
  rows: SalesPriceAggDeltaRow[],
): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    INSERT INTO "SalesPriceAgg"
      ("id","tenantId","integrationId","locationId","productId","itemWeezeventId","productNameNorm","unitPrice","vat","salesCount","lastSoldAt","createdAt","updatedAt")
    VALUES ${Prisma.join(rows.map((r) => deltaValues(tenantId, integrationId, r)))}
    ON CONFLICT ("tenantId","locationId","productId","itemWeezeventId","productNameNorm","unitPrice","vat")
    DO UPDATE SET
      "salesCount" = "SalesPriceAgg"."salesCount" + EXCLUDED."salesCount",
      "lastSoldAt" = GREATEST("SalesPriceAgg"."lastSoldAt", EXCLUDED."lastSoldAt"),
      "updatedAt" = NOW()
  `);
}

/** Purge des clés tombées à 0 ou moins sur ces locations. `locationIds` non vide. */
export function purgeEmptyPriceAgg(db: SqlClient, tenantId: string, locationIds: string[]): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    DELETE FROM "SalesPriceAgg"
    WHERE "tenantId" = ${tenantId} AND "locationId" IN (${Prisma.join(locationIds)}) AND "salesCount" <= 0
  `);
}

export function deletePriceAggForIntegration(db: SqlClient, tenantId: string, integrationId: string): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    DELETE FROM "SalesPriceAgg" WHERE "tenantId" = ${tenantId} AND "integrationId" = ${integrationId}
  `);
}

/**
 * Recalcul complet d'une intégration depuis tout l'historique. ON CONFLICT : un webhook peut
 * insérer une clé via le delta pendant le recalcul ; GREATEST garde le compteur le plus complet.
 */
export function rebuildPriceAggForIntegration(db: SqlClient, tenantId: string, integrationId: string): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    INSERT INTO "SalesPriceAgg"
      ("id","tenantId","integrationId","locationId","productId","itemWeezeventId","productNameNorm","unitPrice","vat","salesCount","lastSoldAt","createdAt","updatedAt")
    SELECT
      gen_random_uuid(), ${tenantId}, ${integrationId}, t."locationId",
      COALESCE(ti."productId", ''), COALESCE(ti."rawData"->>'item_id', ''), COALESCE(LOWER(TRIM(ti."productName")), ''),
      ti."unitPrice", ti."vat", COUNT(*)::int, MAX(t."transactionDate"), NOW(), NOW()
    FROM "WeezeventTransactionItem" ti
    JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
    WHERE t."tenantId" = ${tenantId} AND t."integrationId" = ${integrationId}
      AND ti."unitPrice" > 0 AND t."locationId" IS NOT NULL
    GROUP BY t."locationId", COALESCE(ti."productId",''), COALESCE(ti."rawData"->>'item_id',''), COALESCE(LOWER(TRIM(ti."productName")),''), ti."unitPrice", ti."vat"
    ON CONFLICT ("tenantId","locationId","productId","itemWeezeventId","productNameNorm","unitPrice","vat")
    DO UPDATE SET
      "salesCount" = GREATEST("SalesPriceAgg"."salesCount", EXCLUDED."salesCount"),
      "lastSoldAt" = GREATEST("SalesPriceAgg"."lastSoldAt", EXCLUDED."lastSoldAt"),
      "updatedAt" = NOW()
  `);
}
