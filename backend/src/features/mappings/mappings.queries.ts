import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { SqlClient } from '../../core/database/sql-client';

/** Produits vendus sur une location Weezevent du tenant. */
export async function productIdsSoldAtLocation(db: SqlClient, tenantId: string, locationId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ productId: string }[]>`
    SELECT DISTINCT ti."productId"
    FROM "WeezeventTransactionItem" ti
    JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
    WHERE t."tenantId" = ${tenantId}
      AND t."locationId" = ${locationId}
      AND ti."productId" IS NOT NULL
  `;
  return rows.map((r) => r.productId);
}

/**
 * Filtre commun des deux modes de lecture des mappings produit (liste complète et paires).
 * Scope tenant, puis intégration (filtre la liste ET scope l'agrégat ventes), puis location
 * Weezevent (produits vendus sur cette location via les lignes de transaction).
 */
export async function buildProductMappingWhere(
  db: SqlClient,
  tenantId: string,
  opts: { integrationId?: string; locationId?: string } = {},
): Promise<Prisma.ProductMappingWhereInput> {
  const where: Prisma.ProductMappingWhereInput = { tenantId };
  if (opts.integrationId) {
    where.salesProduct = { integrationId: opts.integrationId };
  }
  if (opts.locationId) {
    where.salesProductId = { in: await productIdsSoldAtLocation(db, tenantId, opts.locationId) };
  }
  return where;
}

/**
 * Mode « paires » : un seul SELECT des deux colonnes utiles, sans relations, sans prix, sans
 * pagination ni comptage. `cap` borne la lecture ; l'appelant signale la troncature quand
 * le nombre de lignes atteint `cap`.
 */
export async function findProductMappingPairs(
  db: Pick<PrismaClient, 'productMapping'>,
  where: Prisma.ProductMappingWhereInput,
  cap: number,
): Promise<{ weezeventProductId: string; menuItemId: string }[]> {
  const rows = await db.productMapping.findMany({
    where,
    select: { salesProductId: true, menuItemId: true },
    take: cap,
  });
  return rows.map((r) => ({ weezeventProductId: r.salesProductId, menuItemId: r.menuItemId }));
}

export interface ProductMappingRow {
  weezeventProductId: string;
  menuItemId: string;
  autoMapped?: boolean;
  confidence?: number | null;
}

/**
 * Upsert en masse des mappings produit -> article. La contrainte unique porte sur le seul
 * produit : la clause `WHERE ... "tenantId" = EXCLUDED."tenantId"` empêche qu'un conflit
 * sur la ligne d'un AUTRE tenant la réécrive (la ligne est alors laissée intacte).
 * `rows` non vide, produits et articles déjà vérifiés comme appartenant au tenant.
 */
export function upsertProductMappings(
  db: SqlClient,
  tenantId: string,
  rows: ProductMappingRow[],
  mappedBy: string,
  now: Date = new Date(),
): Promise<number> {
  const values = Prisma.join(
    rows.map(
      (m) => Prisma.sql`(
        ${randomUUID()},
        ${tenantId},
        ${m.weezeventProductId},
        ${m.menuItemId},
        ${m.autoMapped || false},
        ${m.confidence || null},
        ${mappedBy},
        ${now},
        ${now}
      )`,
    ),
  );
  return db.$executeRaw`
    INSERT INTO "public"."WeezeventProductMapping"
      ("id", "tenantId", "weezeventProductId", "menuItemId", "autoMapped", "confidence", "mappedBy", "createdAt", "updatedAt")
    VALUES ${values}
    ON CONFLICT ("weezeventProductId") DO UPDATE SET
      "menuItemId" = EXCLUDED."menuItemId",
      "autoMapped" = EXCLUDED."autoMapped",
      "confidence" = EXCLUDED."confidence",
      "mappedBy" = EXCLUDED."mappedBy",
      "updatedAt" = EXCLUDED."updatedAt"
    WHERE "WeezeventProductMapping"."tenantId" = EXCLUDED."tenantId"
  `;
}
