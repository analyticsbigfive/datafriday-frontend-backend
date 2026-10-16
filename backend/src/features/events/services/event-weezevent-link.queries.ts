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

/**
 * SalesEvent qui commencent à une date calendaire donnée, candidats à l'auto-lien.
 * ADR_MULTI_SOURCE 4.1 : un SalesEvent déclaré comme source non `auto` d'un évènement (caisse
 * Data Friday, source manuelle) n'est jamais candidat, sinon un jour avec un SalesEvent Weezevent
 * ET un SalesEvent de source ferait `candidats !== 1` (plus d'auto-lien) ou lierait l'évènement à
 * la mauvaise source. Règle générique : aucun test sur le logiciel de caisse.
 */
export function weezeventEventIdsOnDate(db: SqlClient, tenantId: string, date: Date): Promise<{ id: string }[]> {
  return db.$queryRaw<{ id: string }[]>`
    SELECT we.id FROM "WeezeventEvent" we
    WHERE we."tenantId" = ${tenantId}
      AND we."startDate" IS NOT NULL
      AND DATE(we."startDate") = DATE(${date})
      AND NOT EXISTS (
        SELECT 1 FROM "EventSalesSource" s
        WHERE s."salesEventId" = we.id AND s."active" = true AND s."origin" <> 'auto'
      )
  `;
}
