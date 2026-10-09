import { Prisma } from '@prisma/client';
import { SqlClient } from '../../core/database/sql-client';

/**
 * Étendue observée (première et dernière vente) de chaque event du tenant. Index couvrant
 * WeezeventTransaction(tenantId, eventId, transactionDate, deletedAt) : index-only scan.
 */
export function observedEventSpans(
  db: SqlClient,
  tenantId: string,
): Promise<Array<{ eventId: string; minDate: Date; maxDate: Date }>> {
  return db.$queryRaw(Prisma.sql`
    SELECT t."eventId", MIN(t."transactionDate") AS "minDate", MAX(t."transactionDate") AS "maxDate"
    FROM "WeezeventTransaction" t
    WHERE t."tenantId" = ${tenantId}
      AND t."eventId" IS NOT NULL
      AND t."deletedAt" IS NULL
    GROUP BY t."eventId"
  `);
}
