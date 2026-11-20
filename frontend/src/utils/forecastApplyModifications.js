/**
 * Moteur de l'outil Forecast (Analyse) : applique une liste de modifications « what-if »
 * aux records d'Analyse. Module PUR, sans Vue, sans store, sans I/O, sans mutation.
 *
 * Effets (cf. forecastModificationModel et forecastPriceRatio pour les règles) :
 *  - articleRecords : revenue' = revenue x ratioPrix x volume x basket
 *                     quantity' = quantity x volume, transactionCount' = transactionCount x volume
 *  - chartRecords (grain PdV, sans article) : même chose, avec un ratio de prix dérivé du
 *    grain article du même PdV (cf. forecastChartPriceRatios).
 *  - Pas d'arrondi. Liste vide ou sans modification valide : mêmes tableaux (mêmes
 *    références), stats neutres. Un record inchangé garde sa référence.
 */

import {
  PRICE_MODIFICATION_TYPES,
  effectiveModifications,
  leverFactors,
} from '@/utils/forecastModificationModel'
import { articleFromRecord, isTargetableArticle, priceRatioFor } from '@/utils/forecastPriceRatio'
import { buildPdvPriceRatioIndex, eventIdOf } from '@/utils/forecastChartPriceRatios'

/** Stats neutres : aucun effet de prix à signaler. */
function neutralStats() {
  return {
    priceModificationCount: 0,
    eventsWithArticleGrain: [],
    eventsWithoutArticleGrain: [],
    unpriceableItemIds: [],
    untargetableRecordCount: 0,
  }
}

function scaleField(rec, field, factor) {
  if (factor === 1) return
  const v = rec[field]
  if (v == null || v === '') return
  const n = Number(v)
  if (Number.isFinite(n)) rec[field] = n * factor
}

/** Copie le record avec CA, quantités et transactions mis à l'échelle (même référence si rien ne change). */
function scaleRecord(rec, revenueFactor, volume) {
  if (revenueFactor === 1 && volume === 1) return rec
  const out = { ...rec }
  scaleField(out, 'revenue', revenueFactor)
  scaleField(out, 'quantity', volume)
  scaleField(out, 'transactionCount', volume)
  return out
}

/** Ratios de prix de chaque record article (mémoïsés par article) et diagnostics associés. */
function articlePriceRatios(articles, active, ctx) {
  const memo = new Map()
  const unpriceable = new Set()
  let untargetable = 0
  const ratios = articles.map((rec) => {
    const article = articleFromRecord(rec)
    if (!isTargetableArticle(article)) {
      untargetable += 1
      return 1
    }
    const key = `${article.menuItemId}\u0000${article.category}\u0000${article.type}`
    let result = memo.get(key)
    if (!result) {
      result = priceRatioFor(article, active, ctx)
      memo.set(key, result)
      if (result.unpriceable) unpriceable.add(article.menuItemId)
    }
    return result.ratio
  })
  return { ratios, unpriceable, untargetable }
}

/**
 * @param {object} input
 * @param {object[]} input.chartRecords  Records au grain PdV (menuItemId null), alimentent les KPI.
 * @param {object[]} input.articleRecords  Records au grain article, déjà réconciliés.
 * @param {object[]} input.modifications  Liste de modifications (ordre d'ajout).
 * @param {Map<string, object>} [input.catalogById]  menuItemId (chaîne) vers Menu Item.
 * @param {string|null} [input.spaceId]  Espace courant.
 * @returns {{ chartRecords: object[], articleRecords: object[], stats: object }}
 *   stats : priceModificationCount, eventsWithArticleGrain / eventsWithoutArticleGrain (ids
 *   triés), unpriceableItemIds, untargetableRecordCount. Les diagnostics de prix restent
 *   neutres (vides / 0) tant que la liste ne contient aucune modification de prix.
 */
export function applyForecastModifications({
  chartRecords,
  articleRecords,
  modifications,
  catalogById = null,
  spaceId = null,
}) {
  const active = effectiveModifications(modifications)
  if (active.length === 0) return { chartRecords, articleRecords, stats: neutralStats() }

  const { volume, basket } = leverFactors(active)
  const leverFactor = volume * basket
  const priceModificationCount = active.filter((m) =>
    PRICE_MODIFICATION_TYPES.includes(m.type),
  ).length
  const hasPrice = priceModificationCount > 0

  const articles = Array.isArray(articleRecords) ? articleRecords : []
  const charts = Array.isArray(chartRecords) ? chartRecords : []

  const stats = { ...neutralStats(), priceModificationCount }
  let ratios = articles.map(() => 1)
  let index = null

  if (hasPrice) {
    const computed = articlePriceRatios(articles, active, { catalogById, spaceId })
    ratios = computed.ratios
    index = buildPdvPriceRatioIndex(articles, ratios)
    const chartEvents = new Set(charts.map(eventIdOf).filter((id) => id !== ''))
    stats.eventsWithArticleGrain = [...index.eventIds].sort()
    stats.eventsWithoutArticleGrain = [...chartEvents].filter((id) => !index.eventIds.has(id)).sort()
    stats.unpriceableItemIds = [...computed.unpriceable].sort()
    stats.untargetableRecordCount = computed.untargetable
  }

  return {
    articleRecords: articles.map((rec, i) => scaleRecord(rec, ratios[i] * leverFactor, volume)),
    chartRecords: charts.map((rec) =>
      scaleRecord(rec, (index ? index.ratioFor(rec) : 1) * leverFactor, volume),
    ),
    stats,
  }
}
