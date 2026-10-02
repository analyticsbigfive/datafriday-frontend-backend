import { Prisma } from '@prisma/client';
import { SqlClient } from '../../core/database/sql-client';
import type { SalesRawRow } from './logistics.types';

/** Ventes agrégées par PdV et article depuis `since` (filtre déjà construit). `elementIds` non vide. */
export function salesByElementSince(db: SqlClient, tenantId: string, elementIds: string[], sinceFilter: Prisma.Sql): Promise<SalesRawRow[]> {
  return db.$queryRaw<SalesRawRow[]>(Prisma.sql`
      SELECT m."spaceElementId"          AS "elementId",
             pm."menuItemId"             AS "menuItemId",
             t."eventId"                 AS "eventId",
             MAX(t."eventName")          AS "eventName",
             SUM(ti."quantity")::float   AS "qty",
             MAX(t."transactionDate")    AS "lastAt"
      FROM "WeezeventTransactionItem" ti
      JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
      JOIN "WeezeventLocation" wl ON wl."id" = t."locationId"
      JOIN "WeezeventLocationShopMapping" m
        ON m."tenantId" = t."tenantId"
        AND (m."weezeventLocationId" = wl."id" OR m."weezeventLocationId" = wl."weezeventId")
      JOIN "WeezeventProductMapping" pm
        ON pm."tenantId" = t."tenantId" AND pm."weezeventProductId" = ti."productId"
      WHERE t."tenantId" = ${tenantId}
        AND t."status" = 'V'
        AND t."deletedAt" IS NULL
        AND m."spaceElementId" IN (${Prisma.join(elementIds)})
        ${sinceFilter}
      GROUP BY 1, 2, 3
    `);
}

/** Ventes d'un event par PdV et article (consommation post-event), fenêtre et périmètre déjà résolus. */
export function eventSalesByElement(db: SqlClient, tenantId: string, windowStart: Date, windowEnd: Date, integrationClause: Prisma.Sql, shopScopeClause: Prisma.Sql, untilClause: Prisma.Sql = Prisma.empty, sinceClause: Prisma.Sql = Prisma.empty): Promise<Array<{
        elementId: string | null;
        menuItemId: string | null;
        locationName: string | null;
        productName: string | null;
        qty: number;
      }>> {
  return db.$queryRaw<Array<{
        elementId: string | null;
        menuItemId: string | null;
        locationName: string | null;
        productName: string | null;
        qty: number;
      }>>(Prisma.sql`
      SELECT mem."spaceElementId"                                   AS "elementId",
             pm."menuItemId"                                        AS "menuItemId",
             COALESCE(MAX(t."locationName"), MAX(t."locationId"))   AS "locationName",
             MAX(ti."productName")                                  AS "productName",
             SUM(ti."quantity")::float                              AS qty
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t.id
      LEFT JOIN "WeezeventLocation" wl ON wl."id" = t."locationId"
      LEFT JOIN "WeezeventLocationShopMapping" mem
        ON mem."tenantId" = t."tenantId"
       AND (mem."weezeventLocationId" = t."locationId" OR mem."weezeventLocationId" = wl."weezeventId")
      LEFT JOIN "WeezeventProductMapping" pm
        ON pm."tenantId" = t."tenantId" AND pm."weezeventProductId" = ti."productId"
      WHERE t."tenantId" = ${tenantId}
        AND t."transactionDate" >= ${windowStart}
        AND t."transactionDate" <  ${windowEnd}
        AND t."status" = 'V'
        AND t."deletedAt" IS NULL
        ${integrationClause}
        AND ${shopScopeClause}
        ${untilClause}
        ${sinceClause}
      GROUP BY 1, 2, ti."productId"
    `);
}

export interface CarriedStockLevel {
  levelId: string;
  packed: number;
  loose: number;
  itemKind: string | null;
  itemRefId: string | null;
}

/** Report en masse de niveaux de stock (une requête). `rows` non vide. */
export function carryStockLevels(db: SqlClient, tenantId: string, rows: CarriedStockLevel[]): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    UPDATE "StockLevel" AS sl
    SET "packedUnits" = v.packed, "looseUnits" = v.loose,
        "itemKind" = COALESCE(v.kind, sl."itemKind"), "itemRefId" = COALESCE(v.refId, sl."itemRefId"),
        "updatedAt" = NOW()
    FROM (VALUES ${Prisma.join(
      rows.map((r) => Prisma.sql`(${r.levelId}, ${Math.trunc(r.packed)}::int, ${r.loose}::float8, ${r.itemKind}::text, ${r.itemRefId}::text)`),
    )}) AS v(id, packed, loose, kind, refId)
    WHERE sl.id = v.id AND sl."tenantId" = ${tenantId}
  `);
}

export interface CountedStockLevel extends CarriedStockLevel {
  unitsPerPack: number | null;
  itemKey: string;
}

/**
 * Remplace en masse des niveaux par les valeurs comptées. `unitsPerPack` n'est touché que
 * s'il est fourni ; le nom est toujours réaligné sur le nom courant. `rows` non vide.
 */
export function setCountedStockLevels(db: SqlClient, tenantId: string, rows: CountedStockLevel[]): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    UPDATE "StockLevel" AS sl
    SET "packedUnits" = v.packed,
        "looseUnits" = v.loose,
        "unitsPerPack" = COALESCE(v.upp, sl."unitsPerPack"),
        "itemKind" = COALESCE(v.kind, sl."itemKind"),
        "itemRefId" = COALESCE(v.refId, sl."itemRefId"),
        "itemKey" = v.key,
        "updatedAt" = NOW()
    FROM (VALUES ${Prisma.join(
      rows.map(
        (r) =>
          Prisma.sql`(${r.levelId}, ${Math.trunc(r.packed)}::int, ${r.loose}::float8, ${r.unitsPerPack ?? null}::float8, ${r.itemKind}::text, ${r.itemRefId}::text, ${r.itemKey}::text)`,
      ),
    )}) AS v(id, packed, loose, upp, kind, refId, key)
    WHERE sl.id = v.id AND sl."tenantId" = ${tenantId}
  `);
}
