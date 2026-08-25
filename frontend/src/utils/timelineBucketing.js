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
// Minute DATÉE en heure murale locale : "YYYY-MM-DDTHH:MM" (BUG-351-01, servie
// par `minuteLocal` de GET /spaces/:id/event-timeline). Un suffixe (secondes,
// "Z", millisecondes) est toléré : seules la date et l'heure sont lues.
const DATED_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
// Fenêtre d'avant-match tolérée quand on doit deviner le JOUR d'un coup d'envoi
// connu à l'heure seule : au-delà de 6 h avant, la vente est réputée appartenir
// au lendemain (continuation de l'événement) plutôt qu'à une prévente.
const PRE_SHOW_WINDOW_MINUTES = 6 * 60

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

// ---------------------------------------------------------------------------
// Minutes DATÉES (BUG-351-01).
//
// `minute` (HH:MM) ne peut pas ordonner un événement qui franchit minuit : une
// vente à 00h30 qui prolonge le match de la veille se trie avant 19h00 et se
// confond avec une vente à 00h30 du jour même. Les fonctions ci-dessous
// travaillent sur la minute DATÉE quand elle est disponible ; TOUT le reste du
// module garde son comportement HH:MM d'origine (aucun consommateur existant
// n'est impacté).
// ---------------------------------------------------------------------------

/**
 * Décompose une minute datée "YYYY-MM-DDTHH:MM" (suffixe toléré).
 *
 * @param {string|number|null|undefined} value
 * @returns {{ dateKey: string, minuteOfDay: number, epochMinutes: number }|null}
 *   null si la valeur ne porte pas de date (HH:MM nu, nombre, vide).
 */
export function parseDatedMinute(value) {
  if (value == null || typeof value === 'number') return null
  const m = DATED_RE.exec(String(value))
  if (!m) return null
  const [, y, mo, d, hh, mm] = m
  const minuteOfDay = Number(hh) * 60 + Number(mm)
  // UTC : la valeur est déjà une heure MURALE locale de l'espace (convertie côté
  // serveur). La relire en UTC évite qu'un fuseau navigateur la décale encore.
  const epochMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm))
  return {
    dateKey: `${y}-${mo}-${d}`,
    minuteOfDay,
    epochMinutes: Math.round(epochMs / 60000),
  }
}

/**
 * Clé de bucket DATÉE et triable ("YYYY-MM-DDTHH:MM"), ou null si la valeur ne
 * porte pas de date. Même granularité que `bucketMinute`.
 *
 * @param {string|number} value
 * @param {number} [bucketMinutes=1]
 * @returns {string|null}
 */
export function bucketDatedMinute(value, bucketMinutes = 1) {
  const parsed = parseDatedMinute(value)
  if (!parsed) return null
  const size = Number(bucketMinutes) > 0 ? Number(bucketMinutes) : 1
  const bucketed = Math.floor(parsed.minuteOfDay / size) * size
  return `${parsed.dateKey}T${formatMinute(bucketed)}`
}

/**
 * Minutes écoulées depuis le coup d'envoi (`showTime`) de l'événement — la
 * grandeur d'alignement d'Event Predict (précision owner 2026-08-21) : une
 * transaction survenue 5 h après le coup d'envoi d'un match de référence doit
 * peser 5 h après le coup d'envoi du match prédit, donc le lendemain si le
 * coup d'envoi est à 21h.
 *
 * Négatif avant le coup d'envoi (ventes d'avant-match), > 1440 si l'événement
 * déborde de minuit. JAMAIS normalisé sur 24 h : c'est cette normalisation qui
 * ramenait les ventes d'après minuit en tête de courbe.
 *
 * @param {string|number} value        minute datée, ou HH:MM (repli même jour).
 * @param {string|number|null} showTime  coup d'envoi : "HH:MM" ou minute datée.
 * @returns {number|null} null si la minute est illisible.
 */
