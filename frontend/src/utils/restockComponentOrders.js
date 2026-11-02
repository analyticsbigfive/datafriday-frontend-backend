// Étape 1 de la page Commandes : logique pure des composants (MenuComponent).
//  - leurs ingrédients entrent dans le RÉSUMÉ COMMANDE (besoins additionnels) ;
//  - la carte COMMANDE COMPOSANTS les liste avec cuisine, quantité et coût.
// Les entrées sont les commandes de `collectComponentOrders` (componentKitchenOrders.js) :
// aucune quantité n'est recalculée ici, on part du « À commander » de l'étape 1.

import { flattenComponentDef } from '@/utils/inventoryUtils'
import { KITCHEN_KIND_LOCAL, KITCHEN_KIND_UNDEFINED } from '@/utils/componentKitchenOrders'

const keyUnit = (u) => (u == null || u === '' ? 'unit' : String(u))

/**
 * Besoins en ingrédients des composants à commander : quantité du composant x
 * `qtyFactor` de chaque feuille. Une feuille répétée (même identité ET même
 * unité) est additionnée ; unité différente = ligne séparée, sans conversion.
 * L'itemKey est celui d'une ligne directe de l'étape 1 (`${id}|||${unité}`),
 * ce qui permet la fusion avec elle.
 * @param {Array} orders sortie de collectComponentOrders (avec `def`)
 * @param {Array} components catalogue (pour les sous-composants)
 * @returns {Array<{itemKey, itemName, unit, quantity, sourceId, marketPriceId}>}
 */
export function componentIngredientDemands(orders = [], components = []) {
  const byKey = new Map()
  for (const order of orders || []) {
    if (!order || !order.def) continue
    const quantity = Number(order.quantity)
    if (!(quantity > 0)) continue
    for (const leaf of flattenComponentDef(order.def, components)) {
      const factor = Number(leaf.qtyFactor)
      if (leaf.id == null || !(factor > 0)) continue
      const unit = keyUnit(leaf.unit)
      const itemKey = `${leaf.id}|||${unit}`
      const add = quantity * factor
      const hit = byKey.get(itemKey)
      if (hit) {
        hit.quantity += add
        continue
      }
      byKey.set(itemKey, {
        itemKey,
        itemName: leaf.name,
        unit,
        quantity: add,
        sourceId: leaf.sourceId ?? null,
        marketPriceId: leaf.marketPriceId ?? null,
      })
    }
  }
  return Array.from(byKey.values())
}

/** Coût d'une ligne = unitCost du composant x À commander ; null si unitCost absent (jamais un 0 inventé). */
export function componentOrderCost(def, quantity) {
  const raw = def ? def.unitCost : null
  if (raw == null || raw === '') return null
  const unitCost = Number(raw)
  const q = Number(quantity)
  if (!Number.isFinite(unitCost) || !(unitCost > 0) || !(q > 0)) return null
  return unitCost * q
}

/**
 * Lignes de la carte COMMANDE COMPOSANTS.
 * @param {Array} orders sortie de collectComponentOrders (avec `def`)
 * @param {object} p
 * @param {(order:object) => string} p.quantityLabel libellé « À commander » (buyInfo.main)
 * @param {{local:string, undefined:string}} p.labels libellés des cuisines sans nom
 * @returns {{lines: Array<{itemKey,name,kitchenLabel,quantityLabel,amount:number|null}>, total:number, hasUnknownCost:boolean}}
 */
export function buildComponentOrdersPanel(orders = [], { quantityLabel = () => '', labels = {} } = {}) {
  const lines = (orders || []).map((order) => {
    const kitchen = order.kitchen || {}
    const kitchenLabel =
      kitchen.kind === KITCHEN_KIND_LOCAL
        ? labels.local || ''
        : kitchen.kind === KITCHEN_KIND_UNDEFINED
          ? labels.undefined || ''
          : kitchen.name || ''
    return {
      itemKey: order.itemKey,
      name: order.itemName,
      kitchenLabel,
      quantityLabel: quantityLabel(order),
      amount: componentOrderCost(order.def, order.quantity),
    }
  })
  lines.sort((a, b) => String(a.name).localeCompare(String(b.name)))
  const total = lines.reduce((sum, l) => sum + (l.amount || 0), 0)
  return { lines, total, hasUnknownCost: lines.some((l) => l.amount == null) }
}
