import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

export interface DistinctMerchantScope {
  tenantId: string;
  /** Restreint aux ventes de ce PdV (SalesLocation.id). */
  locationId?: string;
  /** Restreint à une ou plusieurs intégrations. */
  integrationIds?: string[];
}

export interface MerchantIntegrationRow {
  merchantId: string;
  integrationId: string;
}

/**
 * Couples (merchantId, integrationId) distincts vus dans les transactions du périmètre, en SQL.
 *
 * Remplace le motif `salesTransaction.findMany({ distinct: ['merchantId'] })` : le `distinct`
 * de Prisma n'est pas du SQL, il rapatrie TOUTES les lignes (66 000 par appel mesurées le
 * 2026-09-21, 6,4 s, 34 M de lignes cumulées) puis dédoublonne en JS. Ici Postgres renvoie
 * quelques dizaines de lignes via l'index (tenantId, locationId, ...) ou (tenantId, integrationId, ...).
 */
export async function findDistinctMerchantIntegrations(
  prisma: PrismaService,
  scope: DistinctMerchantScope,
): Promise<MerchantIntegrationRow[]> {
  if (scope.integrationIds && scope.integrationIds.length === 0) return [];

  const filters: Prisma.Sql[] = [Prisma.sql`"tenantId" = ${scope.tenantId}`, Prisma.sql`"merchantId" IS NOT NULL`];
  if (scope.locationId) filters.push(Prisma.sql`"locationId" = ${scope.locationId}`);
  if (scope.integrationIds) filters.push(Prisma.sql`"integrationId" IN (${Prisma.join(scope.integrationIds)})`);

  return prisma.$queryRaw<MerchantIntegrationRow[]>(Prisma.sql`
    SELECT DISTINCT "merchantId", "integrationId"
    FROM "WeezeventTransaction"
    WHERE ${Prisma.join(filters, ' AND ')}
  `);
}

/** Variante : seulement les merchantId distincts. */
export async function findDistinctMerchantIds(prisma: PrismaService, scope: DistinctMerchantScope): Promise<string[]> {
  const rows = await findDistinctMerchantIntegrations(prisma, scope);
  return [...new Set(rows.map((r) => r.merchantId))];
}
