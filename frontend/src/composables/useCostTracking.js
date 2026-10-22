/**
 * useCostTracking : logique de la page Cost tracking (filtres dépendants, période, mode
 * « Afficher par », chargement, sélection d'un article). La page ne parle qu'à ce composable ;
 * le store Vuex `costTracking` et l'API restent derrière.
 *
 * API : voir docs/chantiers/cost_tracking/COMPOSABLE_API.md
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useStore } from 'vuex'
import {
  buildLineSeries,
  buildChartModel,
  daysInRange,
  layoutEvents,
  periodBounds,
  rangeForDays,
  summarizeLines,
} from '@/utils/costTrackingSeries'

export const PERIOD_PRESETS = ['30', '90', '180', '365']
const DEFAULT_PERIOD = '180'
const MAX_DAYS = 366
const GROUP_VALUES = ['article', 'category', 'type', 'ingredient']

/** Aplatit le catalogue en listes types / catégories / articles avec leurs parents. */
export function flattenCatalog(catalog) {
  const types = []
  const categories = []
  const articles = []
  for (const t of catalog?.types || []) {
    types.push({ id: t.id, name: t.name })
    for (const c of t.categories || []) {
      categories.push({ id: c.id, name: c.name, typeId: t.id, typeName: t.name })
      for (const a of c.articles || []) {
        articles.push({ id: a.id, name: a.name, typeId: t.id, categoryId: c.id })
      }
    }
    for (const a of t.articlesWithoutCategory || []) {
      articles.push({ id: a.id, name: a.name, typeId: t.id, categoryId: null })
    }
  }
  for (const a of catalog?.articlesWithoutType || []) {
    articles.push({ id: a.id, name: a.name, typeId: null, categoryId: null })
  }
  return { types, categories, articles }
}

/** Mode « Afficher par » appliqué par le backend quand `groupBy` est absent. */
export function defaultGroupBy({ typeId, categoryId, menuItemId, ingredientId }) {
  if (menuItemId && ingredientId) return 'ingredient'
  if (menuItemId || categoryId) return 'article'
  if (typeId) return 'category'
  return 'article'
}

/**
 * @param {Object} opts
 * @param {import('vue').Ref<string|null>} opts.spaceId
 * @param {import('vue').Ref<boolean>} [opts.enabled] permission front.fb.costTracking
 */
