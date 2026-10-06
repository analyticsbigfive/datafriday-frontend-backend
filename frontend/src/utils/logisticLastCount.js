/**
 * Le dernier comptage physique (Pre/Post event Inventory) dit-il la même chose que le stock
 * Logistic affiché ? Si oui, la ligne « Dernier comptage physique » de la carte n'apporte rien
 * (cas normal juste après « Mettre à jour la Logistique ») et elle est masquée : elle ne sert
 * qu'à signaler un écart (demande Ulrich 2026-10-06).
 *
 * Même quantité = mêmes paquets et même vrac, ou, taille de paquet connue, même total en unités
 * (36 en vrac = 1 pack de 24 + 12 en vrac).
 *
 * @param {{ packedUnits?: number, looseUnits?: number }|null} lastCount
 * @param {{ packed?: number, loose?: number }|null} expected
 * @param {number|string|null} unitsPerPack
 * @returns {boolean}
 */
export function lastCountMatchesStock(lastCount, expected, unitsPerPack) {
  if (!lastCount || !expected) return false
  const near = (a, b) => Math.abs(a - b) < 0.005
  const countedPacked = Number(lastCount.packedUnits) || 0
  const countedLoose = Number(lastCount.looseUnits) || 0
  const stockPacked = Number(expected.packed) || 0
  const stockLoose = Number(expected.loose) || 0
  if (countedPacked === stockPacked && near(countedLoose, stockLoose)) return true
  const upp = Number(unitsPerPack)
  if (!upp) return false
  return near(countedPacked * upp + countedLoose, stockPacked * upp + stockLoose)
}
