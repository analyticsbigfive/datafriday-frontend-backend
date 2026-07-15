// Utilitaire partagé de bucketing / agrégation de timelines à la minute.
//
// Source unique de vérité pour TOUTES les timelines du projet (Analyse,
// Predict, EventPredict, Stockup, Inventory). S'inspire directement de la
// référence React (`versionReact/src/app/utils/predictiveAnalyticsTimeline.ts`)
// — granularité native 1 minute, bucketing optionnel à la consommation.
//
// Pourquoi un module unique :
//   - 4 implémentations parallèles existaient (`EventTimelineChart` analyse,
//     `EventPredictView::timelineByMinute`, `usePredictiveTimeline::bucketTime`,
//     `predictiveTimelinePreprocess`) → maintenance lourde + risque de
//     divergence (15 min vs 1 min vs récursion sur minutes >= 1440).
//   - Le front consomme désormais des datasets "lightweight" pré-traités au
//     lieu de requêter la table raw sales / le shopGranular complet à chaque
//     render.

// ---------------------------------------------------------------------------
// Stratégies de bucket (en minutes). Le projet peut consommer la timeline à
// plusieurs granularités sans dupliquer la logique d'agrégation.
// ---------------------------------------------------------------------------
export const TIMELINE_BUCKET_STRATEGIES = Object.freeze({
  MINUTE_1: 1,
  MINUTE_5: 5,
  MINUTE_15: 15,
  MINUTE_30: 30,
  HOUR_1: 60,
})

const HHMM_RE = /^(\d{1,2}):(\d{2})$/

/**
 * Parse une valeur minute (HH:MM string ou nombre déjà en minutes) → total
 * minutes depuis 00:00. Retourne null si invalide.
 *
 * @param {string|number} value
 * @returns {number|null}
 */
export function parseMinuteToken(value) {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const s = String(value)
  const m = HHMM_RE.exec(s)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  // Tolère un TIMESTAMP ISO ("2025-09-13T16:13:00.000Z") : on lit l'heure
  // stockée (HH:MM après le "T"), sans conversion de fuseau. Les ventes
  // granulaires portent ce format → sans ça, parseMinuteToken renvoyait null
  // et toutes les minutes s'écrasaient / étaient ignorées.
  const iso = s.match(/T(\d{2}):(\d{2})/)
  if (iso) return Number(iso[1]) * 60 + Number(iso[2])
  return null
}

/**
 * Formate un nombre total de minutes en chaîne HH:MM (normalisé sur 24h).
 *
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatMinute(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return '00:00'
  let adjusted = totalMinutes % (24 * 60)
  if (adjusted < 0) adjusted += 24 * 60
  const h = Math.floor(adjusted / 60)
  const m = adjusted % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Bucket une minute (HH:MM ou nombre) selon la stratégie demandée.
 * Garantit la normalisation 24h.
 *
 * @param {string|number} minute
 * @param {number} [bucketMinutes=1]
 * @returns {string|null} HH:MM bucketed, ou null si input invalide.
 */
export function bucketMinute(minute, bucketMinutes = 1) {
  const total = parseMinuteToken(minute)
  if (total == null) return null
  const size = Number(bucketMinutes) > 0 ? Number(bucketMinutes) : 1
  return formatMinute(Math.floor(total / size) * size)
}

/**
 * Indique si une minute (HH:MM ou nombre) est dans la fenêtre `range`
 * (start/end inclusifs). `{start:null,end:null}` = pas de filtre.
 *
 * @param {string|number} minute
 * @param {{ start: any, end: any }|null|undefined} range
 * @returns {boolean}
 */
export function isMinuteInRange(minute, range) {
  if (!range) return true
  const s = parseMinuteToken(range.start)
  const e = parseMinuteToken(range.end)
  if (s == null && e == null) return true
  const m = parseMinuteToken(minute)
  if (m == null) return false
  if (s != null && m < s) return false
  if (e != null && m > e) return false
  return true
}

/**
 * @param {{ start:any, end:any }|null|undefined} range
 * @returns {boolean}
 */
