export type MarketPricePackFields = {
  packedUnits?: number | null;
  unitsPerPurchase?: number | null;
  inventoryPackaging?: string | null;
  purchasePackaging?: string | null;
};

const normalizePackaging = (v: string | null | undefined): string =>
  String(v ?? '').replace(/\s+/g, '').toLowerCase();

/**
 * Contenance d'un Market Price (unités de base par colis), lue a un seul endroit.
 * 1. packedUnits > 1 : valeur saisie pour le stockage.
 * 2. Sinon, stockage et achat de meme type (sans casse ni espaces) et unitsPerPurchase > 1 :
 *    le colis stocke est le colis achete, on prend unitsPerPurchase.
 * 3. Sinon packedUnits > 0 (donc 1).
 * 4. Sinon null (contenance inconnue).
 */
export function marketPricePackSize(mp: MarketPricePackFields | null | undefined): number | null {
  if (!mp) return null;
  const packed = Number(mp.packedUnits);
  if (Number.isFinite(packed) && packed > 1) return packed;
  const inv = normalizePackaging(mp.inventoryPackaging);
  const purchase = normalizePackaging(mp.purchasePackaging);
  const perPurchase = Number(mp.unitsPerPurchase);
  if (inv && inv === purchase && Number.isFinite(perPurchase) && perPurchase > 1) return perPurchase;
  if (Number.isFinite(packed) && packed > 0) return packed;
  return null;
}
