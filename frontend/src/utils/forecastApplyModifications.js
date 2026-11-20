/**
 * Moteur de l'outil Forecast (Analyse) : applique une liste de modifications « what-if »
 * aux records d'Analyse. Module PUR, sans Vue, sans store, sans I/O, sans mutation.
 *
 * Effets (cf. forecastModificationModel et forecastPriceRatio pour les règles) :
 *  - articleRecords : revenue' = revenue x ratioPrix^(1+e) x volume x basket
 *                     quantity' = quantity x ratioPrix^e x volume
 *                     transactionCount' = transactionCount x volume
 *    (e = élasticité choisie par l'utilisateur, 0 par défaut, cf. forecastElasticity)
 *  - chartRecords (grain PdV, sans article) : même chose, avec des ratios dérivés du grain
 *    article du même PdV, et à défaut du mix historique du PdV (cf. forecastChartPriceRatios).
 *  - Pas d'arrondi. Liste vide ou sans modification valide : mêmes tableaux (mêmes
 *    références), stats neutres. Un record inchangé garde sa référence.
 */

import {
  PRICE_MODIFICATION_TYPES,
  effectiveModifications,
  leverFactors,
} from '@/utils/forecastModificationModel'
import { articleFromRecord, isTargetableArticle, priceRatioFor } from '@/utils/forecastPriceRatio'
import { RATIO_SOURCES, buildPdvPriceRatioIndex, eventIdOf } from '@/utils/forecastChartPriceRatios'
import { clampElasticity, priceEffect } from '@/utils/forecastElasticity'

const NO_EFFECT = Object.freeze({ revenue: 1, quantity: 1 })

/** Stats neutres : aucun effet de prix à signaler. */
function neutralStats() {
  return {
    priceModificationCount: 0,
    eventsWithArticleGrain: [],
    eventsWithoutArticleGrain: [],
    eventsFromHistoricalMix: [],
    elasticity: 0,
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
function scaleRecord(rec, revenueFactor, quantityFactor, volume) {
  if (revenueFactor === 1 && quantityFactor === 1 && volume === 1) return rec
  const out = { ...rec }
  scaleField(out, 'revenue', revenueFactor)
  scaleField(out, 'quantity', quantityFactor)
  scaleField(out, 'transactionCount', volume)
  return out
}

/** Effets de prix (CA, quantité) de chaque record article (mémoïsés par article) et diagnostics. */
function articlePriceEffects(articles, active, ctx, elasticity) {
  const memo = new Map()
  const unpriceable = new Set()
  let untargetable = 0
  const ratios = articles.map((rec) => {
    const article = articleFromRecord(rec)
    if (!isTargetableArticle(article)) {
      untargetable += 1
      return NO_EFFECT
    }
    const key = `${article.menuItemId}\u0000${article.category}\u0000${article.type}`
    let result = memo.get(key)
    if (!result) {
      result = priceRatioFor(article, active, ctx)
      memo.set(key, result)
      if (result.unpriceable) unpriceable.add(article.menuItemId)
    }
    return priceEffect(result.ratio, elasticity)
  })
  return { effects: ratios, unpriceable, untargetable }
}

/**
 * @param {object} input
 * @param {object[]} input.chartRecords  Records au grain PdV (menuItemId null), alimentent les KPI.
 * @param {object[]} input.articleRecords  Records au grain article, déjà réconciliés.
 * @param {object[]} input.modifications  Liste de modifications (ordre d'ajout).
 * @param {Map<string, object>} [input.catalogById]  menuItemId (chaîne) vers Menu Item.
 * @param {string|null} [input.spaceId]  Espace courant.
 * @param {number} [input.elasticity]  Élasticité prix (0 par défaut : quantités inchangées).
 * @returns {{ chartRecords: object[], articleRecords: object[], stats: object }}
 *   stats : priceModificationCount, elasticity, eventsWithArticleGrain (prévision par article),
 *   eventsFromHistoricalMix (estimés par le mix historique des PdV), eventsWithoutArticleGrain
 *   (aucun grain article nulle part : prix sans effet), unpriceableItemIds,
 *   untargetableRecordCount. Ids triés. Les diagnostics de prix restent neutres (vides / 0)
 *   tant que la liste ne contient aucune modification de prix.
 */
export function applyForecastModifications({
  chartRecords,
  articleRecords,
  modifications,
  catalogById = null,
  spaceId = null,
  elasticity = 0,
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
  let effects = articles.map(() => NO_EFFECT)
  let index = null

  if (hasPrice) {
    const e = clampElasticity(elasticity)
    const computed = articlePriceEffects(articles, active, { catalogById, spaceId }, e)
    effects = computed.effects
    index = buildPdvPriceRatioIndex(articles, effects)
    stats.elasticity = e
    stats.eventsWithArticleGrain = [...index.eventIds].sort()
    stats.unpriceableItemIds = [...computed.unpriceable].sort()
    stats.untargetableRecordCount = computed.untargetable
  }

  const fromHistory = new Set()
  const withoutGrain = new Set()
  const scaledCharts = charts.map((rec) => {
    const f = index ? index.factorsFor(rec) : NO_EFFECT
    if (index) {
      const event = eventIdOf(rec)
      if (event !== '' && !index.eventIds.has(event)) {
        if (f.source === RATIO_SOURCES.NONE) withoutGrain.add(event)
        else fromHistory.add(event)
      }
    }
    return scaleRecord(rec, f.revenue * leverFactor, f.quantity * volume, volume)
  })
  if (index) {
    // Un event dont un seul PdV reste sans estimation compte comme « sans effet ».
    stats.eventsWithoutArticleGrain = [...withoutGrain].sort()
    stats.eventsFromHistoricalMix = [...fromHistory].filter((id) => !withoutGrain.has(id)).sort()
  }

  return {
    articleRecords: articles.map((rec, i) =>
      scaleRecord(rec, effects[i].revenue * leverFactor, effects[i].quantity * volume, volume),
    ),
    chartRecords: scaledCharts,
    stats,
  }
}
