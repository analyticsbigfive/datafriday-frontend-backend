/**
 * useRendementWidgets : widgets « rendement » de la page Analyse.
 *  - CA / TPE et CA / collaborateur (remplacent CA et Percap dans la grille)
 *  - Valorisation du stock Logistique actuel
 *  - lignes par event pour le graphe (métriques revenuePerTpe, revenuePerCollaborator, stockValue)
 *
 * Ne calcule rien dans AnalyseView : la vue lui donne ses sources (records, events,
 * filtres) et reçoit des view-models prêts à afficher. Règle BUG-350-01 : tant qu'une
 * source n'a pas répondu, `loading` vaut true et aucune valeur n'est fournie.
 */
import { computed } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrency } from '@/composables/useFormatters'
import { useArticleDimensions } from '@/composables/useArticleDimensions'
import { useStockValuation } from '@/composables/useStockValuation'
import { useEventValuations } from '@/composables/useEventValuations'
import { computeRevenuePerHeadcount, sumRevenueByEvent } from '@/utils/revenuePerHeadcount'
import { hasShopScopeFilter, STOCK_IGNORED_FILTERS } from '@/utils/stockValuationFilters'
import { hasArticleDimensionFilter } from '@/utils/articleDimensionFilter'

const NO_VALUE = '—'
const ARTICLE_FILTER_KEYS = ['selectedMenuItemIds', 'selectedMenuItemTypes', 'selectedMenuItemCategories']

/**
 * @param {Object} p
 * @param {import('vue').Ref<string|null>} p.spaceId
 * @param {import('vue').Ref<boolean>} p.canView permission stats.financial.view
 * @param {import('vue').Ref<Object>} p.filters
 * @param {import('vue').Ref<Array>} p.filteredEvents
 * @param {import('vue').Ref<Array>} p.kpiRecords records article (CA filtré)
 * @param {import('vue').Ref<Object|null>} p.eventRollupTotals non null = aucun filtre intra-event, CA = Event.revenue
 * @param {import('vue').Ref<string>} p.sourceState 'loading' | 'ready' | 'empty'
 * @param {import('vue').Ref<boolean>} p.stockReportOpen graphe « Valorisation stock » ouvert
 */
