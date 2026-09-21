import { Prisma } from '@prisma/client';

/**
 * Ligne d'item telle qu'écrite (ou supprimée) en base, source d'un delta SalesPriceAgg.
 * Les champs miroir exactement ce que lit le recalcul complet SQL (refreshForIntegration) :
 * la clé itemWeezeventId est dérivée de rawData.item_id ici comme là-bas, pour que delta et
 * recalcul produisent les mêmes lignes.
 */
export interface SalesPriceAggDeltaSource {
  locationId: string | null;
  productId: string | null;
  productName: string | null;
  rawData: unknown;
  unitPrice: Prisma.Decimal | number | string;
  vat: Prisma.Decimal | number | string;
  transactionDate: Date;
}

/** Une ligne à appliquer en upsert : +delta sur salesCount, lastSoldAt = max des ventes ajoutées. */
export interface SalesPriceAggDeltaRow {
  locationId: string;
  productId: string;
  itemWeezeventId: string;
  productNameNorm: string;
  unitPrice: string;
  vat: string;
  delta: number;
  lastSoldAt: Date;
}

function toFixed2(value: Prisma.Decimal | number | string): string {
  return new Prisma.Decimal(value).toFixed(2);
}

function itemWeezeventIdOf(rawData: unknown): string {
  const itemId = (rawData as { item_id?: unknown } | null)?.item_id;
  return itemId != null ? String(itemId) : '';
}

/** Même clé que @@unique de SalesPriceAgg (tenantId exclu, fixé par l'appelant). */
function keyOf(row: Omit<SalesPriceAggDeltaRow, 'delta' | 'lastSoldAt'>): string {
  return [row.locationId, row.productId, row.itemWeezeventId, row.productNameNorm, row.unitPrice, row.vat].join('|');
}

function normalize(source: SalesPriceAggDeltaSource): Omit<SalesPriceAggDeltaRow, 'delta' | 'lastSoldAt'> | null {
  if (!source.locationId) return null;
  const unitPrice = toFixed2(source.unitPrice);
  if (Number(unitPrice) <= 0) return null;
  return {
    locationId: source.locationId,
    productId: source.productId ?? '',
    itemWeezeventId: itemWeezeventIdOf(source.rawData),
    productNameNorm: source.productName ? source.productName.trim().toLowerCase() : '',
    unitPrice,
    vat: toFixed2(source.vat),
  };
}

/**
 * Regroupe les items ajoutés (+1 chacun) et supprimés (-1 chacun) par clé SalesPriceAgg.
 * Filtre unitPrice > 0 et locationId non null, comme le recalcul SQL. Une clé dont le delta
 * est nul sans ajout est omise (rien à écrire). Sortie triée par clé : deux upserts concurrents
 * (webhooks parallèles) verrouillent les lignes dans le même ordre, pas de deadlock.
 */
export function buildSalesPriceAggDeltas(
  added: SalesPriceAggDeltaSource[],
  removed: SalesPriceAggDeltaSource[] = [],
): SalesPriceAggDeltaRow[] {
  const rows = new Map<string, SalesPriceAggDeltaRow & { addedCount: number }>();

  const touch = (source: SalesPriceAggDeltaSource, sign: 1 | -1) => {
    const base = normalize(source);
    if (!base) return;
    const key = keyOf(base);
    const existing = rows.get(key);
    if (existing) {
      existing.delta += sign;
      if (sign === 1) {
        existing.addedCount += 1;
        if (source.transactionDate > existing.lastSoldAt) existing.lastSoldAt = source.transactionDate;
      }
      return;
    }
    rows.set(key, { ...base, delta: sign, lastSoldAt: source.transactionDate, addedCount: sign === 1 ? 1 : 0 });
  };

  for (const source of added) touch(source, 1);
  for (const source of removed) touch(source, -1);

  return [...rows.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, row]) => row)
    .filter((row) => row.delta !== 0 || row.addedCount > 0)
    .map((row) => ({
      locationId: row.locationId,
      productId: row.productId,
      itemWeezeventId: row.itemWeezeventId,
      productNameNorm: row.productNameNorm,
      unitPrice: row.unitPrice,
      vat: row.vat,
      delta: row.delta,
      lastSoldAt: row.lastSoldAt,
    }));
}
