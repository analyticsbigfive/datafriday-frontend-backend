import { normalizeItemName } from './storage-stored-items';

/** Sous-ensemble du client Prisma (PrismaService ou transaction) utilisé ici. */
type MarketPriceReader = {
  marketPrice: { findMany: (args: any) => Promise<Array<{ id: string; itemName: string }>> };
};

export type InventoryLinkInput = { name: string; marketPriceId?: string | null };
export type InventoryLink = { name: string; marketPriceId: string | null };

/**
 * Market Prices actifs d'un tenant indexés par nom normalisé. En cas de doublon de nom,
 * le plus ancien (createdAt, puis id) gagne, comme le backfill SQL de la migration.
 */
export async function loadMarketPricesByNormalizedName(
  client: MarketPriceReader,
  tenantId: string,
): Promise<Map<string, { id: string; itemName: string }>> {
  const mps = await client.marketPrice.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, itemName: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const out = new Map<string, { id: string; itemName: string }>();
  for (const mp of mps) {
    const k = normalizeItemName(mp.itemName);
    if (k && !out.has(k)) out.set(k, mp);
  }
  return out;
}

/**
 * Résout, en lot, le lien Market Price de lignes d'inventaire (côté serveur, sans faire
 * confiance au front) : id fourni et appartenant au tenant (son itemName devient le nom),
 * sinon nom normalisé dans le tenant, sinon null (article saisi à la main).
 * Le résultat est aligné sur l'entrée.
 */
export async function resolveInventoryLinks(
  client: MarketPriceReader,
  tenantId: string,
  rows: InventoryLinkInput[],
): Promise<InventoryLink[]> {
  if (!rows.length) return [];
  const wantedIds = [...new Set(rows.map((r) => r.marketPriceId).filter((x): x is string => !!x))];
  const byId = new Map<string, { id: string; itemName: string }>();
  if (wantedIds.length) {
    const found = await client.marketPrice.findMany({
      where: { tenantId, deletedAt: null, id: { in: wantedIds } },
      select: { id: true, itemName: true },
    });
    for (const mp of found) byId.set(mp.id, mp);
  }
  const needsName = rows.some((r) => !r.marketPriceId || !byId.has(r.marketPriceId));
  const byName = needsName ? await loadMarketPricesByNormalizedName(client, tenantId) : new Map();
  return rows.map((r) => {
    const byProvidedId = r.marketPriceId ? byId.get(r.marketPriceId) : undefined;
    if (byProvidedId) return { name: byProvidedId.itemName, marketPriceId: byProvidedId.id };
    const byNameMp = byName.get(normalizeItemName(r.name));
    return { name: r.name, marketPriceId: byNameMp ? byNameMp.id : null };
  });
}