export function minutesSinceShow(value, showTime) {
  const show = parseDatedMinute(showTime)
  const point = parseDatedMinute(value)
  if (point && show) return point.epochMinutes - show.epochMinutes

  const showMinutes = show ? show.minuteOfDay : parseMinuteToken(showTime)
  const pointMinutes = point ? point.minuteOfDay : parseMinuteToken(value)
  if (pointMinutes == null) return null
  if (showMinutes == null) return pointMinutes

  const diff = pointMinutes - showMinutes
  // Point DATÉ, coup d'envoi seulement horaire ("21:00") : le jour du coup
  // d'envoi n'est pas connu, on le déduit de la fenêtre plausible d'un
  // événement. Une vente lue à 02:00 pour un coup d'envoi à 21:00 donne −19 h ;
  // c'est en réalité +5 h, le lendemain. Seuil à −6 h : au-delà, c'est une vente
  // d'avant-match (ouverture des portes, prévente), qu'on garde négative.
  if (point && diff < -PRE_SHOW_WINDOW_MINUTES) return diff + 1440
  return diff
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
  // Bornes DATÉES (BUG-351-01) : quand la fenêtre ET le point portent une date,
  // on compare des instants — sinon une borne de fin à 01:00 le lendemain
  // exclurait toute la soirée au lieu de l'inclure.
  const datedStart = parseDatedMinute(range.start)
  const datedEnd = parseDatedMinute(range.end)
  const datedPoint = parseDatedMinute(minute)
  if (datedPoint && (datedStart || datedEnd)) {
    if (datedStart && datedPoint.epochMinutes < datedStart.epochMinutes) return false
    if (datedEnd && datedPoint.epochMinutes > datedEnd.epochMinutes) return false
    return true
  }
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
    // `minuteLocal` (minute DATÉE, BUG-351-01) sert de clé de bucket et de tri ;
    // `minute` (HH:MM) reste la valeur d'affichage lue par tous les consommateurs.
    // Sans la date, deux ventes à 00h30 de deux jours différents fusionnaient.
    const rawMinute = r.minute ?? r.time ?? r.timestamp ?? r.createdAt
    // BUG-364-01 : lignes SUMMARY (montage sans grain minute) — aucune clé temporelle.
    // Acceptées avec minute=null (un seul bucket par event × shop × produit) au lieu
    // d'être jetées : l'ancien skip ne visait que les clés temporelles INVALIDES.
    const hasTimeKey = rawMinute != null
    const minute = hasTimeKey ? bucketMinute(rawMinute, bucketSize) : null
    if (hasTimeKey && !minute) continue
    const minuteLocal = hasTimeKey ? bucketDatedMinute(r.minuteLocal ?? rawMinute, bucketSize) : null

    const eventId = r.eventId || opts.eventId || null
    const configurationVersionId =
      r.configurationVersionId || r.configVersionId || r.versionId || opts.configurationVersionId || null
    const scenarioId = r.predictionScenarioId || r.scenarioId || opts.scenarioId || null
    const rawShopId = r.shopId || r.elementId || r.shop || null
    // Identité ARTICLE du bucket (sert aux champs menuItemId/mappedMenuItemId et au
    // lookup de coût, tous deux indexés sur MenuItem) — inchangée.
    const rawProductId =
      r.productId || r.menuItemId || r.mappedMenuItemId || r.itemId || null
    // BUG-353-01 : clé de REGROUPEMENT distincte, `weezeventProductId` en tête. Les lignes
    // d'`event-timeline` portent `weezeventProductId` + `menuItemId` mais jamais
    // `productId` : regrouper sur `rawProductId` repliait donc sur `menuItemId`, ce qui
    // (1) fusionnait deux produits Weezevent distincts mappés au même MenuItem et
    // (2) effondrait toutes les ventes NON mappées (`menuItemId = null`) dans un seul
    // bucket `''` par minute × PdV. La clé sépare, l'identité reste MenuItem.
    const rawProductGroupId = r.weezeventProductId || rawProductId
    const shopId =
      groupBy === 'shop' || groupBy === 'shopProduct'
        ? rawShopId
        : null
    const productId =
      groupBy === 'product' || groupBy === 'shopProduct'
        ? rawProductId
        : null
    const productGroupKey =
      groupBy === 'product' || groupBy === 'shopProduct'
        ? rawProductGroupId
        : null

    const key = [
      minuteLocal || minute || '',
      eventId || '',
      configurationVersionId || '',
      scenarioId || '',
      shopId || '',
      productGroupKey || '',
    ].join('|')
    let agg = byKey.get(key)
    if (!agg) {
      agg = {
        minute,
        minuteLocal,
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

    // BUG-364-01 : repli `revenueHt` — les lignes summary ne portent plus le doublon
    // `revenue` (dégraissage, plan étape 5.3).
    const rev = Number(r.totalRevenue ?? r.revenue ?? r.revenueHt) || 0
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
  // BUG-364-01 — `opts.lean` : sur le chemin ANALYSE (useAnalyseItemRecords, ~77 events
  // résidents en mémoire), les clés propres à Predict/Stockup/Inventaire valent
  // structurellement 0/null/undefined (les lignes brutes event-timeline ne portent
  // aucune prédiction) mais gonflaient CHAQUE ligne de 9 propriétés mortes. On les
  // omet : les consommateurs font tous `Number(x) || 0` / vérité / `typeof` —
  // `undefined` y est équivalent. Les chemins Predict/Stockup (usePredictiveTimeline,
  // EventPredictView) n'activent PAS `lean` et gardent la forme complète.
  const lean = !!opts.lean
  for (const agg of byKey.values()) {
    out.push({
      minute: agg.minute,
      minuteLocal: agg.minuteLocal || null,
      eventId: agg.eventId,
      ...(lean ? {} : { configurationVersionId: agg.configurationVersionId, scenarioId: agg.scenarioId }),
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
      ...(lean
        ? {}
        : {
            predictedRevenue: agg.predictedRevenue,
            predictedQuantity: agg.predictedQuantity,
            stockupQuantity: agg.stockupQuantity,
            inventoryQuantity: agg.inventoryQuantity,
            discardedQuantity: agg.discardedQuantity,
            isPredictive: agg.isPredictive || undefined,
            confidenceScore: agg._confCount > 0 ? agg._confSum / agg._confCount : null,
          }),
    })
  }
  return out.sort((a, b) => {
    // Tri sur la minute DATÉE quand elle existe (BUG-351-01) : trier sur HH:MM
    // remontait les ventes d'après minuit en tête de courbe. Repli HH:MM pour
    // les sources sans date (prédictions, stockup, inventaire).
    const cmp = String(a.minuteLocal || a.minute).localeCompare(String(b.minuteLocal || b.minute))
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
    // Minute DATÉE en priorité (BUG-351-01) : une fenêtre qui franchit minuit
    // ne peut pas être évaluée sur une heure murale seule.
    if (range && !isMinuteInRange(r.minuteLocal ?? r.minute, range)) return false
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
    // BUG-364-01 : repli `revenueHt` — les lignes summary ne portent plus le doublon
    // `revenue` (dégraissage, plan étape 5.3).
    const rev = Number(r.totalRevenue ?? r.revenue ?? r.revenueHt) || 0
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
