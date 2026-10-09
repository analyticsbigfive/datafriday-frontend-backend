import { SqlClient } from '../../../core/database/sql-client';

/** CA HT par jour (UTC) d'un espace, depuis SpaceRevenueMinuteAgg. */
export function dailySpaceRevenue(
  db: SqlClient,
  tenantId: string,
  spaceId: string,
  from: Date,
  to: Date,
): Promise<Array<{ day: string; revenue: unknown }>> {
  return db.$queryRaw`
    SELECT
      DATE_TRUNC('day', minute AT TIME ZONE 'UTC')::date::text as day,
      SUM("revenueHt") as revenue
    FROM "SpaceRevenueMinuteAgg"
    WHERE "tenantId" = ${tenantId}
      AND "spaceId" = ${spaceId}
      AND minute >= ${from}
      AND minute <= ${to}
    GROUP BY 1
    ORDER BY 1
  `;
}

/** CA HT par jour (UTC) et par élément (PdV) d'un espace. */
export function dailySpaceRevenueByElement(
  db: SqlClient,
  tenantId: string,
  spaceId: string,
  from: Date,
  to: Date,
): Promise<Array<{ day: string; spaceElementId: string | null; revenue: unknown }>> {
  return db.$queryRaw`
    SELECT
      DATE_TRUNC('day', minute AT TIME ZONE 'UTC')::date::text as day,
      "spaceElementId",
      SUM("revenueHt") as revenue
    FROM "SpaceRevenueMinuteAgg"
    WHERE "tenantId" = ${tenantId}
      AND "spaceId" = ${spaceId}
      AND minute >= ${from}
      AND minute <= ${to}
      AND "spaceElementId" IS NOT NULL
    GROUP BY 1, 2
    ORDER BY 1
  `;
}