export function hasActiveRange(range) {
  if (!range) return false
  return Boolean(range.start) || Boolean(range.end)
}

// ---------------------------------------------------------------------------
// Agrégation lightweight par minute (ou tout autre bucket).
// ---------------------------------------------------------------------------

/**
 * Pré-traite un tableau de records timeline en datapoints agrégés. Chaque
 * point produit comprend les indicateurs nécessaires aux KPI strips, charts
 * et right column metrics — sans recalculer côté composant.
 *
 * Source unique pour :
 *   - `EventPredictView::preprocessedTimelinePerMinute` (1 min)
 *   - `EventPredictView::timelineByMinute` (1 min, mini-courbe)
 *   - `EventTimelineChart` (analyse) series (1 min)
 *   - futurs export CSV / annotations / comparateur de versions
 *
 * @param {Array<object>} records   tableau de records timeline
 *   (champs reconnus : minute, eventId, shopId/elementId, menuItemId/
 *   mappedMenuItemId, totalRevenue/revenue, totalQuantity/quantity,
 *   transactionCount/transactions).
 * @param {object} [opts]
 * @param {number} [opts.bucketMinutes=1]  granularité du bucket en minutes.
 * @param {Object<string, number>} [opts.menuItemCostMap]  unitaire par item.
 * @param {(record:object)=>boolean} [opts.filter]  filtre par record (shop,
 *   product, catégorie…). Appliqué AVANT bucketing.
 * @param {'event'|'shop'|'product'|'shopProduct'|'global'} [opts.groupBy='global']
 *   Granularité conservée dans chaque bucket. `'shopProduct'` est le format
 *   canonique pré-traité : une ligne par minute × event × version × shop × item.
 * @returns {Array<{
 *   minute: string,
 *   eventId?: string|null,
 *   shopId?: string|null,
 *   productId?: string|null,
 *   totalRevenue: number,
 *   totalQuantity: number,
 *   transactionCount: number,
 *   totalCost: number,
 *   margin: number,
 *   avgBasket: number,
 *   isPredictive?: boolean,
 *   confidenceScore?: number|null,
 * }>}
 */
