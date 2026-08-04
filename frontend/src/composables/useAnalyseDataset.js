/**
 * useAnalyseDataset — met à plat, en tables normalisées, les chiffres derrière
 * chaque graphique de la page Analyse.
 *
 * Une seule source, deux consommateurs :
 *   • `useAnalyseExport` (classeur .xlsx / fichier .csv) ;
 *   • l'assistant « Data analysis » (`utils/analyseAssistant`), via le store.
 *
 * ── Pourquoi ici et pas dans chaque graphique ────────────────────────────────
 * Les composants ne détiennent que des valeurs d'AFFICHAGE (« 1 234,56 € »),
 * inertes dans un tableur comme dans un calcul d'assistant. Et la moitié d'entre
 * eux est démontée par défaut (`v-if` : Perf PdV, graphe by-event, timeline) —
 * les interroger par `defineExpose` produirait des tables manquantes en silence.
 * Les refs sources, elles, sont calculées quoi qu'il arrive.
 *
 * ── Chargement en dernier ────────────────────────────────────────────────────
 * La construction est planifiée en `requestIdleCallback` APRÈS la fin des trois
 * chargements de la page, et n'émet AUCUNE requête réseau : elle n'agrège que des
 * records déjà en mémoire. Un clic « Télécharger » en avance de phase appelle
 * `ensureDataset()`, qui construit sur-le-champ — l'export ne dépend jamais du
 * préchargement.
 *
 * ── Fraîcheur ───────────────────────────────────────────────────────────────
 * Chaque dataset porte la `signature` des filtres qui l'ont produit. L'assistant
 * la compare avant usage et retombe sur son chemin historique si elle diverge :
 * répondre sur des chiffres périmés serait pire que ne pas répondre du tout.
 */

import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import {
  groupBy,
  pctOf,
  round2,
  buildShopPerfRows,
  buildBaseShopRows,
  buildItemsByShopRows,
  itemLevelTotalsByEvent,
} from '@/utils/analyseAggregations'
import { resolveShopType, resolveItemType, resolveItemCategory, resolveItemName } from '@/utils/analyseDimensions'
import { UNATTACHED_SHOP_KEY, UNATTACHED_ITEM_KEY } from '@/utils/analyseReconciliation'
import { groupBasketsByCombo } from '@/utils/transactionBaskets'
import { SHOP_TYPE_LABEL_KEYS } from '@/constants/shopTypes'

/** Combinaisons nommées avant le bucket « Autres » — même cap que le graphique. */
const BASKET_TOP_N = 19
/** Absorbe les rafales de changement de filtres (drag de curseur, clics en série). */
const DEBOUNCE_MS = 300

const scheduleIdle =
  typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
    ? (fn) => window.requestIdleCallback(fn, { timeout: 2000 })
    : (fn) => setTimeout(fn, 0)
const cancelIdle =
  typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function'
    ? (id) => window.cancelIdleCallback(id)
    : (id) => clearTimeout(id)

