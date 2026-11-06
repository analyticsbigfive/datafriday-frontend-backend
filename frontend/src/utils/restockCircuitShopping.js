// Étape 3 (feuille de course) en mode produits finis : la quantité à acheter d'un
// article est celle du circuit de réarmement (utils/restockCircuit), la même que
// le « À commander » de l'étape 1. Le stock des réserves et les transferts entre
// PDV sont déjà dans ce chiffre : aucun second netting.
// Module pur, sans dépendance Vue/Vuex.

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Netting d'un article de la feuille de course (produits finis).
 * @param {{ itemKey:string, quantity:number, predicted?:number, shopOnHand?:number }} item
 *   `quantity` = Σ restockQuantity des PDV (déjà net du stock PDV)
 * @param {Object<string, number>} orderByItem restockCircuit.orderByItem
 * @returns {{ restockNeed:number, shopOnHand:number, predicted:number,
 *   storageOnHand:number, buyQuantity:number }}
 *   storageOnHand = part du besoin couverte sans achat (transferts PDV + réserves),
 *   de sorte que buyQuantity = restockNeed - storageOnHand (rejeu du plan figé).
 */
export function netFinishedItemWithCircuit(item, orderByItem) {
  const gross = num(item?.quantity)
  const buyQuantity = Math.max(0, num(orderByItem && orderByItem[item?.itemKey]))
  return {
    restockNeed: gross,
    shopOnHand: num(item?.shopOnHand),
    predicted: item?.predicted != null ? item.predicted : gross,
    storageOnHand: Math.max(0, gross - buyQuantity),
    buyQuantity,
  }
}
