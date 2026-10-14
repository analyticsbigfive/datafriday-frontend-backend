/**
 * useComparisonEvents : filtres et events du rapport de COMPARAISON, sans jamais écrire
 * dans le store du principal (lecture seule de state.filters et des getters).
 *
 * Étapes : saisie de comparaison + filtres du principal -> buildComparisonFilters ->
 * bornes de dates -> filterEvents sur la base `analysableEvents` -> liste « filtres
 * appliqués » -> détection « mêmes events que le principal » (décision 15).
 */
import { computed } from 'vue'
import defaultStore from '@/store'
import { buildComparisonFilters, describeComparisonFilters } from '@/utils/comparisonFilters'
import { resolveDateBounds } from '@/utils/analyseDateBounds'
import { filterEvents } from '@/utils/analyseEventFilter'

/**
 * @param {Object} p
 * @param {import('vue').Ref<object|null>} p.input  saisie de comparaison (null = pas de comparaison)
 * @param {import('vue').Ref<object>} p.mainFilters  state.filters du principal (lecture seule)
 * @param {import('vue').Ref<Array>} [p.mainEvents]  events filtrés du principal (défaut : getter analyse/filteredEvents)
 * @param {(key: string) => string} p.translate
 * @param {string|null} [p.defaultTimeRange]  période par défaut (pas de puce tant qu'elle est active)
 * @param {object} [p.store]  store Vuex (défaut : le store global, injectable pour les tests)
 */
export function useComparisonEvents({
  input, mainFilters, mainEvents = null, translate, defaultTimeRange = null, store = defaultStore,
}) {
  const seasons = computed(() => store.state.seasons?.seasons || [])

  const kind = computed(() => input.value?.kind || null)
  const isPredict = computed(() => kind.value === 'predict')

  const filters = computed(() => {
    if (!input.value) return null
    return buildComparisonFilters(mainFilters.value || {}, input.value, {
      seasons: seasons.value,
      isPredict: false,
      now: new Date(),
    })
  })

  const bounds = computed(() => {
    if (!filters.value) return null
    return resolveDateBounds(filters.value, { seasons: seasons.value, isPredict: false, now: new Date() })
  })

  /** Events qui correspondent aux filtres de la comparaison, avant plafond et avant tri Predict. */
  const matchedEvents = computed(() => {
    if (!filters.value) return []
    const base = store.getters['analyse/analysableEvents'] || []
    return filterEvents(base, filters.value, bounds.value)
  })

  const principalEvents = computed(() => (
    mainEvents ? mainEvents.value || [] : store.getters['analyse/filteredEvents'] || []
  ))

  /**
   * true quand la comparaison sélectionne exactement les MÊMES events que le principal
   * (pas de faux 0 %, message d'avertissement). Jamais pour Predict : même périmètre
   * voulu, mais le scénario diffère du réel.
   */
  const sameAsMain = computed(() => {
    if (!input.value || isPredict.value) return false
    const a = matchedEvents.value
    const b = principalEvents.value
    if (!a.length || a.length !== b.length) return false
    const ids = new Set(b.map((e) => e.id))
    return a.every((e) => ids.has(e.id))
  })

  const appliedFilters = computed(() => {
    if (!filters.value) return []
    return describeComparisonFilters(mainFilters.value || {}, filters.value, translate, {
      activeConfiguration: store.getters['analyse/activeConfiguration'] || null,
      seasons: seasons.value,
      defaultTimeRange,
    })
  })

  return { kind, isPredict, filters, bounds, matchedEvents, principalEvents, sameAsMain, appliedFilters, seasons }
}
