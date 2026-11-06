// Point d'entrée UNIQUE du scénario de réarmement de la page Commandes.
//
// Regroupe en un appel pur tout ce que la vue tirait du circuit (utils/restockCircuit*) :
// circuit article (étape 1), groupes de réserve après prélèvement, réserves du réassort
// selon le mode actif, circuit ingrédient (feuille de course en mode ingrédients) et
// netting d'un article de feuille de course. La vue ne branche plus rien à la main : elle
// fournit les données brutes et les callbacks dépendant du catalogue, puis lit ce résultat.
//
// Module pur : aucun import Vue/Vuex, aucune mutation des entrées.

import { computeRestockCircuit, buildCircuitShopRows, buildCircuitStorageRows, applyCircuitToStorageGroups } from '@/utils/restockCircuitInputs'
import { computeIngredientCircuit } from '@/utils/restockCircuitIngredients'
import { netFinishedItemWithCircuit } from '@/utils/restockCircuitShopping'

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Quantité de référence pour résoudre une taille de colis : la valeur si > 0, sinon 1. */
function referenceQuantity(value) {
  return num(value) > 0 ? value : 1
}

/**
 * @param {Object} input
 * @param {Array} input.liveRestockRowsAll lignes PDV vivantes (toutes, y compris décochées)
 * @param {Object<string, boolean>} [input.stockExcluded] articles décochés
 * @param {Array} input.liveStockSettingsRows lignes d'articles de l'étape 1
 * @param {Array} input.storageRestockGroups groupes de réserve (lignes à tampon)
 * @param {'finished'|'ingredients'|string} [input.shoppingMode]
 * @param {boolean} [input.shoppingGenerated] feuille de course générée
 * @param {boolean} [input.hasLoadedPlan] un plan sauvegardé est chargé
 * @param {(row:object, referenceQuantity:number) => (number|null)} input.shopPackSizeFor
 *   taille de colis d'une ligne PDV (résolue avec la cible, ou 1)
 * @param {(row:object, referenceQuantity:number) => (number|null)} input.storagePackSizeFor
 *   taille de colis d'une ligne de réserve (résolue avec le tampon, ou 1)
 * @param {(item:object, quantity:number) => (number|null)} [input.ingredientPackSizeFor]
 *   taille de colis d'un ingrédient
 * @param {Object|(() => Object)} [input.ingredientInputs] { items, shopEntries, storageEntries }
 *   (demande ingrédients groupée, stock PDV et réserves agrégés). Fonction acceptée :
 *   n'est appelée qu'en mode ingrédients, pour ne pas payer l'agrégation en produits finis.
 * @returns {{
 *   circuit: object, orderByItem: Object, flowByShopRow: Object, transfersByItem: Object,
 *   storageFlowByKey: Object, storageGroups: Array, refillStorageGroups: Array,
 *   ingredientCircuitActive: boolean, ingredientCircuit: (object|null),
 *   netShoppingItem: (item:object) => object,
 * }}
 */
export function computeRestockScenario(input = {}) {
  const {
    liveRestockRowsAll = [],
    stockExcluded = {},
    liveStockSettingsRows = [],
    storageRestockGroups = [],
    shoppingMode = 'finished',
    shoppingGenerated = false,
    hasLoadedPlan = false,
    shopPackSizeFor,
    storagePackSizeFor,
    ingredientPackSizeFor,
    ingredientInputs,
  } = input

  // Circuit article (étape 1) : taille de colis résolue une fois par article.
  const packByItem = new Map()
  const shopPack = (row) => {
    if (!packByItem.has(row.itemKey)) {
      packByItem.set(row.itemKey, shopPackSizeFor ? shopPackSizeFor(row, referenceQuantity(row.targetQuantity)) : null)
    }
    return packByItem.get(row.itemKey)
  }
  const storagePack = (row) => (storagePackSizeFor ? storagePackSizeFor(row, referenceQuantity(row.buffer)) : null)

  const circuit = computeRestockCircuit({
    shopRows: buildCircuitShopRows(liveRestockRowsAll, stockExcluded, shopPack),
    storageRows: buildCircuitStorageRows(storageRestockGroups, liveStockSettingsRows, storagePack),
  })
  const storageGroups = applyCircuitToStorageGroups(storageRestockGroups, circuit.storageFlowByKey)

  // Circuit ingrédient : seulement en mode ingrédients (diagnostic et achat de la feuille).
  const isIngredients = shoppingMode === 'ingredients'
  let ingredientCircuit = null
  if (isIngredients) {
    const raw = typeof ingredientInputs === 'function' ? ingredientInputs() : ingredientInputs
    ingredientCircuit = computeIngredientCircuit({
      items: raw?.items || [],
      shopEntries: raw?.shopEntries || [],
      storageEntries: raw?.storageEntries || [],
      storageGroups: storageRestockGroups,
      shopPackSizeFor: ingredientPackSizeFor,
      storagePackSizeFor: storagePack,
    })
  }

  // Le circuit ingrédient ne pilote les réserves que feuille générée et sans plan chargé.
  const ingredientCircuitActive = isIngredients && !!shoppingGenerated && !hasLoadedPlan
  const refillStorageGroups = ingredientCircuitActive
    ? applyCircuitToStorageGroups(storageRestockGroups, ingredientCircuit.storageFlowByKey)
    : storageGroups

  /** Netting d'un article de la feuille de course, selon le mode. */
  function netShoppingItem(item) {
    const gross = num(item?.quantity)
    if (isIngredients) {
      const shopOnHand = num(ingredientCircuit.shopOnHandByItem[item.itemKey])
      const restockNeed = Math.max(0, gross - shopOnHand)
      const buyQuantity = Math.max(0, num(ingredientCircuit.purchaseByItem[item.itemKey]))
      return {
        restockNeed,
        shopOnHand,
        predicted: gross,
        storageOnHand: Math.max(0, restockNeed - buyQuantity),
        buyQuantity,
      }
    }
    // Produits finis : gross est déjà net du stock PDV, l'achat est celui du circuit.
    return netFinishedItemWithCircuit(item, circuit.orderByItem)
  }

  return {
    circuit,
    orderByItem: circuit.orderByItem,
    flowByShopRow: circuit.flowByShopRow,
    transfersByItem: circuit.transfersByItem,
    storageFlowByKey: circuit.storageFlowByKey,
    storageGroups,
    refillStorageGroups,
    ingredientCircuitActive,
    ingredientCircuit,
    netShoppingItem,
  }
}