export function useCostTracking({ spaceId, enabled = ref(true) }) {
  const store = useStore()

  // Période : preset ('30'|'90'|'180'|'365') ou 'custom' avec customFrom / customTo.
  const period = ref(DEFAULT_PERIOD)
  const customFrom = ref(null)
  const customTo = ref(null)
  const hiddenKeys = ref(new Set())
  const selectedArticleId = ref(null)

  // ---- Filtres (vivent dans le store pour survivre au démontage de la page)
  const filters = computed(() => store.getters['costTracking/filters'])
  const typeId = computed(() => filters.value.typeId)
  const categoryId = computed(() => filters.value.categoryId)
  const menuItemId = computed(() => filters.value.menuItemId)
  const ingredientId = computed(() => filters.value.ingredientId)
  const groupByOverride = computed(() => filters.value.groupBy)

  const flat = computed(() => flattenCatalog(store.getters['costTracking/catalog']))

  const typeOptions = computed(() => flat.value.types)
  const categoryOptions = computed(() =>
    flat.value.categories.filter((c) => !typeId.value || c.typeId === typeId.value),
  )
  const articleOptions = computed(() =>
    flat.value.articles.filter(
      (a) =>
        (!typeId.value || a.typeId === typeId.value) &&
        (!categoryId.value || a.categoryId === categoryId.value),
    ),
  )

  /** Lignes de recette de l'article filtré (ingrédients, composants, emballages, fils de combo). */
  const ingredientOptions = computed(() => (menuItemId.value ? store.state.costTracking.ingredientOptions : []))

  /**
   * Applique un changement de filtres. Garde-fous : l'ingrédient dépend de l'article (il est vidé
   * quand l'article change) et le mode « par ingrédient » disparaît sans article.
   */
  function patch(p) {
    const next = { ...filters.value, ...p }
    if (p.menuItemId !== undefined && p.menuItemId !== filters.value.menuItemId && p.ingredientId === undefined) {
      next.ingredientId = null
    }
    if (!next.menuItemId) {
      next.ingredientId = null
      if (next.groupBy === 'ingredient') next.groupBy = null
    }
    return store.dispatch('costTracking/setFilters', next)
  }

  /** Changer de type vide la catégorie et l'article s'ils n'appartiennent plus au type. */
  function setType(id) {
    const next = id || null
    const out = { typeId: next }
    const cat = flat.value.categories.find((c) => c.id === categoryId.value)
    if (next && cat && cat.typeId !== next) out.categoryId = null
    const art = flat.value.articles.find((a) => a.id === menuItemId.value)
    if (next && art && art.typeId !== next) out.menuItemId = null
    patch(out)
  }

  /** Choisir une catégorie fixe son type et vide l'article s'il n'en fait pas partie. */
  function setCategory(id) {
    const next = id || null
    const out = { categoryId: next }
    if (next) {
      const cat = flat.value.categories.find((c) => c.id === next)
      if (cat) out.typeId = cat.typeId
    }
    const art = flat.value.articles.find((a) => a.id === menuItemId.value)
    if (next && art && art.categoryId !== next) out.menuItemId = null
    patch(out)
  }

  /** Choisir un article fixe sa catégorie et son type (null si l'article n'en a pas). */
  function setArticle(id) {
    const next = id || null
    const out = { menuItemId: next }
    if (next) {
      const art = flat.value.articles.find((a) => a.id === next)
      if (art) {
        out.categoryId = art.categoryId
        out.typeId = art.typeId
      }
    }
    patch(out)
  }

  function setIngredient(id) {
    patch({ ingredientId: id || null })
  }

  /**
   * Clic sur une ligne de classement ou de tableau : descend d'un niveau en filtrant.
   * Type : affiche ses catégories ; catégorie : ses articles ; article : ses ingrédients ;
   * ingrédient : ne garde que cette ligne.
   */
  function drill(row) {
    if (!row?.id) return
    if (row.kind === 'type') patch({ typeId: row.id, categoryId: null, menuItemId: null, groupBy: null })
    else if (row.kind === 'category') {
      const cat = flat.value.categories.find((c) => c.id === row.id)
      patch({ categoryId: row.id, typeId: cat ? cat.typeId : typeId.value, menuItemId: null, groupBy: null })
    } else if (row.kind === 'article') {
      const art = flat.value.articles.find((a) => a.id === row.id)
      patch({
        menuItemId: row.id,
        categoryId: art ? art.categoryId : categoryId.value,
        typeId: art ? art.typeId : typeId.value,
        ingredientId: null,
        groupBy: 'ingredient',
      })
    } else if (row.kind === 'ingredient') patch({ ingredientId: row.id, groupBy: null })
  }

  function setGroupBy(value) {
    patch({ groupBy: GROUP_VALUES.includes(value) ? value : null })
  }

  function resetFilters() {
    store.commit('costTracking/RESET_FILTERS')
  }

  const effectiveGroupBy = computed(
    () =>
      groupByOverride.value ||
      defaultGroupBy({ typeId: typeId.value, categoryId: categoryId.value, menuItemId: menuItemId.value, ingredientId: ingredientId.value }),
  )
  /** true tant que l'utilisateur n'a pas forcé le mode (suit alors la règle automatique). */
  const groupByIsAuto = computed(() => !groupByOverride.value)

  // ---- Période
  const range = computed(() => {
    if (period.value === 'custom' && customFrom.value && customTo.value) {
      return { from: customFrom.value, to: customTo.value }
    }
    const days = PERIOD_PRESETS.includes(period.value) ? Number(period.value) : Number(DEFAULT_PERIOD)
    return rangeForDays(days)
  })
  const rangeValid = computed(() => {
    const n = daysInRange(range.value.from, range.value.to)
    return n >= 1 && n <= MAX_DAYS
  })
  const bounds = computed(() => periodBounds(range.value.from, range.value.to))

  function setPeriod(value) {
    period.value = value
  }
  function setCustomRange(from, to) {
    customFrom.value = from || null
    customTo.value = to || null
    period.value = 'custom'
  }

  // ---- Données
  const catalogLoading = computed(() => store.state.costTracking.fetching)
  const loading = computed(() => store.state.costTracking.seriesLoading)
  const error = computed(() => store.state.costTracking.seriesError || store.state.costTracking.catalogError)
  const response = computed(() => store.getters['costTracking/series'])

  const seriesParams = computed(() => ({
    from: range.value.from,
    to: range.value.to,
    typeId: typeId.value || undefined,
    categoryId: categoryId.value || undefined,
    menuItemId: menuItemId.value || undefined,
    ingredientId: ingredientId.value || undefined,
    groupBy: effectiveGroupBy.value,
  }))

  async function loadCatalog({ force = false } = {}) {
    if (!enabled.value || !spaceId.value) return
    await store.dispatch('costTracking/fetchCatalog', { spaceId: spaceId.value, force })
  }
  async function loadSeries() {
    if (!enabled.value || !spaceId.value || !rangeValid.value) return
    await store.dispatch('costTracking/fetchSeries', { spaceId: spaceId.value, params: seriesParams.value })
  }
  /** Recharge catalogue (forcé) et séries, par exemple après un rafraîchissement manuel. */
  async function reload() {
    await Promise.all([loadCatalog({ force: true }), loadSeries()])
  }

  // Lignes décorées : index de couleur stable (ordre renvoyé par le backend).
  const lines = computed(() =>
    (response.value?.lines || []).map((l, i) => ({
      ...l,
      colorIndex: i % 10,
      hidden: hiddenKeys.value.has(l.key),
    })),
  )
  const visibleLines = computed(() => lines.value.filter((l) => !l.hidden))
  const events = computed(() => response.value?.events || [])

  function toggleLine(key) {
    const next = new Set(hiddenKeys.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    hiddenKeys.value = next
  }
  function showAllLines() {
    hiddenKeys.value = new Set()
  }

  /** Séries calculées (escalier) pour les lignes visibles. */
  const visibleSeries = computed(() =>
    visibleLines.value.map((l) => ({ ...buildLineSeries(l, bounds.value[1]), colorIndex: l.colorIndex })),
  )
  const summary = computed(() => summarizeLines(lines.value, bounds.value[1]))

  /**
   * Modèle du graphique pour une taille donnée (px) : échelles, ticks, chemins et events.
   * Les étiquettes d'events sont masquées si l'espacement est inférieur à 17 px.
   */
  function chartModel({ width, height, margin } = {}) {
    const [t0, t1] = bounds.value
    const model = buildChartModel(visibleSeries.value, { t0, t1, width, height, margin })
    return { ...model, events: layoutEvents(events.value, model.x, t0, t1) }
  }

  const isEmpty = computed(
    () => !loading.value && !!response.value && lines.value.every((l) => !l.points?.length),
  )

  // ---- Historique d'un article
  const history = computed(() => store.getters['costTracking/history'])
  const historyLoading = computed(() => store.state.costTracking.historyLoading)
  const historyError = computed(() => store.state.costTracking.historyError)

  async function selectArticle(id, { limit } = {}) {
    if (!id) return closeHistory()
    selectedArticleId.value = id
    await store.dispatch('costTracking/fetchHistory', { spaceId: spaceId.value, menuItemId: id, limit })
  }
  function closeHistory() {
    selectedArticleId.value = null
    store.dispatch('costTracking/clearHistory')
  }

  // ---- Cycle de vie
  // Changement d'espace : on repart de zéro, puis on charge catalogue et séries.
  watch(
    [spaceId, enabled],
    ([id, on], old) => {
      const prev = old?.[0]
      if (prev && id !== prev) {
        store.dispatch('costTracking/reset')
        hiddenKeys.value = new Set()
        selectedArticleId.value = null
      }
      if (id && on) {
        loadCatalog()
        loadSeries()
      }
    },
    { immediate: true },
  )

  // Les lignes de recette (filtre ingrédient) suivent l'article filtré.
  watch(
    [menuItemId, spaceId],
    ([item, id]) => {
      if (enabled.value && id) store.dispatch('costTracking/fetchIngredientOptions', { spaceId: id, menuItemId: item })
    },
    { immediate: true },
  )

  // Tout changement de filtre, de mode ou de période relance les séries.
  watch(
    () => JSON.stringify(seriesParams.value),
    (now, before) => {
      if (now !== before) {
        hiddenKeys.value = new Set()
        loadSeries()
      }
    },
  )

  onBeforeUnmount(() => {
    store.dispatch('costTracking/clearHistory')
  })

  return {
    // filtres
    typeId, categoryId, menuItemId, ingredientId,
    typeOptions, categoryOptions, articleOptions, ingredientOptions,
    setType, setCategory, setArticle, setIngredient, drill, resetFilters,
    // mode Afficher par
    groupBy: effectiveGroupBy, groupByIsAuto, setGroupBy,
    // période
    period, range, rangeValid, bounds, setPeriod, setCustomRange,
    // chargement
    loading, catalogLoading, error, loadCatalog, loadSeries, reload,
    // données
    response, lines, visibleLines, visibleSeries, summary, events, isEmpty,
    trackingStartedAt: computed(() => response.value?.trackingStartedAt || null),
    truncated: computed(() => !!response.value?.truncated),
    rankedByRevenue: computed(() => !!response.value?.rankedByRevenue),
    timezone: computed(() => response.value?.timezone || null),
    hiddenKeys, toggleLine, showAllLines,
    chartModel,
    // sélection / historique
    selectedArticleId, selectArticle, closeHistory,
    history, historyLoading, historyError,
  }
}