export function aggregateTimeline(records, opts = {}) {
  if (!Array.isArray(records) || records.length === 0) return []
  const bucketSize = Number(opts.bucketMinutes) > 0 ? Number(opts.bucketMinutes) : 1
  const costMap = opts.menuItemCostMap || {}
  const filter = typeof opts.filter === 'function' ? opts.filter : null
  const groupBy = opts.groupBy || 'global'

  const byKey = new Map()
  for (const r of records) {
    if (!r) continue
    if (filter && !filter(r)) continue
    const minute = bucketMinute(r.minute ?? r.time ?? r.timestamp ?? r.createdAt, bucketSize)
    if (!minute) continue

    const eventId = r.eventId || opts.eventId || null
    const configurationVersionId =
      r.configurationVersionId || r.configVersionId || r.versionId || opts.configurationVersionId || null
    const scenarioId = r.predictionScenarioId || r.scenarioId || opts.scenarioId || null
    const rawShopId = r.shopId || r.elementId || r.shop || null
    const rawProductId =
      r.productId || r.menuItemId || r.mappedMenuItemId || r.itemId || null
    const shopId =
      groupBy === 'shop' || groupBy === 'shopProduct'
        ? rawShopId
        : null
    const productId =
      groupBy === 'product' || groupBy === 'shopProduct'
        ? rawProductId
        : null

    const key = [
      minute,
      eventId || '',
      configurationVersionId || '',
      scenarioId || '',
      shopId || '',
      productId || '',
    ].join('|')
    let agg = byKey.get(key)
    if (!agg) {
      agg = {
        minute,
        eventId,
        configurationVersionId,
        scenarioId,
        shopId,
        shopName: r.shopName || r.elementName || null,
        productId,
        weezeventProductId: r.weezeventProductId || null,
        menuItemId: rawProductId,
        mappedMenuItemId: r.mappedMenuItemId || rawProductId,
        // Libellé vendu : les ventes Weezevent (event-timeline) portent le nom dans
        // transactionItemName / weezeventProductName — sans ces fallbacks, l'item
        // perdait son nom au pré-traitement → réconciliation aveugle → « Non rattachés ».
        mappedMenuItemName:
          r.mappedMenuItemName || r.menuItemName || r.itemName || r.transactionItemName || r.weezeventProductName || null,
        itemName:
          r.itemName || r.menuItemName || r.productName || r.name || r.transactionItemName || r.weezeventProductName || null,
        menuItemType: r.menuItemType || r.type || null,
        menuItemCategory: r.menuItemCategory || r.category || null,
        // Signaux taxonomiques source Weezevent. Conservés jusqu'à la
        // réconciliation pour assimilation vers catégories DataFriday.
        weezpayNature: r.weezpayNature || r.nature || null,
        weezpaySubnature: r.weezpaySubnature || r.subnature || null,
        // Dims PdV fournies par l'API event-timeline : constantes par shopId,
        // indispensables aux vues « By POS type / By area » quand le PdV n'est
        // dans aucun floor plan (imports Weezevent bruts).
        shopType: r.shopType || null,
        shopArea: r.shopArea || null,
        totalRevenue: 0,
        totalQuantity: 0,
        transactionCount: 0,
        totalCost: 0,
        predictedRevenue: 0,
        predictedQuantity: 0,
        stockupQuantity: 0,
        inventoryQuantity: 0,
        discardedQuantity: 0,
        _confSum: 0,
        _confCount: 0,
        isPredictive: false,
      }
      byKey.set(key, agg)
    }

    const rev = Number(r.totalRevenue ?? r.revenue) || 0
    const qty = Number(r.totalQuantity ?? r.quantity) || 0
    const tx = Number(r.transactionCount ?? r.transactions) || 0
    const directCost = Number(r.totalCost ?? r.cost)
    const itemId = rawProductId
    const unitCost = itemId != null ? costMap[itemId] || 0 : 0

    if (!agg.weezpayNature) agg.weezpayNature = r.weezpayNature || r.nature || null
    if (!agg.weezpaySubnature) agg.weezpaySubnature = r.weezpaySubnature || r.subnature || null
    agg.totalRevenue += rev
    agg.totalQuantity += qty
    agg.transactionCount += tx
    agg.totalCost += Number.isFinite(directCost) ? directCost : unitCost * qty
    agg.predictedRevenue += Number(r.predictedRevenue ?? r.predictionRevenue) || 0
    agg.predictedQuantity += Number(r.predictedQuantity ?? r.predictionQuantity) || 0
    agg.stockupQuantity += Number(r.stockupQuantity ?? r.stockUpQuantity ?? r.stockup) || 0
    agg.inventoryQuantity += Number(r.inventoryQuantity ?? r.inventoryCount ?? r.inventory) || 0
    agg.discardedQuantity += Number(r.discardedQuantity ?? r.wasteQuantity ?? r.discarded) || 0
    if (r.isPredictive) agg.isPredictive = true
    if (typeof r.confidenceScore === 'number') {
      agg._confSum += r.confidenceScore
      agg._confCount += 1
    }
  }

  const out = []
  for (const agg of byKey.values()) {
    out.push({
      minute: agg.minute,
      eventId: agg.eventId,
      configurationVersionId: agg.configurationVersionId,
      scenarioId: agg.scenarioId,
      shopId: agg.shopId,
      shopName: agg.shopName,
      shopType: agg.shopType,
      shopArea: agg.shopArea,
      productId: agg.productId,
      weezeventProductId: agg.weezeventProductId,
      menuItemId: agg.menuItemId,
      mappedMenuItemId: agg.mappedMenuItemId,
      mappedMenuItemName: agg.mappedMenuItemName,
      itemName: agg.itemName,
      menuItemType: agg.menuItemType,
      menuItemCategory: agg.menuItemCategory,
      weezpayNature: agg.weezpayNature,
      weezpaySubnature: agg.weezpaySubnature,
      totalRevenue: agg.totalRevenue,
      totalQuantity: agg.totalQuantity,
      transactionCount: agg.transactionCount,
      totalCost: agg.totalCost,
      revenue: agg.totalRevenue,
      quantity: agg.totalQuantity,
      transactions: agg.transactionCount,
      margin: agg.totalRevenue > 0
        ? ((agg.totalRevenue - agg.totalCost) / agg.totalRevenue) * 100
        : 0,
      avgBasket: agg.transactionCount > 0
        ? agg.totalRevenue / agg.transactionCount
        : 0,
      panier: agg.transactionCount > 0
        ? agg.totalRevenue / agg.transactionCount
        : 0,
      predictedRevenue: agg.predictedRevenue,
      predictedQuantity: agg.predictedQuantity,
      stockupQuantity: agg.stockupQuantity,
      inventoryQuantity: agg.inventoryQuantity,
      discardedQuantity: agg.discardedQuantity,
      isPredictive: agg.isPredictive || undefined,
      confidenceScore: agg._confCount > 0 ? agg._confSum / agg._confCount : null,
    })
  }
  return out.sort((a, b) => {
    const cmp = String(a.minute).localeCompare(String(b.minute))
    if (cmp !== 0) return cmp
    return (
      String(a.shopId || '').localeCompare(String(b.shopId || '')) ||
      String(a.productId || '').localeCompare(String(b.productId || ''))
    )
  })
}

