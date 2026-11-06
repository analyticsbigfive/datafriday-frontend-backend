// Circuit de réarmement au grain INGRÉDIENT (feuille de course en mode ingrédients).
//
// Même circuit que l'étape 1 (utils/restockCircuit), mais alimenté par la demande
// brute de chaque ingrédient au lieu des lignes PDV article : un « PDV virtuel »
// par ingrédient (cible = demande brute, restant = stock PDV additionné), et les
// réserves reliées à l'ingrédient par la règle storageTargetKey. Ainsi ce qui est
// retiré de l'achat au titre d'une réserve (prélèvement) est exactement ce que le
// remplissage de cette réserve rachète : tampon − (restant − prélevé).
//
// Le stock des réserves SANS ligne de tampon est injecté comme réserve à tampon 0 :
// prélevable, jamais remplie.
// Module pur : la vue fournit les ingrédients, les entrées de stock et les tailles
// de colis.

import { consumeFromPool, preparePool } from '@/utils/stockNetting'
import { buildCircuitStorageRows, computeRestockCircuit } from '@/utils/restockCircuitInputs'

const EPS = 1e-9

export const INGREDIENT_SHOP_PREFIX = 'ingredient:'
export const INGREDIENT_STOCK_PREFIX = 'ingredient-stock:'

/**
 * Entrées du circuit pour le mode ingrédients.
 * ⚠️ Consomme les pools : ils sont préparés ici (copies), jamais ceux de l'appelant.
 * @param {Object} p
 * @param {Array} p.items ingrédients bruts { itemKey, itemName, unit, quantity, itemId?,
 *   sourceId?, marketPriceId? }, dans l'ordre de la feuille (le premier consomme le
 *   stock partagé, comme consumeFromPool)
 * @param {Array} p.shopEntries stock PDV agrégé (aggregateCountsForElements)
 * @param {Array} p.storageEntries stock des réserves agrégé par nom
 * @param {Array} p.storageGroups storageRestockGroups (lignes à tampon)
 * @param {(item:object, quantity:number) => (number|null)} [p.shopPackSizeFor]
 * @param {(row:object) => (number|null)} [p.storagePackSizeFor]
 * @returns {{ shopRows:Array, storageRows:Array, shopOnHandByItem:Object<string, number> }}
 */
export function buildIngredientCircuitInputs({
  items = [],
  shopEntries = [],
  storageEntries = [],
  storageGroups = [],
  shopPackSizeFor,
  storagePackSizeFor,
} = {}) {
  const shopPool = preparePool(shopEntries)
  const storagePool = preparePool(storageEntries)
  const list = (items || []).filter((it) => it && it.itemKey != null)

  const shopRows = []
  const shopOnHandByItem = {}
  for (const item of list) {
    const gross = Number(item.quantity) || 0
    const onHand = consumeFromPool(item, shopPool)
    shopOnHandByItem[item.itemKey] = onHand
    const pack = shopPackSizeFor ? Number(shopPackSizeFor(item, gross > 0 ? gross : 1)) : null
    shopRows.push({
      shopId: `${INGREDIENT_SHOP_PREFIX}${item.itemKey}`,
      shopName: item.itemName,
      itemKey: item.itemKey,
      unit: item.unit || '',
      targetQuantity: gross,
      remainingQuantity: onHand,
      packSize: pack > 0 ? pack : null,
    })
  }

  // Réserves à tampon, reliées à l'ingrédient (Market Price, id, nom + unité).
  const storageRows = buildCircuitStorageRows(storageGroups, list, storagePackSizeFor)

  // Stock de réserve SANS ligne de tampon : ce que le pool voit en plus des lignes.
  for (const item of list) {
    const inPool = consumeFromPool(item, storagePool)
    const inRows = storageRows
      .filter((r) => r.itemKey === item.itemKey)
      .reduce((s, r) => s + r.remaining, 0)
    const extra = inPool - inRows
    if (extra > EPS) {
      storageRows.push({
        key: `${INGREDIENT_STOCK_PREFIX}${item.itemKey}`,
        itemKey: item.itemKey,
        elementId: null,
        name: item.itemName,
        unit: item.unit || '',
        buffer: 0,
        remaining: extra,
        percent: 100,
        packSize: null,
      })
    }
  }
  return { shopRows, storageRows, shopOnHandByItem }
}

/**
 * Circuit complet au grain ingrédient.
 * @returns {{
 *   purchaseByItem: Object<string, number>,   // itemKey -> à acheter pour la demande
 *   shopOnHandByItem: Object<string, number>, // itemKey -> stock PDV additionné (diagnostic)
 *   storageFlowByKey: Object<string, object>, // clé de réserve -> { drawn, required, purchase }
 * }}
 */
export function computeIngredientCircuit(params = {}) {
  const { shopRows, storageRows, shopOnHandByItem } = buildIngredientCircuitInputs(params)
  const res = computeRestockCircuit({ shopRows, storageRows })
  return {
    purchaseByItem: res.orderByItem,
    shopOnHandByItem,
    storageFlowByKey: res.storageFlowByKey,
  }
}
