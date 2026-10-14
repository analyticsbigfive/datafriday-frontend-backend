/**
 * comparisonBreakdowns : répartitions d'un rapport Analyse sous forme de DONNÉES pures
 * (article, type, catégorie, industriel, marque, coût fournisseur, promotion, type de
 * promotion, remise accordée), avec les mêmes règles que les cartes d'AnalyseView
 * (MenuItemRevenueDistribution, ArticleDimensionDonuts, PromotionSection).
 *
 * Sert à calculer les écarts entre deux rapports sans passer par les composants :
 * les fonctions de articleDimensionBreakdown.js sont réutilisées telles quelles.
 */
import { resolveItemType, resolveItemCategory } from '@/utils/analyseDimensions'
import {
  recordMetric,
  brandBreakdown,
  industrialBreakdown,
  supplierCostBreakdown,
  promotionBreakdown,
  promotionTypeBreakdown,
  promotionDiscount,
} from '@/utils/articleDimensionBreakdown'

/** Regroupe les records par clé (clés vides ignorées), tri décroissant comme les donuts. */
function groupEntries(records, keyFn, metric) {
  const map = new Map()
  for (const r of records || []) {
    const k = keyFn(r)
    if (!k) continue
    map.set(k, (map.get(k) || 0) + metric(r))
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, value }))
}

const itemKeyOf = (r) => r.menuItemName || r.itemName || r.productName || ''

/** Répartitions pour UN mode (CA ou quantité). Les dimensions article valent null sans index. */
function breakdownsForMode(records, index, mode) {
  const metric = recordMetric(mode)
  return {
    item: groupEntries(records, itemKeyOf, metric),
    type: groupEntries(records, resolveItemType, metric),
    category: groupEntries(records, resolveItemCategory, metric),
    industrial: index ? industrialBreakdown(records, index, metric) : null,
    brand: index ? brandBreakdown(records, index, metric) : null,
    promotion: index ? promotionBreakdown(records, index, metric) : null,
    promotionType: index ? promotionTypeBreakdown(records, index, metric) : null,
  }
}

/**
 * @param {Array} records  records article du rapport (articleRecords)
 * @param {Map|null} dimensionsIndex  index de GET /analyse/article-dimensions (null = pas chargé)
 * @returns {{
 *   revenue: object, quantity: object,
 *   categories: Array<{key: string, value: number}>,
 *   supplierCost: Array<{key: string, value: number}>|null,
 *   discount: {amount: number, withoutReference: number}|null,
 * }}
 *   `categories` = cartes du haut (CA par type d'article, types à 0 retirés).
 *   `supplierCost` et `discount` sont toujours en euros (indépendants du mode).
 */
export function buildReportBreakdowns(records, dimensionsIndex = null) {
  const revenue = breakdownsForMode(records, dimensionsIndex, 'revenue')
  const quantity = breakdownsForMode(records, dimensionsIndex, 'quantity')
  return {
    revenue,
    quantity,
    categories: revenue.type.filter((e) => e.value !== 0),
    supplierCost: dimensionsIndex ? supplierCostBreakdown(records, dimensionsIndex) : null,
    discount: dimensionsIndex ? promotionDiscount(records, dimensionsIndex) : null,
  }
}
