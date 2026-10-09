import { Prisma } from '@prisma/client';
import { SqlClient } from '../../../core/database/sql-client';

export interface SpaceRevenueRow {
  spaceId: string;
  totalRevenue: number;
  merchRevenue: number;
  fbRevenue: number;
  transactionsCount: number;
  eventsWithRevenue: number;
}

/** CA HT (total, merch, F&B), transactions et events avec CA, par espace. `spaceIds` non vide. */
export function revenueBySpace(db: SqlClient, tenantId: string, spaceIds: string[]): Promise<SpaceRevenueRow[]> {
  return db.$queryRaw<SpaceRevenueRow[]>(Prisma.sql`
    SELECT sra."spaceId",
      SUM(sra."revenueHt")::float AS "totalRevenue",
      SUM(CASE WHEN se."type" = 'merchshop' THEN sra."revenueHt" ELSE 0 END)::float AS "merchRevenue",
      SUM(CASE WHEN se."type" IS DISTINCT FROM 'merchshop' THEN sra."revenueHt" ELSE 0 END)::float AS "fbRevenue",
      SUM(sra."transactionsCount")::int AS "transactionsCount",
      COUNT(DISTINCT CASE WHEN sra."revenueHt" > 0 THEN sra."weezeventEventId" END)::int AS "eventsWithRevenue"
    FROM "SpaceRevenueMinuteAgg" sra
    LEFT JOIN "SpaceElement" se ON se.id = sra."spaceElementId"
    WHERE sra."tenantId" = ${tenantId} AND sra."spaceId" IN (${Prisma.join(spaceIds)})
    GROUP BY sra."spaceId"
  `);
}

/** Billets scannés (sinon vendus) par espace. `spaceIds` non vide. */
export function ticketsBySpace(db: SqlClient, tenantId: string, spaceIds: string[]): Promise<Array<{ spaceId: string; ticketsCount: number }>> {
  return db.$queryRaw(Prisma.sql`
    SELECT "spaceId", SUM(COALESCE("ticketsScanned", "ticketsSold", 0))::int AS "ticketsCount"
    FROM "Event"
    WHERE "tenantId" = ${tenantId} AND "spaceId" IN (${Prisma.join(spaceIds)})
    GROUP BY "spaceId"
  `);
}
