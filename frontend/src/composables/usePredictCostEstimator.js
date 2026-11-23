/**
 * usePredictCostEstimator : estimateur de coût des records au grain PdV (utils/costPerUnitIndex)
 * pour la Prévision et la comparaison Forecast. `null` quand il n'a pas lieu d'être (Analyse),
 * les métriques retombent alors sur le calcul au grain article, inchangé.
 */
import { computed, unref } from 'vue'
import { makeCostFor } from '@/utils/eventCostLookup'
import { buildCostEstimator } from '@/utils/costPerUnitIndex'

/**
 * @param {Object} p
 * @param {import('vue').Ref<boolean>|boolean} p.enabled
 * @param {import('vue').Ref<Array>} p.articleRecords  records au grain article NON modifiés (base des coûts par pièce)
 * @param {import('vue').Ref<object>} p.menuItemCostMap  coût de fournée par article
 * @param {import('vue').Ref<object|null>} [p.menuItemCostByEvent]  coût figé par event (repli : menuItemCostMap)
 */
export function usePredictCostEstimator({ enabled, articleRecords, menuItemCostMap, menuItemCostByEvent = null }) {
  return computed(() => {
    if (!unref(enabled)) return null
    const costMap = unref(menuItemCostMap) || {}
    return buildCostEstimator({
      articleRecords: unref(articleRecords) || [],
      unitCostOf: makeCostFor(costMap, unref(menuItemCostByEvent)),
      hasCostMap: Object.keys(costMap).length > 0,
    })
  })
}
