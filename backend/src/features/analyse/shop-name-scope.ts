import { PrismaService } from '../../core/database/prisma.service';

/** Même normalisation que normalizeStr du front (minuscules, sans accents), espaces réduits. */
export function normalizeShopName(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface ShopNameResolution {
  /** SpaceElement.id de l'espace dont le nom normalisé correspond à un nom demandé. */
  ids: string[];
  /** Noms demandés sans aucun élément correspondant dans l'espace. */
  unresolvedShopNames: string[];
}

/**
 * Résout des noms de PdV vers les SpaceElement de l'espace (même périmètre que
 * LogisticsElementScopeService.getSpaceElementIds : floor, forecourt, externalMerch, zone).
 * L'identité d'un PdV côté Analyse est son nom normalisé, pas son id de configuration.
 */
export async function resolveShopNames(
  prisma: PrismaService,
  spaceId: string,
  tenantId: string,
  shopNames: string[],
): Promise<ShopNameResolution> {
  const wanted = new Map<string, string>();
  for (const n of shopNames) {
    const key = normalizeShopName(n);
    if (key && !wanted.has(key)) wanted.set(key, n);
  }
  if (!wanted.size) return { ids: [], unresolvedShopNames: [] };
  const rows = await prisma.spaceElement.findMany({
    where: {
      OR: [
        { floor: { config: { space: { id: spaceId, tenantId } } } },
        { forecourt: { config: { space: { id: spaceId, tenantId } } } },
        { externalMerch: { config: { space: { id: spaceId, tenantId } } } },
        { zone: { space: { id: spaceId, tenantId } } },
      ],
    } as any,
    select: { id: true, name: true },
  });
  const ids: string[] = [];
  const matched = new Set<string>();
  for (const r of rows) {
    const key = normalizeShopName(r.name);
    if (wanted.has(key)) {
      ids.push(r.id);
      matched.add(key);
    }
  }
  return {
    ids,
    unresolvedShopNames: [...wanted.entries()].filter(([k]) => !matched.has(k)).map(([, original]) => original),
  };
}
