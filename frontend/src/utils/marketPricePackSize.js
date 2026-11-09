/**
 * Contenance d'un Market Price (unités de base par colis), lue à UN SEUL endroit.
 *
 * Le formulaire Market Price porte deux phrases :
 *  - achat : « X est acheté en [purchasePackaging] de [unitsPerPurchase] [unit] pour [price] »
 *  - stockage : « X est stocké en [inventoryPackaging] de [packedUnits] [unit] ».
 * Beaucoup de fiches n'ont la contenance que dans l'achat, `packedUnits` restant vide, 0 ou 1
 * (valeur par défaut de certains imports).
 *
 * Ordre :
 *  1. inventoryQuantityPackaged > 0 (valeur déjà calculée)
 *  2. packedUnits > 1
 *  3. même colis physique achat et stockage (types identiques sans casse ni espaces) et
 *     unitsPerPurchase > 1 : unitsPerPurchase
 *  4. packedUnits > 0 (donc 1)
 *  5. null (contenance inconnue)
 *
 * @param {object|null|undefined} mp
 * @returns {number|null} nombre > 0, ou null
 */
function normType(value) {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase()
}

export function marketPricePackSize(mp) {
  const qty = Number(mp?.inventoryQuantityPackaged)
  if (qty > 0) return qty
  const packed = Number(mp?.packedUnits)
  if (packed > 1) return packed
  const inv = normType(mp?.inventoryPackaging)
  const purchase = normType(mp?.purchasePackaging)
  const perPurchase = Number(mp?.unitsPerPurchase)
  if (inv && purchase && inv === purchase && perPurchase > 1) return perPurchase
  if (packed > 0) return packed
  return null
}

/**
 * Alerte « contenance à renseigner » : le Market Price porte un type de conditionnement (Carton,
 * Fût...) mais aucune contenance n'est connue, ni dans le stockage ni dans l'achat. L'écran affiche
 * alors le type sans pouvoir convertir en unités : la fiche est à compléter. Un produit sans type
 * n'est jamais en alerte (il se compte en unités, ce qui est correct).
 *
 * @param {object|null|undefined} mp
 * @returns {boolean}
 */
export function packSizeMissing(mp) {
  return !!mp && normType(mp.inventoryPackaging) !== '' && marketPricePackSize(mp) == null
}
