/**
 * Modèle de présentation de la page Cost tracking : tout ce que les composants affichent et qui se
 * déduit de useCostTracking (lignes du tableau, classements, derniers changements, pastilles de
 * filtres, état du graphique, notice de début de suivi, indicateurs de l'en-tête).
 */
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useCostTrackingFormat } from '@/composables/useCostTrackingFormat'
import { periodI18nKey } from '@/utils/costTrackingPeriod'
import { MAX_MARGIN_LINES } from '@/utils/costTrackingMarginCurve'
import { buildRows, rankVariations, recentChanges } from '@/utils/costTrackingRows'

const mean = (values) => {
  const v = values.filter((x) => typeof x === 'number')
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

/**
 * @param {ReturnType<import('@/composables/useCostTracking').useCostTracking>} ct
 */
export function useCostTrackingPageModel(ct) {
  const { t } = useI18n()
  const fmt = useCostTrackingFormat()

  const t1 = computed(() => ct.bounds.value[1])
  const rows = computed(() => buildRows(ct.lines.value, t1.value))
  // Classements complets : la colonne de droite n'en montre que 5, « Voir tout » déplie le reste.
  const rises = computed(() => rankVariations(rows.value, 'up', Infinity))
  const falls = computed(() => rankVariations(rows.value, 'down', Infinity))
  const changes = computed(() => recentChanges(ct.lines.value, 6))
  const versionsTotal = computed(() => rows.value.reduce((s, r) => s + r.versions, 0))

  const legendRows = computed(() =>
    ct.lines.value.map((l) => {
      const row = rows.value.find((r) => r.key === l.key)
      return {
        key: l.key,
        name: l.name,
        colorIndex: l.colorIndex,
        hidden: l.hidden,
        currentCost: row ? row.currentCost : null,
        variation: row ? row.variation : null,
      }
    }),
  )

  /** Courbe de marge : au plus 3 lignes affichées. */
  const canMargin = computed(
    () => ct.groupBy.value !== 'ingredient' && ct.lines.value.length > 0 && ct.lines.value.length <= MAX_MARGIN_LINES,
  )

  const chartState = computed(() => {
    if (ct.error.value) return 'error'
    if (!ct.response.value) return ct.loading.value ? 'loading' : 'empty'
    if (!ct.lines.value.length) return 'noScope'
    if (ct.isEmpty.value) return ct.trackingStartedAt.value ? 'empty' : 'notStarted'
    return 'ready'
  })

  const periodLabel = computed(() => {
    if (ct.period.value === 'custom') {
      const { from, to } = ct.range.value
      return `${fmt.dayYear(Date.parse(`${from}T12:00:00`))} - ${fmt.dayYear(Date.parse(`${to}T12:00:00`))}`
    }
    return t(periodI18nKey(ct.period.value))
  })

  const chips = computed(() => {
    const out = []
    const type = ct.typeOptions.value.find((o) => o.id === ct.typeId.value)
    const cat = ct.categoryOptions.value.find((o) => o.id === ct.categoryId.value)
    const art = ct.articleOptions.value.find((o) => o.id === ct.menuItemId.value)
    const ing = ct.ingredientOptions.value.find((o) => o.id === ct.ingredientId.value)
    if (type) out.push({ key: 'type', label: t('ctChipType').replace('{value}', type.name) })
    if (cat) out.push({ key: 'category', label: t('ctChipCategory').replace('{value}', cat.name) })
    if (art) out.push({ key: 'article', label: t('ctChipArticle').replace('{value}', art.name) })
    if (ing) out.push({ key: 'ingredient', label: t('ctChipIngredient').replace('{value}', ing.name) })
    return out
  })

  /** Notice « suivi actif depuis » : seulement si la période démarre avant le premier snapshot. */
  const notice = computed(() => {
    const started = ct.trackingStartedAt.value ? Date.parse(ct.trackingStartedAt.value) : NaN
    if (Number.isNaN(started) || ct.bounds.value[0] >= started) return null
    const first = (ct.response.value?.events || [])
      .map((e) => ({ name: e.name, t: Date.parse(e.referenceAt) }))
      .filter((e) => !Number.isNaN(e.t) && e.t >= started)
      .sort((a, b) => a.t - b.t)[0]
    return { startedAt: started, firstEvent: first || null }
  })

  /** « 28 catégories » : le niveau affiché dans le graphique (type, catégorie, article ou ingrédient). */
  const countLabel = computed(() => {
    const n = rows.value.length
    const keys = {
      type: ['ctNounTypeOne', 'ctNounTypeMany'],
      category: ['ctNounCategoryOne', 'ctNounCategoryMany'],
      ingredient: ['ctNounIngredientOne', 'ctNounIngredientMany'],
      article: ['ctNounArticleOne', 'ctNounArticleMany'],
    }
    const [one, many] = keys[ct.groupBy.value] || keys.article
    return `${n} ${t(n > 1 ? many : one)}`
  })

  /** Début du suivi, pour expliquer d'où vient la variation affichée dans les classements. */
  const sinceLabel = computed(() => {
    const started = ct.trackingStartedAt.value ? Date.parse(ct.trackingStartedAt.value) : NaN
    return Number.isNaN(started) ? '' : fmt.dayYear(started)
  })

  const headerKpis = computed(() => {
    const r = rows.value
    const avgVar = mean(r.map((x) => (x.variation ? x.variation.pct : null)))
    return [
      { label: t('ctKpiLines'), value: String(r.length), color: '#66bb6a' },
      { label: t('ctKpiVersions'), value: String(versionsTotal.value), color: '#ff6e4a' },
      { label: t('ctKpiAvgCost'), value: fmt.cost(mean(r.map((x) => x.currentCost))), color: '#ef4444' },
      { label: t('ctKpiVariation'), value: fmt.pct(avgVar), color: '#3b82f6' },
      { label: t('ctKpiAvgMargin'), value: fmt.pctPlain(mean(r.map((x) => x.marginEnd))), color: '#a855f7' },
      { label: t('ctKpiMarginEffect'), value: fmt.points(mean(r.map((x) => x.marginDelta))), color: '#06b6d4' },
      { label: t('ctKpiRises'), value: String(r.filter((x) => x.variation?.direction === 'up').length), color: '#14b8a6' },
      { label: t('ctKpiFalls'), value: String(r.filter((x) => x.variation?.direction === 'down').length), color: '#ec4899' },
    ]
  })

  /** Libellés type et catégorie de l'article ouvert dans le tiroir. */
  const selectedTags = computed(() => {
    const row = rows.value.find((r) => r.id === ct.selectedArticleId.value && r.kind === 'article')
    return row ? [row.typeName, row.categoryName].filter(Boolean) : []
  })

  return {
    rows, rises, falls, changes, versionsTotal, legendRows, canMargin, chartState,
    periodLabel, chips, notice, headerKpis, selectedTags, countLabel, sinceLabel,
  }
}
