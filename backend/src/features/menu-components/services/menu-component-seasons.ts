import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';

/** Include Prisma des liens saison d'un composant (parité avec MenuItem.seasonLinks). */
export const componentSeasonLinksInclude = { seasonLinks: { select: { seasonId: true } } } as const;

/**
 * Remplace `seasonLinks` (liste de liens) par `seasonIds` (liste d'ids) dans une lecture,
 * même contrat de sortie que les Menu Items.
 */
export function withSeasonIds<T extends { seasonLinks?: Array<{ seasonId: string }> | null }>(
  component: T,
): Omit<T, 'seasonLinks'> & { seasonIds: string[] } {
  const { seasonLinks, ...rest } = component;
  return { ...rest, seasonIds: (seasonLinks ?? []).map((l) => l.seasonId) };
}

/** Écriture Prisma : remplacement complet des liens (création = simple create, deleteMany vide). */
export function seasonLinksWrite(seasonIds: string[]) {
  return { deleteMany: {}, create: [...new Set(seasonIds)].map((seasonId) => ({ seasonId })) };
}

/** Vérifie que toutes les saisons appartiennent au tenant. */
export async function assertSeasonsBelongToTenant(
  prisma: PrismaService,
  seasonIds: string[] | undefined,
  tenantId: string,
): Promise<void> {
  const unique = [...new Set(seasonIds ?? [])];
  if (!unique.length) return;
  const found = await prisma.season.count({ where: { id: { in: unique }, tenantId } });
  if (found !== unique.length) {
    throw new BadRequestException('Invalid season: one or more seasons do not belong to this tenant');
  }
}
