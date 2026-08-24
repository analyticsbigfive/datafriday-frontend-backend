// src/utils/logisticElementOptions.js
// Tri des PDV/Storage candidats "Origine"/contrepartie pour un transfert Logistic :
// d'abord le même groupe (étage v1 / forecourt / externalMerch) que l'élément
// courant, puis par quantité restante décroissante — mockups "Initiation d'un
// transfert Live inventory" (08/2026). Partagé entre LogisticMovementDialog
// (transfert manuel existant, rétrofit) et RestockerDrawer.

/** Quantité totale en unité réelle si le pack size est connu, sinon juste les packs. */
function totalOf(el, unitsPerPack) {
  const upp = Number(unitsPerPack) > 0 ? Number(unitsPerPack) : null
  const packed = Number(el.packed) || 0
  const loose = Number(el.loose) || 0
  return upp ? packed * upp + loose : packed
}

/**
 * @param {Array<{id, name, packed, loose, floorGroupId?}>} elements candidats
 * @param {{floorGroupId?: string|null}} currentElement élément dont on ouvre le drawer/dialog
 * @param {number|string|null} unitsPerPack pack size de la denrée, si connu
 */
export function sortElementsByFloorAndQuantity(elements, currentElement, unitsPerPack) {
  const currentGroupId = currentElement?.floorGroupId ?? null
  return [...elements].sort((a, b) => {
    const aSame = (a.floorGroupId ?? null) === currentGroupId ? 0 : 1
    const bSame = (b.floorGroupId ?? null) === currentGroupId ? 0 : 1
    if (aSame !== bSame) return aSame - bSame
    return totalOf(b, unitsPerPack) - totalOf(a, unitsPerPack)
  })
}