/**
 * Format canonique de pré-traitement timeline : conserve la granularité utile
 * minute × event × version × shop × item, puis enrichit chaque point avec les
 * métriques financières prêtes à consommer.
 *
 * @param {Array<object>} records
 * @param {object} [opts]
 * @returns {Array<object>}
 */
export function preprocessTimelineRecords(records, opts = {}) {
  return aggregateTimeline(records, {
    ...opts,
    bucketMinutes: 1,
    groupBy: 'shopProduct',
  })
}

/**
 * Helper : agrège globalement (1 point par minute, toutes shops/items
 * confondus). Alias pratique pour les KPI strips et mini-charts.
 *
 * @param {Array<object>} records
 * @param {object} [opts]  voir {@link aggregateTimeline}.
 * @returns {Array<object>}
 */
export function aggregateTimelinePerMinute(records, opts = {}) {
  return aggregateTimeline(records, { ...opts, bucketMinutes: 1, groupBy: 'global' })
}

/**
 * Construit un filtre composable utilisable par {@link aggregateTimeline}.
 * Toutes les contraintes sont AND. `null`/`undefined`/`[]` = neutre.
 *
 * @param {object} criteria
 * @param {string|string[]} [criteria.eventIds]
 * @param {string|string[]} [criteria.shopIds]
 * @param {string|string[]} [criteria.productIds]
 * @param {string|string[]} [criteria.categories]
 * @param {string|string[]} [criteria.configurationVersionIds]
 * @param {string|string[]} [criteria.scenarioIds]
 * @param {{ start:any, end:any }} [criteria.range]
 * @param {(record:object)=>boolean} [criteria.extra]  filtre additionnel.
 * @returns {(record:object)=>boolean}
 */
export function buildTimelineFilter(criteria = {}) {
  const norm = (v) => {
    if (v == null) return null
    if (Array.isArray(v)) return v.length > 0 ? new Set(v) : null
    return new Set([v])
  }
  const events = norm(criteria.eventIds)
  const shops = norm(criteria.shopIds)
  const products = norm(criteria.productIds)
  const categories = norm(criteria.categories)
  const versions = norm(criteria.configurationVersionIds || criteria.versionIds)
  const scenarios = norm(criteria.scenarioIds || criteria.predictionScenarioIds)
  const range = criteria.range
  const extra = typeof criteria.extra === 'function' ? criteria.extra : null

  return function timelineFilter(r) {
    if (!r) return false
    if (events && !events.has(r.eventId)) return false
    if (shops && !shops.has(r.shopId || r.elementId)) return false
    if (products && !products.has(r.productId || r.menuItemId || r.mappedMenuItemId || r.itemId)) return false
    if (versions && !versions.has(r.configurationVersionId || r.configVersionId || r.versionId)) return false
    if (scenarios && !scenarios.has(r.predictionScenarioId || r.scenarioId)) return false
    if (categories) {
      const cat = r.menuItemCategory || r.category
      if (!cat || !categories.has(cat)) return false
    }
    if (range && !isMinuteInRange(r.minute, range)) return false
    if (extra && !extra(r)) return false
    return true
  }
}

