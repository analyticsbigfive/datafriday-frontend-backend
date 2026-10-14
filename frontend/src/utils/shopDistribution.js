/**
 * shopDistribution : répartition du CA (ou des quantités) par PdV, par type de PdV et par
 * zone, en fonctions PURES.
 *
 * Source unique : ShopDistributionPieChart (camemberts du rapport principal) ET le moteur
 * de comparaison (comparisonReportSnapshot) appellent ces fonctions. Le regroupement est
 * celui de analyseAggregations.groupBy, avec les mêmes clés que les anciens computed du
 * composant : nom du PdV, type résolu (resolveShopType), zone.
 */
import { groupBy } from '@/utils/analyseAggregations'
import { resolveShopType } from '@/utils/analyseDimensions'
import { SHOP_TYPE_LABEL_KEYS } from '@/constants/shopTypes'
import { UNATTACHED_SHOP_KEY } from '@/utils/analyseReconciliation'

/** Dimensions de la section, dans l'ordre d'affichage. */
export const SHOP_DISTRIBUTION_DIMS = ['shop', 'type', 'area']

/** Métrique sommée selon le mode du toggle (« quantity » sinon CA). */
export const shopDistributionMetric = (mode) =>
  (mode === 'quantity' ? (r) => r.quantity || 0 : (r) => r.revenue || 0)

/**
 * Clé canonique (simple ou composite 'food, beverages') -> libellé localisé.
 * Composite : on traduit chaque token et on joint avec ' & '.
 * @param {string} key
 * @param {(k: string) => string} t
 */
export function shopTypeLabel(key, t) {
  if (!key) return ''
  if (key === UNATTACHED_SHOP_KEY) return t('anUnmatchedShops')
  return String(key)
    .split(', ')
    .map((token) => (SHOP_TYPE_LABEL_KEYS[token] ? t(SHOP_TYPE_LABEL_KEYS[token]) : token))
    .join(' & ')
}

/**
 * Les trois regroupements (PdV, type, zone) pour un mode, au format de groupBy
 * ({ keys, labels, values, colors }), triés par valeur décroissante.
 * @param {Array} records
 * @param {'revenue'|'quantity'} mode
 * @param {object} [style]  habillage (le moteur n'en a pas besoin)
 * @param {string[]} [style.palette]
 * @param {object} [style.typeColors]
 * @param {object} [style.areaColors]
 * @param {(k: string) => string} [style.typeLabel]
 */
export function buildShopDistributionGroups(records, mode, style = {}) {
  const { palette = [], typeColors = null, areaColors = null, typeLabel = null } = style
  const valueFn = shopDistributionMetric(mode)
  return {
    shop: groupBy(records, (r) => r.shopName, valueFn, null, null, palette),
    type: groupBy(records, resolveShopType, valueFn, typeColors, typeLabel, palette),
    area: groupBy(records, (r) => r.shopArea, valueFn, areaColors, null, palette),
  }
}

/** Même répartition sous forme de listes [{ key, value }] (forme du snapshot de comparaison). */
export function buildShopDistributionEntries(records, mode) {
  const groups = buildShopDistributionGroups(records, mode)
  const out = {}
  for (const dim of SHOP_DISTRIBUTION_DIMS) {
    out[dim] = groups[dim].keys.map((key, i) => ({ key, value: groups[dim].values[i] }))
  }
  return out
}
