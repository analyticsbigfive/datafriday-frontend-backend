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

/**
 * Saison la plus récente de chaque espace (demande Bertrand : la carte d'accueil montre la saison
 * en cours, ex. 26/27) : parmi les saisons rattachées à l'espace, la dernière commencée à `now`.
 * Un espace sans saison rattachée n'a pas de ligne ici : ses chiffres restent sur tout l'historique.
 * `spaceIds` non vide.
 */
function latestSeasonWindows(tenantId: string, spaceIds: string[]): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT ON (ss."spaceId") ss."spaceId", s."startDate", s."endDate" + INTERVAL '1 day' AS "endExclusive"
    FROM "SeasonSpace" ss
    JOIN "Season" s ON s.id = ss."seasonId"
    WHERE s."tenantId" = ${tenantId} AND ss."spaceId" IN (${Prisma.join(spaceIds)}) AND s."startDate" <= NOW()
    ORDER BY ss."spaceId", s."startDate" DESC
  `;
}

/**
 * CA HT (total, merch, F&B), transactions et events avec CA, par espace, sur la saison la plus
 * récente de l'espace. `spaceIds` non vide.
 */
export function revenueBySpace(db: SqlClient, tenantId: string, spaceIds: string[]): Promise<SpaceRevenueRow[]> {
  return db.$queryRaw<SpaceRevenueRow[]>(Prisma.sql`
    WITH win AS (${latestSeasonWindows(tenantId, spaceIds)})
    SELECT sra."spaceId",
      SUM(sra."revenueHt")::float AS "totalRevenue",
      SUM(CASE WHEN se."type" = 'merchshop' THEN sra."revenueHt" ELSE 0 END)::float AS "merchRevenue",
      SUM(CASE WHEN se."type" IS DISTINCT FROM 'merchshop' THEN sra."revenueHt" ELSE 0 END)::float AS "fbRevenue",
      SUM(sra."transactionsCount")::int AS "transactionsCount",
      COUNT(DISTINCT CASE WHEN sra."revenueHt" > 0 THEN sra."weezeventEventId" END)::int AS "eventsWithRevenue"
    FROM "SpaceRevenueMinuteAgg" sra
    LEFT JOIN "SpaceElement" se ON se.id = sra."spaceElementId"
    LEFT JOIN win w ON w."spaceId" = sra."spaceId"
    WHERE sra."tenantId" = ${tenantId} AND sra."spaceId" IN (${Prisma.join(spaceIds)})
      AND (w."spaceId" IS NULL OR (sra.minute >= w."startDate" AND sra.minute < w."endExclusive"))
    GROUP BY sra."spaceId"
  `);
}

/**
 * Billets scannés (sinon vendus) par espace, sur la saison la plus récente, des seuls events DÉJÀ
 * JOUÉS : même définition que la page Analyse (référence du per cap), sans les matchs à venir dont
 * les billets ne sont que prévus. Règle Bertrand : un event sans vente (CA 0 et 0 transaction dans le
 * rollup Event) n'a pas eu lieu, il est exclu. `spaceIds` non vide.
 */
export function ticketsBySpace(db: SqlClient, tenantId: string, spaceIds: string[]): Promise<Array<{ spaceId: string; ticketsCount: number }>> {
  return db.$queryRaw(Prisma.sql`
    WITH win AS (${latestSeasonWindows(tenantId, spaceIds)})
    SELECT e."spaceId", SUM(COALESCE(e."ticketsScanned", e."ticketsSold", 0))::int AS "ticketsCount"
    FROM "Event" e
    LEFT JOIN win w ON w."spaceId" = e."spaceId"
    WHERE e."tenantId" = ${tenantId} AND e."spaceId" IN (${Prisma.join(spaceIds)})
      AND e."eventDate" <= NOW()
      AND (COALESCE(e."revenue", 0) > 0 OR COALESCE(e."transactionCount", 0) > 0)
      AND (w."spaceId" IS NULL OR (e."eventDate" >= w."startDate" AND e."eventDate" < w."endExclusive"))
    GROUP BY e."spaceId"
  `);
}
