import { SqlClient } from '../../../core/database/sql-client';

/** Events DataFriday non liés à un event Weezevent, à une date calendaire donnée. */
export function unlinkedEventIdsOnDate(db: SqlClient, tenantId: string, date: Date): Promise<{ id: string }[]> {
  return db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Event"
    WHERE "tenantId" = ${tenantId}
      AND "weezeventEventId" IS NULL
      AND DATE("eventDate") = DATE(${date})
  `;
}

/** Events Weezevent qui commencent à une date calendaire donnée. */
export function weezeventEventIdsOnDate(db: SqlClient, tenantId: string, date: Date): Promise<{ id: string }[]> {
  return db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "WeezeventEvent"
    WHERE "tenantId" = ${tenantId}
      AND "startDate" IS NOT NULL
      AND DATE("startDate") = DATE(${date})
  `;
}
