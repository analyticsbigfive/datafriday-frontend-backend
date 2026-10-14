/**
 * useComparisonForm : logique du formulaire de comparaison (drawer Analyse), sans rendu.
 *
 * Le MODÈLE est exactement l'objet attendu par buildComparisonFilters / useComparisonReport :
 *   { kind: 'period'|'category'|'event'|'predict', period, from, to, eventTypes, categories,
 *     subcategories, eventIds, selectedDaysOfWeek, selectedDoorsOpenings, selectedShowTimes,
 *     selectedWeather, temperatureRange }
 *
 * Lecture seule du principal (filtres, events, getters) : aucune écriture dans le store des
 * filtres. Aucun stockage navigateur. Les calculs lourds (scénarios Predict) ne tournent que
 * lorsque `enabled` (drawer ouvert) est vrai.
 *
 * À instancier dans un composant qui SURVIT aux changements de vue du drawer (le brouillon et
 * le cache de la vérification Predict doivent rester quand on passe au rapport puis qu'on
 * revient modifier les critères).
 */
import { computed, reactive, ref, unref, watch } from 'vue'
import defaultStore from '@/store'
import { useComparisonEvents } from '@/composables/useComparisonEvents'
import { useComparisonPredictAvailability } from '@/composables/useComparisonPredictAvailability'
import { cascadeEventTaxonomy, isPeriodShortcutAvailable } from '@/utils/comparisonFilters'
import {
  advancedCount,
  canRunComparison,
  cloneModel,
  comparisonAlerts,
  defaultComparisonModel,
  eventPickerOptions,
  formatResolvedPeriod,
  mainPeriodLabel,
  periodOptionGroups,
  resolveFormPeriod,
  COMPARISON_KINDS,
} from '@/utils/comparisonFormModel'

/**
 * @param {Object} p
 * @param {import('vue').Ref<object>} p.mainFilters  state.filters du principal (lecture seule)
 * @param {import('vue').Ref<Array>} [p.mainEvents]  events du rapport principal (défaut : getter analyse/filteredEvents)
 * @param {import('vue').Ref<string|null>} [p.spaceId]  espace courant (saisons proposées)
 * @param {(key: string) => string} p.translate
 * @param {import('vue').Ref<string>|string} [p.locale]  locale d'affichage des dates
 * @param {import('vue').Ref<boolean>} [p.enabled]  drawer ouvert (la vérification Predict ne tourne que dans ce cas)
 * @param {object} [p.store]  store Vuex (défaut : global, injectable pour les tests)
 */