export function useRendementWidgets({
  spaceId, canView, filters, filteredEvents, kpiRecords, eventRollupTotals, sourceState, stockReportOpen,
}) {
  const store = useStore()
  const { t } = useI18n()
  const floorElements = computed(() => store.state.analyse.configShopContext?.floorElements || [])
  const { index: dimensionsIndex, status: dimensionsStatus } = useArticleDimensions()

  const isLoading = computed(() => sourceState.value === 'loading')
  const shopScopeFiltered = computed(() => hasShopScopeFilter(filters.value))
  const articleFiltered = computed(() => {
    const f = filters.value || {}
    return hasArticleDimensionFilter(f) || ARTICLE_FILTER_KEYS.some((k) => (f[k] || []).length > 0)
  })

  // ── CA par event : rollup Event.revenue quand aucun filtre ne découpe l'intérieur des events ──
  const revenueByEventId = computed(() => {
    if (eventRollupTotals.value) {
      return new Map((filteredEvents.value || []).map((e) => [String(e.id), Number(e.revenue) || 0]))
    }
    return sumRevenueByEvent(kpiRecords.value)
  })

  const headcount = (kind) => computed(() => computeRevenuePerHeadcount({
    events: filteredEvents.value,
    revenueByEventId: revenueByEventId.value,
    kind,
    shopScopeFiltered: shopScopeFiltered.value,
  }))
  const tpe = headcount('tpe')
  const collaborator = headcount('collaborator')

  // ── Stock actuel (B) et rapport par event (C) ──
  const stock = useStockValuation({
    spaceId, enabled: canView, filters, floorElements, dimensionsIndex, dimensionsStatus,
  })
  const eventValuations = useEventValuations({
    spaceId,
    enabled: computed(() => canView.value && stockReportOpen.value),
    events: filteredEvents,
    filters,
    floorElements,
  })

  function headcountCard(key, result, kind) {
    const r = result.value
    const labelKey = kind === 'tpe' ? 'anRdtSubTpe' : 'anRdtSubCollaborator'
    const subtext = t(r.blocked ? 'anRdtSubFilledOnly' : labelKey)
      .replace('{n}', r.filledCount)
      .replace('{m}', r.totalCount)
      .replace('{x}', r.headcount)
    let warning = null
    if (r.blocked) warning = t(kind === 'tpe' ? 'anRdtBlockedTpe' : 'anRdtBlockedCollaborator')
    else if (articleFiltered.value) warning = t('anRdtArticleFilterNote')
    return {
      key,
      loading: isLoading.value,
      value: r.blocked || r.value == null ? NO_VALUE : formatCurrency(r.value),
      subtext,
      warning,
    }
  }

  const filterLabel = (item) => t(item.labelKey)
  const stockCard = computed(() => {
    const d = stock.data.value
    // Le serveur répond « aucun PdV ne porte ces noms » par un total vide marqué : c'est un
    // filtre non résolu, pas un stock à 0.
    const serverUnresolved = !!(d?.unresolvedShopNames?.length && !(d.byElement || []).length)
    const s = stock.status.value === 'ready' && serverUnresolved ? 'unresolved' : stock.status.value
    const warnings = []
    const ignored = STOCK_IGNORED_FILTERS.filter((x) => stock.ignoredKeys.value.includes(x.key)).map(filterLabel)
    if (ignored.length) warnings.push(t('anRdtStockIgnoredFilter').replace('{x}', ignored.join(', ')))
    if (s === 'unresolved') {
      const unresolvedKeys = stock.unresolved.value.length ? stock.unresolved.value : ['shop']
      const labels = unresolvedKeys.map((u) => t(
        u === 'shop' ? 'anShops' : u === 'industrial' ? 'anFilterIndustrial' : 'anFilterSupplier',
      ))
      warnings.push(t('anRdtStockUnresolvedFilter').replace('{x}', labels.join(', ')))
    }
    if (s === 'error') warnings.push(t('anRdtStockError'))
    let subtext = t('anRdtStockSub')
    if (s === 'ready' && d) {
      if (!d.storagesExcluded && Number(d.storagesValue) > 0) {
        subtext = t('anRdtStockSubStorages').replace('{x}', formatCurrency(d.storagesValue))
      }
      if (Number(d.linesWithoutCost) > 0) {
        subtext += ` · ${t('anRdtStockLinesWithoutCost').replace('{n}', d.linesWithoutCost)}`
      }
    }
    return {
      key: 'stockValue',
      loading: s === 'loading' || s === 'idle',
      value: s === 'ready' && d ? formatCurrency(d.total) : NO_VALUE,
      subtext,
      warning: warnings.length ? warnings.join(' · ') : null,
    }
  })

  const cards = computed(() => ({
    revenuePerTpe: headcountCard('revenuePerTpe', tpe, 'tpe'),
    revenuePerCollaborator: headcountCard('revenuePerCollaborator', collaborator, 'collaborator'),
    stockValue: stockCard.value,
  }))

  // Entrées de la bande KPI mobile (on ajoute, rien n'est retiré).
  const mobileKpis = computed(() => {
    if (isLoading.value) return []
    const c = cards.value
    const entry = (kind, labelKey, card, color) => ({
      label: t(labelKey),
      kind,
      value: card.loading ? NO_VALUE : card.value,
      color,
      variation: null,
    })
    return [
      entry('revenue-per-tpe', 'anKpiCardRevenuePerTpe', c.revenuePerTpe, '#0EA5E9'),
      entry('revenue-per-collaborator', 'anKpiCardRevenuePerCollaborator', c.revenuePerCollaborator, '#EC4899'),
      entry('stock-value', 'anKpiCardStockValue', c.stockValue, '#10B981'),
    ]
  })

  // ── Données du graphe par event ──
  const chartMetrics = computed(() => {
    const rowsOf = (result) => new Map(result.rows.map((r) => [r.eventId, { value: r.value, reason: r.reason, draft: false }]))
    const headcountMetric = (result) => ({
      status: result.blocked ? 'blocked' : 'ready',
      rows: rowsOf(result),
    })
    const ev = eventValuations
    const evStatus = ev.status.value
    // Réponse serveur « noms de PdV introuvables » sur toutes les lignes : état non résolu.
    const serverUnresolved = ev.rows.value.length > 0 && ev.rows.value.every((r) => r.reason === 'unresolved-shop-names')
    const stockRows = new Map(ev.rows.value.map((r) => [String(r.eventId), { value: r.value, reason: r.reason, draft: !!r.isDraft }]))
    return {
      revenuePerTpe: headcountMetric(tpe.value),
      revenuePerCollaborator: headcountMetric(collaborator.value),
      stockValue: {
        status: serverUnresolved ? 'unresolved' : evStatus === 'ready' ? 'ready' : evStatus === 'unresolved' ? 'unresolved' : evStatus === 'error' ? 'error' : 'loading',
        rows: stockRows,
      },
    }
  })

  return { cards, mobileKpis, chartMetrics, dimensionsIndex, dimensionsStatus }
}