export function useAnalyseDataset(sources) {
  const store = useStore()
  // `locale` entre dans la signature : les titres de tables et les en-têtes de
  // colonnes sont résolus À LA CONSTRUCTION. Sans lui, un dataset bâti en
  // français resterait valide après un passage en anglais, et le classeur
  // sortirait des onglets français dans une interface anglaise.
  const { t, locale } = useI18n()

  const {
    spaceName,
    filters,
    activeFilterChips,
    filteredEvents,
    filteredRecords,
    chartRecords,
    articleRecords,
    itemLevelRecords,
    filteredBaskets,
    filteredEventAggregates,
    filteredTimelineData,
    timelineHeaderLabel,
    metrics,
    itemSummary,
    shopPerformance,
    isPredictMode,
    busy,
  } = sources

  const building = ref(false)

  // ─── Signature ──────────────────────────────────────────────────────────
  // Ce qui, en changeant, rend un dataset déjà construit faux. Les longueurs des
  // tableaux sources suffisent à capter un enrichissement arrivé après coup
  // (item-level, paniers) sans avoir à les hacher entièrement.
  const signature = computed(() => {
    const f = filters.value || {}
    const dims = [
      f.selectedEventIds,
      f.selectedShopIds,
      f.selectedShopTypes,
      f.selectedShopAreas,
      f.selectedMenuItemIds,
      f.selectedMenuItemTypes,
      f.selectedMenuItemCategories,
      f.selectedEventCategories,
      f.selectedEventTypes,
    ]
      .map((arr) => [...(arr || [])].sort().join('|'))
      .join('~')
    return [
      locale.value,
      store.state.analyse.selectedToolbox || 'analyse',
      f.timeRange || '',
      f.comparisonMode || '',
      JSON.stringify(f.selectedTimeRange || null),
      dims,
      (chartRecords.value || []).length,
      (articleRecords.value || []).length,
      (filteredBaskets.value || []).length,
      (filteredEvents.value || []).length,
      (filteredTimelineData.value || []).length,
      // BUG-298-01 : la costMap arrive en phase 2 (useSpaceData). Sans elle dans
      // la signature, un dataset construit avant l'enrichissement resterait
      // « valide » avec ses colonnes Coût / Marge vides.
      Object.keys(store.state.analyse.menuItemCostMap || {}).length,
      shopPerformance?.enriched?.value ? 'perf' : 'base',
    ].join('§')
  })

  // ─── Helpers de table ───────────────────────────────────────────────────

  const col = (key, label, format) => ({ key, label, format })

  /** Table d'un donut : libellé + CA + quantité + part. */
  function donutTable(key, title, records, keyFn, labelFn = null) {
    const revenue = groupBy(records, keyFn, (r) => r.revenue || 0, null, labelFn)
    const quantity = groupBy(records, keyFn, (r) => r.quantity || 0, null, labelFn)
    const qtyByKey = new Map(quantity.keys.map((k, i) => [k, quantity.values[i]]))
    const total = revenue.values.reduce((a, v) => a + v, 0)
    return {
      key,
      title,
      columns: [
        col('label', t('anExportColLabel')),
        col('revenue', t('anRevenue'), 'currency'),
        col('quantity', t('anQuantity'), 'int'),
        col('share', t('anExportColShare'), 'percent'),
      ],
      rows: revenue.keys.map((k, i) => ({
        label: revenue.labels[i],
        revenue: round2(revenue.values[i]),
        quantity: Math.round(qtyByKey.get(k) || 0),
        share: pctOf(revenue.values[i], total),
      })),
    }
  }

  /** Table d'un donut de paniers : combinaison + transactions + part. */
  function basketTable(key, title, records, comboOf) {
    const grouped = groupBasketsByCombo(records, comboOf, {
      topN: BASKET_TOP_N,
      unmatchedLabel: t('anUnmatchedItems'),
      othersLabel: (n) => `${t('anTxMixOthers')} (${n} ${t('anTxMixCombos')})`,
      palette: [''],
    })
    const total = grouped.values.reduce((a, v) => a + v, 0)
    return {
      key,
      title,
      columns: [
        col('combo', t('anExportColCombo')),
        col('transactions', t('anMetricTransactions'), 'int'),
        col('share', t('anExportColShare'), 'percent'),
      ],
      rows: grouped.labels.map((label, i) => ({
        combo: label,
        transactions: Math.round(grouped.values[i]),
        share: pctOf(grouped.values[i], total),
      })),
    }
  }

  /** Libellé localisé d'un type de PdV, composites (« food, beverages ») compris. */
  function shopTypeLabel(key) {
    if (!key) return ''
    if (key === UNATTACHED_SHOP_KEY) return t('anUnmatchedShops')
    return String(key)
      .split(', ')
      .map((token) => (SHOP_TYPE_LABEL_KEYS[token] ? t(SHOP_TYPE_LABEL_KEYS[token]) : token))
      .join(' & ')
  }

  const itemDimLabel = (key) => (key === UNATTACHED_ITEM_KEY ? t('anUnmatchedItems') : key)

  // ─── Tables ─────────────────────────────────────────────────────────────

  function buildFiltersTable(notes) {
    const f = filters.value || {}
    const chips = (activeFilterChips.value || []).map((c) => c.label).filter(Boolean)
    const rows = [
      { parameter: t('anExportFilterSpace'), value: spaceName.value },
      { parameter: t('anExportFilterPeriod'), value: String(f.timeRange || '') },
      { parameter: t('anExportFilterComparison'), value: String(f.comparisonMode || '—') },
      { parameter: t('anExportFilterEvents'), value: String((filteredEvents.value || []).length) },
      { parameter: t('anExportFilterActive'), value: chips.length ? chips.join(' · ') : '—' },
      {
        parameter: t('anExportFilterMode'),
        value: isPredictMode.value ? t('anExportModePredict') : t('anExportModeAnalyse'),
      },
      { parameter: t('anExportFilterGeneratedAt'), value: new Date().toLocaleString() },
    ]
    // Avertissements EN TÊTE : un classeur se transfère, et rien n'y rappelle
    // sinon que les chiffres sont prévisionnels ou partiels.
    for (const note of notes) rows.unshift({ parameter: '⚠', value: note })
    return {
      key: 'filters',
      title: t('anExportSheetFilters'),
      columns: [col('parameter', t('anExportColParameter')), col('value', t('anExportColValue'))],
      rows,
    }
  }

  function buildKpiTable() {
    const m = metrics
    const s = itemSummary.value || {}
    const variations = s.variations || {}
    const yoy = s.variationsYoY || {}
    const rev = m.displayRevenue?.value ?? 0
    const trans = m.displayTransactions?.value ?? 0
    const att = m.displayAttendees?.value ?? 0

    // Une colonne Excel ne porte qu'un format : les euros, les comptes et les
    // pourcentages ne peuvent pas cohabiter dans « Valeur ». L'unité vit donc
    // dans sa propre colonne texte, et « Valeur » ne contient que des Number nus.
    const line = (label, value, unit, key) => ({
      // Clé stable non localisée pour les consommateurs programmatiques
      // (assistant local) — absente de `columns`, donc jamais sérialisée
      // dans les exports.
      metric: key,
      indicator: label,
      value: round2(value),
      unit,
      deltaPrev: numOrNull(variations[key]),
      deltaYoy: numOrNull(yoy[key]),
    })

    return {
      key: 'kpi',
      title: t('anExportSheetKpi'),
      columns: [
        col('indicator', t('anExportColIndicator')),
        col('value', t('anExportColValue'), 'number'),
        col('unit', t('anExportColUnit')),
        col('deltaPrev', t('anExportColDeltaPrev'), 'percent'),
        col('deltaYoy', t('anExportColDeltaYoy'), 'percent'),
      ],
      rows: [
        line(t('anHeaderKpiRevenue'), rev, '€', 'revenue'),
        line(t('anHeaderKpiAvgPerEvent'), m.displayAvgRevenue?.value ?? 0, '€', 'avgRevenuePerEvent'),
        line(t('anHeaderKpiCost'), m.displayCost?.value ?? 0, '€', 'cost'),
        line(t('anHeaderKpiTransactions'), trans, 'txn', 'transactions'),
        line(t('anHeaderKpiBasket'), trans ? rev / trans : 0, '€', 'avgTransaction'),
        line(t('anHeaderKpiAttendees'), att, 'pax', 'attendees'),
        line(t('anHeaderKpiTransformation'), att ? (trans / att) * 100 : 0, '%', 'transferRate'),
        line(t('anHeaderKpiPerCap'), m.displayPerCapita?.value ?? 0, '€', 'perCapita'),
      ],
    }
  }

  function buildShopPerfTable() {
    const events = filteredEvents.value || []
    if (!events.length) return null

    // On n'appelle JAMAIS `shopPerformance.enrich()` d'ici : cette même référence
    // alimente le leaderboard de la colonne droite (`SummaryPanel :shop-rates`),
    // toujours monté. L'enrichir ferait apparaître une colonne txn/min à l'écran
    // au clic sur « Télécharger » — ou pire, pendant le préchargement en idle.
    const enriched = shopPerformance?.enriched?.value && (shopPerformance?.shops?.value || []).length
    if (enriched) {
      return {
        key: 'shopPerformance',
        title: t('anShopPerfTitle'),
        columns: [
          col('shop', t('anShopPerfShopName')),
          col('revenue', t('anShopPerfTotalRevenue'), 'currency'),
          col('transactions', t('anMetricTransactions'), 'int'),
          col('rate', t('anExportColRate'), 'number'),
          col('firstHour', t('anShopPerfFirstHour'), 'number'),
          col('peak', t('anExportColPeak'), 'number'),
          col('events', t('anEvents'), 'int'),
          col('minutes', t('anShopPerfOperatingMinutes').replace(':', '').trim(), 'int'),
        ],
        rows: buildShopPerfRows(shopPerformance.shops.value, {
          shop: 'shop',
          revenue: 'revenue',
          transactions: 'transactions',
          rate: 'rate',
          firstHour: 'firstHour',
          peak: 'peak',
          events: 'events',
          minutes: 'minutes',
        }),
      }
    }

    const rows = buildBaseShopRows(filteredRecords.value || [], {
      shop: 'shop',
      revenue: 'revenue',
      transactions: 'transactions',
      events: 'events',
    })
    if (!rows.length) return null
    return {
      key: 'shopPerformance',
      title: t('anShopPerfTitle'),
      partial: true,
      columns: [
        col('shop', t('anShopPerfShopName')),
        col('revenue', t('anShopPerfTotalRevenue'), 'currency'),
        col('transactions', t('anMetricTransactions'), 'int'),
        col('events', t('anEvents'), 'int'),
      ],
      rows,
    }
  }

  function buildEventAggregatesTable() {
    // BUG-298-01 : `filteredEventAggregates` est bâti sur du shop-level, dont le
    // `cost` est nul par construction (aucun `menuItemId` sur ce grain). Le coût
    // par event est donc recalculé ici depuis l'item-level, avec la formule du
    // KPI. Colonnes ajoutées SEULEMENT si cet item-level est chargé : mieux vaut
    // pas de colonne qu'une colonne « 0 € » qui se lirait comme un chiffre.
    const itemTotals = itemLevelTotalsByEvent(
      itemLevelRecords?.value || [],
      store.state.analyse.menuItemCostMap || {},
    )
    const withCost = itemTotals.size > 0
    // Titre FIXE et non calé sur `byEventMetric` : la table porte TOUTES les
    // métriques par événement, pas seulement celle que le drill-down affiche.
    // Un nom qui changerait d'un export à l'autre selon un état d'écran
    // transitoire rendrait deux fichiers incomparables.
    return {
      key: 'byEvent',
      title: `${t('anMetricCA')} — ${t('anEvents')}`,
      columns: [
        col('event', t('anEvents')),
        col('date', t('anExportColDate')),
        col('revenue', t('anRevenue'), 'currency'),
        ...(withCost
          ? [col('cost', t('anMetricCost'), 'currency'), col('margin', t('anKpiCardMargin'), 'percent')]
          : []),
        col('transactions', t('anMetricTransactions'), 'int'),
        col('attendees', t('anExportColAttendees'), 'int'),
        col('basket', t('anExportColBasket'), 'currency'),
      ],
      rows: (filteredEventAggregates.value || [])
        .slice()
        .sort((a, b) => b.revenue - a.revenue)
        .map((e) => {
          const row = {
            event: e.eventName,
            date: e.eventDate || '',
            revenue: round2(e.revenue),
            transactions: Math.round(e.transactions || 0),
            attendees: Math.round(e.attendees || 0),
            basket: round2(e.avgTransaction),
          }
          if (withCost) {
            // Event hors du cap de fetch item-level (useAnalyseItemRecords) :
            // cellules VIDES, jamais 0 — un coût absent n'est pas un coût nul.
            const totals = itemTotals.get(e.eventId) || null
            row.cost = totals ? round2(totals.cost) : null
            // Marge calculée sur le CA ITEM-LEVEL, pas sur la colonne `revenue`
            // (shop-level) : croiser les deux grains sortirait des marges
            // négatives ou > 100 % dès qu'ils divergent.
            row.margin =
              totals && totals.revenue
                ? round2(((totals.revenue - totals.cost) / totals.revenue) * 100)
                : null
          }
          return row
        }),
    }
  }

  function buildRevenueByShopEventTable() {
    const map = new Map()
    for (const r of chartRecords.value || []) {
      if (!r?.shopName) continue
      const key = `${r.eventId}§${r.shopName}`
      let e = map.get(key)
      if (!e) {
        e = { event: r.eventName || r.eventId || '—', shop: r.shopName, revenue: 0, quantity: 0 }
        map.set(key, e)
      }
      e.revenue += r.revenue || 0
      e.quantity += r.quantity || 0
    }
    return {
      key: 'revenueByShopEvent',
      title: t('anExportSheetRevByShopEvent'),
      columns: [
        col('event', t('anEvents')),
        col('shop', t('anTblShopXlsShop')),
        col('revenue', t('anRevenue'), 'currency'),
        col('quantity', t('anQuantity'), 'int'),
      ],
      rows: [...map.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .map((e) => ({ ...e, revenue: round2(e.revenue), quantity: Math.round(e.quantity) })),
    }
  }

  function buildLeaderboardTable() {
    const rank = (dimension, entries) =>
      entries.slice(0, 10).map((e, i) => ({
        rank: i + 1,
        dimension,
        entity: e.name,
        value: round2(e.revenue),
      }))

    const shops = groupBy(chartRecords.value, (r) => r.shopName, (r) => r.revenue || 0)
    const events = groupBy(chartRecords.value, (r) => r.eventName || r.eventId, (r) => r.revenue || 0)
    const items = groupBy(
      (itemLevelRecords.value || []).length ? itemLevelRecords.value : articleRecords.value,
      resolveItemName,
      (r) => r.revenue || 0,
    )
    const asEntries = (g) => g.labels.map((name, i) => ({ name, revenue: g.values[i] }))

    return {
      key: 'leaderboard',
      title: t('anExportSheetLeaderboard'),
      columns: [
        col('rank', t('anExportColRank'), 'int'),
        col('dimension', t('anExportColDimension')),
        col('entity', t('anExportColEntity')),
        col('value', t('anRevenue'), 'currency'),
      ],
      rows: [
        ...rank(t('anShopPerformance'), asEntries(shops)),
        ...rank(t('anEventsPerformance'), asEntries(events)),
        ...rank(t('anItemPerformance'), asEntries(items)),
      ],
    }
  }

  function buildTimelineTable() {
    const recs = filteredTimelineData.value || []
    if (!recs.length) return null
    const label = timelineHeaderLabel?.value || ''
    return {
      key: 'timeline',
      title: `${t('anTimelineTitlePrefix')} ${label}`.trim(),
      columns: [
        col('minute', t('anExportColMinute')),
        col('shop', t('anTblShopXlsShop')),
        col('item', t('anTblShopXlsItem')),
        col('quantity', t('anQuantity'), 'int'),
        col('revenue', t('anRevenue'), 'currency'),
      ],
      rows: recs.map((r) => ({
        minute: r.minute || '',
        shop: r.shopName || '',
        item: resolveItemName(r) || '',
        quantity: Math.round(r.quantity || 0),
        revenue: round2(r.revenue),
      })),
    }
  }

  function buildItemsByShopTable() {
    const h = {
      item: t('anTblShopXlsItem'),
      type: t('anTblShopXlsType'),
      category: t('anTblShopXlsCategory'),
      shop: t('anTblShopXlsShop'),
      quantity: t('anTblShopXlsQuantity'),
      revenue: t('anTblShopXlsRevenue'),
      events: t('anTblShopXlsEvents'),
    }
    const rows = buildItemsByShopRows(articleRecords.value || [], h, 'items')
    return {
      key: 'itemsByShop',
      title: t('anMenuItemsByShop'),
      columns: [
        col('item', h.item),
        col('type', h.type),
        col('category', h.category),
        col('shop', h.shop),
        col('quantity', h.quantity, 'int'),
        col('revenue', h.revenue, 'currency'),
        col('events', h.events, 'int'),
      ],
      // `buildItemsByShopRows` produit des objets clés PAR LIBELLÉ (contrat de
      // `json_to_sheet`, partagé avec le bouton du composant) — on les remappe sur
      // les clés de colonnes du dataset.
      rows: rows.map((r) => ({
        item: r[h.item],
        type: r[h.type],
        category: r[h.category],
        shop: r[h.shop],
        quantity: r[h.quantity],
        revenue: r[h.revenue],
        events: r[h.events],
      })),
    }
  }

  // ─── Construction ───────────────────────────────────────────────────────

  function buildTables() {
    const notes = []
    if (isPredictMode.value) notes.push(t('anExportPredictWarning'))

    const shopPerf = buildShopPerfTable()
    if (shopPerf?.partial) notes.push(t('anExportShopPerfPartial'))

    const chart = chartRecords.value || []
    const article = articleRecords.value || []
    const baskets = filteredBaskets.value || []

    const tables = [
      buildFiltersTable(notes),
      buildKpiTable(),
      shopPerf,
      buildEventAggregatesTable(),
      buildRevenueByShopEventTable(),
      donutTable('donutByShop', t('anPieByShopTitle'), chart, (r) => r.shopName),
      donutTable('donutByShopType', t('anPieByTypeTitle'), chart, resolveShopType, shopTypeLabel),
      donutTable('donutByShopArea', t('anPieByAreaTitle'), chart, (r) => r.shopArea),
      basketTable('basketByCategory', t('anTxMixByCategoryTitle'), baskets, (r) => r.categoryCombo),
      basketTable('basketByItem', t('anTxMixByItemTitle'), baskets, (r) => r.itemCombo),
      donutTable('topArticles', t('anTopItemsByRevenue'), article, resolveItemName),
      donutTable('articlesByType', t('anByItemType'), article, resolveItemType, itemDimLabel),
      donutTable('articlesByCategory', t('anByItemCategory'), article, resolveItemCategory, itemDimLabel),
      buildItemsByShopTable(),
      buildLeaderboardTable(),
      buildTimelineTable(),
    ]

    return tables.filter((tb) => tb && tb.rows.length)
  }

  /**
   * Construit et publie le dataset. Idempotent : si la signature courante est
   * déjà celle du dataset en store, on ne recalcule pas.
   * @returns {object} le dataset publié
   */
  function ensureDataset() {
    const current = store.state.analyse.dataset
    if (current && current.signature === signature.value) return current
    building.value = true
    try {
      const built = {
        signature: signature.value,
        spaceName: spaceName.value,
        isPredict: !!isPredictMode.value,
        tables: buildTables(),
      }
      store.commit('analyse/SET_ANALYSE_DATASET', built)
      return built
    } finally {
      building.value = false
    }
  }

  // ─── Planification en dernier ───────────────────────────────────────────

  let idleId = null
  let debounceId = null

  function cancelPending() {
    if (idleId != null) {
      cancelIdle(idleId)
      idleId = null
    }
    if (debounceId != null) {
      clearTimeout(debounceId)
      debounceId = null
    }
  }

  function schedule() {
    cancelPending()
    debounceId = setTimeout(() => {
      debounceId = null
      idleId = scheduleIdle(() => {
        idleId = null
        // Re-test au moment de l'exécution : entre la planification et l'idle,
        // un nouveau chargement a pu démarrer.
        if (busy.value) return
        ensureDataset()
      })
    }, DEBOUNCE_MS)
  }

  watch(
    [signature, busy],
    ([, isBusy]) => {
      // Le dataset publié ne doit jamais survivre au changement qui l'invalide :
      // l'assistant compare les signatures, mais un export déclenché entre les
      // deux lirait l'ancien.
      if (store.state.analyse.dataset) store.commit('analyse/SET_ANALYSE_DATASET', null)
      if (isBusy) {
        cancelPending()
        return
      }
      schedule()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    cancelPending()
    store.commit('analyse/SET_ANALYSE_DATASET', null)
  })

  return {
    building,
    signature,
    ensureDataset,
  }
}

/** Variation exploitable ou `null` — jamais `NaN` ni `Infinity` dans une cellule. */
function numOrNull(v) {
  return v == null || !Number.isFinite(v) ? null : round2(v)
}