// ---------------------------------------------------------------------------
// Windowing — ratio par (shopId, menuItemId) à appliquer aux records shop×item
// agrégés (predictedRecords) pour répercuter une fenêtre temporelle sans
// rejouer la pipeline de scoring.
// ---------------------------------------------------------------------------

/**
 * @param {Array<object>} timelineData
 * @param {{ start:any, end:any }} range
 * @returns {{ ratios: Map<string,{rev:number,qty:number,tx:number}>, hasAnyTimeline:boolean }}
 */
export function computeWindowRatios(timelineData, range) {
  const ratios = new Map()
  if (!Array.isArray(timelineData) || timelineData.length === 0) {
    return { ratios, hasAnyTimeline: false }
  }
  const full = new Map()
  const win = new Map()
  for (const r of timelineData) {
    if (!r) continue
    const key = `${r.shopId || r.elementId || ''}::${r.menuItemId || r.mappedMenuItemId || ''}`
    let f = full.get(key)
    if (!f) {
      f = { rev: 0, qty: 0, tx: 0 }
      full.set(key, f)
    }
    const rev = Number(r.totalRevenue ?? r.revenue) || 0
    const qty = Number(r.totalQuantity ?? r.quantity) || 0
    const tx = Number(r.transactionCount ?? r.transactions) || 0
    f.rev += rev
    f.qty += qty
    f.tx += tx
    if (isMinuteInRange(r.minute, range)) {
      let w = win.get(key)
      if (!w) {
        w = { rev: 0, qty: 0, tx: 0 }
        win.set(key, w)
      }
      w.rev += rev
      w.qty += qty
      w.tx += tx
    }
  }
  for (const [key, f] of full.entries()) {
    const w = win.get(key) || { rev: 0, qty: 0, tx: 0 }
    ratios.set(key, {
      rev: f.rev > 0 ? w.rev / f.rev : 0,
      qty: f.qty > 0 ? w.qty / f.qty : 0,
      tx: f.tx > 0 ? w.tx / f.tx : 0,
    })
  }
  return { ratios, hasAnyTimeline: true }
}

/**
 * Applique une fenêtre temporelle sur des records shop×item en se basant sur
 * la timeline pré-traitée correspondante. Si la fenêtre est vide → renvoie
 * la référence d'origine (no-op, préserve les caches downstream).
 *
 * @param {Array<object>} predictedRecords
 * @param {Array<object>} timelineData
 * @param {{ start:any, end:any }} range
 * @returns {Array<object>}
 */
export function windowPredictedRecords(predictedRecords, timelineData, range) {
  if (!Array.isArray(predictedRecords) || predictedRecords.length === 0) return predictedRecords || []
  if (!hasActiveRange(range)) return predictedRecords
  const { ratios, hasAnyTimeline } = computeWindowRatios(timelineData, range)
  if (!hasAnyTimeline) return predictedRecords
  return predictedRecords.map((rec) => {
    const key = `${rec.elementId || rec.shopId || ''}::${rec.menuItemId || ''}`
    const r = ratios.get(key)
    if (!r) {
      return { ...rec, quantity: 0, revenue: 0, transactionCount: 0 }
    }
    return {
      ...rec,
      quantity: (rec.quantity || 0) * r.qty,
      revenue: (rec.revenue || 0) * r.rev,
      transactionCount: (rec.transactionCount || 0) * r.tx,
    }
  })
}