export function useComparisonForm({
  mainFilters,
  mainEvents = null,
  spaceId = ref(null),
  translate,
  locale = 'fr',
  enabled = ref(true),
  store = defaultStore,
}) {
  const getters = () => store.getters || {}

  const seasons = computed(() => {
    const id = unref(spaceId)
    const forSpace = getters()['seasons/seasonsForSpace']
    if (typeof forSpace === 'function' && id) return forSpace(id) || []
    return store.state.seasons?.seasons || []
  })

  const shortcutAvailable = computed(() => isPeriodShortcutAvailable(mainFilters.value || {}, {
    seasons: store.state.seasons?.seasons || [],
    now: new Date(),
  }))

  const buildDefaults = () => defaultComparisonModel(mainFilters.value || {}, {
    seasons: seasons.value,
    shortcutAvailable: shortcutAvailable.value,
  })

  // ── Modèle ──────────────────────────────────────────────────────────────
  const model = reactive(buildDefaults())
  // Tant que l'utilisateur n'a rien touché, les défauts suivent le principal.
  let pristine = true

  function assign(next) {
    for (const k of Object.keys(next)) model[k] = next[k]
  }

  /** Modifie une ou plusieurs clés du modèle (seul point d'écriture des composants). */
  function patch(partial) {
    pristine = false
    assign(partial)
  }

  function reset() {
    pristine = true
    assign(buildDefaults())
  }

  watch(
    [() => mainFilters.value?.timeRange, () => mainFilters.value?.startDate, () => mainFilters.value?.endDate,
      () => mainFilters.value?.selectedEventTypes, () => mainFilters.value?.selectedEventCategories,
      () => mainFilters.value?.selectedSubcategories, seasons, shortcutAvailable, enabled],
    () => { if (pristine) assign(buildDefaults()) },
  )

  // ── Events ───────────────────────────────────────────────────────────────
  const input = computed(() => model)
  const cmpEvents = useComparisonEvents({ input, mainFilters, mainEvents, translate, store })
  const mainCount = computed(() => cmpEvents.principalEvents.value.length)

  // ── Predict : au moins un event du principal avec un scénario sauvegardé ──
  const scenarios = useComparisonPredictAvailability({
    events: cmpEvents.principalEvents,
    enabled: computed(() => !!unref(enabled)),
  })
  const predictChecking = computed(() => !!unref(enabled) && scenarios.status.value === 'loading')
  const predictCoveredCount = computed(() => (predictChecking.value ? 0 : scenarios.covered.value.length))
  const predictAvailable = computed(() => !predictChecking.value && predictCoveredCount.value > 0)

  // Predict devenu indisponible (principal modifié) : retour au type Période.
  watch(predictAvailable, (ok) => {
    if (!ok && !predictChecking.value && model.kind === 'predict') patch({ kind: 'period' })
  })

  function setKind(kind) {
    if (!COMPARISON_KINDS.includes(kind)) return
    if (kind === 'predict' && !predictAvailable.value) return
    patch({ kind })
  }

  const isPredict = computed(() => model.kind === 'predict')

  // ── Compteurs, validation, alertes ───────────────────────────────────────
  const selectedEventCount = computed(() => model.eventIds.length)
  const comparisonCount = computed(() => {
    if (isPredict.value) return predictCoveredCount.value
    if (model.kind === 'event' && !model.eventIds.length) return 0
    return cmpEvents.matchedEvents.value.length
  })
  const sameAsMain = computed(() => cmpEvents.sameAsMain.value && mainCount.value > 0)
  const canRun = computed(() => canRunComparison({
    kind: model.kind,
    comparisonCount: comparisonCount.value,
    selectedEventCount: selectedEventCount.value,
    predictCoveredCount: predictCoveredCount.value,
  }))
  const alerts = computed(() => comparisonAlerts({
    kind: model.kind,
    comparisonCount: comparisonCount.value,
    selectedEventCount: selectedEventCount.value,
    sameAsMain: sameAsMain.value,
    canRun: canRun.value,
    predictChecking: predictChecking.value,
  }))
  const advancedActiveCount = computed(() => advancedCount(model))

  // ── Options des listes ───────────────────────────────────────────────────
  // Tous les events de l'espace : la comparaison n'est pas limitée à la configuration du principal.
  const analysableEvents = computed(() => getters()['analyse/spaceAnalysableEvents'] || [])
  const loc = () => unref(locale) || 'fr'

  const eventOptions = computed(() => eventPickerOptions(analysableEvents.value, loc()))
  const doorsOptions = computed(() => getters()['analyse/uniqueDoorsOpenings'] || [])
  const showOptions = computed(() => getters()['analyse/uniqueShowTimes'] || [])
  const periodGroups = computed(() => periodOptionGroups({
    translate,
    seasons: seasons.value,
    shortcutAvailable: shortcutAvailable.value,
  }))
  const periodHint = computed(() => formatResolvedPeriod(
    resolveFormPeriod(model, mainFilters.value || {}, { seasons: store.state.seasons?.seasons || [], now: new Date() }),
    { locale: loc(), translate },
  ))

  // Type / catégorie / sous-catégorie interdépendants (valeurs uniques dans l'interface).
  const taxonomy = computed(() => cascadeEventTaxonomy(analysableEvents.value, {
    type: model.eventTypes[0] || '',
    category: model.categories[0] || '',
    subcategory: model.subcategories[0] || '',
  }))

  /** field : 'type' | 'category' | 'subcategory' ; value '' = « Tous ». */
  function changeTaxonomy(field, value) {
    const current = {
      type: model.eventTypes[0] || '',
      category: model.categories[0] || '',
      subcategory: model.subcategories[0] || '',
    }
    const { selection } = cascadeEventTaxonomy(analysableEvents.value, { ...current, [field]: value || '' }, field)
    patch({
      eventTypes: selection.type ? [selection.type] : [],
      categories: selection.category ? [selection.category] : [],
      subcategories: selection.subcategory ? [selection.subcategory] : [],
    })
  }

  const mainSummary = computed(() => {
    const f = mainFilters.value || {}
    const parts = [mainPeriodLabel(f, { seasons: store.state.seasons?.seasons || [], translate, locale: loc() })]
    const tag = f.selectedEventCategories?.[0] || f.selectedEventTypes?.[0]
    if (tag) parts.push(tag)
    return parts
  })

  /** Copie profonde du brouillon, à passer à useComparisonReport (événement `run`). */
  const toRunModel = () => cloneModel(model)

  return {
    model,
    patch,
    reset,
    setKind,
    changeTaxonomy,
    toRunModel,
    isPredict,
    mainCount,
    comparisonCount,
    sameAsMain,
    canRun,
    alerts,
    advancedActiveCount,
    selectedEventCount,
    eventOptions,
    doorsOptions,
    showOptions,
    periodGroups,
    periodHint,
    taxonomy,
    mainSummary,
    appliedFilters: cmpEvents.appliedFilters,
    predict: { available: predictAvailable, checking: predictChecking, coveredCount: predictCoveredCount, total: mainCount },
  }
}
