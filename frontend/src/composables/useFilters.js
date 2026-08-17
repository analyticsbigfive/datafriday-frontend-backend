/**
 * useFilters — wrappers autour du store Vuex analyse.
 * Applique un debounce 150ms à l'écriture des filtres.
 */
import { computed, ref } from 'vue'
import { useStore } from 'vuex'

// BUG-285 (volet fluidité) : signal PARTAGÉ « recalcul de filtres en cours ».
// Passe à true dès l'interaction (avant la fenêtre de coalescing 150 ms — le
// navigateur a donc le temps de PEINDRE le feedback optimiste et les voiles
// squelettes avant le burst synchrone de recalculs), repasse à false deux
// requestAnimationFrame après le dispatch (post-rendu). Ref de module : toutes
// les instances de useFilters() la partagent (donuts, tableaux, rail).
const filtersRecomputing = ref(false)
function _scheduleRecomputeDone(hasPending) {
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (fn) => setTimeout(fn, 0)
  raf(() => raf(() => {
    // Un autre toggle encore en attente re-déclenchera son propre cycle — ne pas
    // éteindre le voile entre deux flushs coalescés.
    if (!hasPending()) filtersRecomputing.value = false
  }))
}

/**
 * Sélection résultante d'un toggle GROUPÉ (17/08, clic sur une ligne
 * « DisplayName » du classement qui couvre N articles) : sémantique d'ENSEMBLE
 * et non valeur par valeur — toutes déjà présentes → on les retire toutes,
 * sinon → on complète les manquantes. Inverser chaque membre un à un donnerait
 * un résultat incohérent sur une sélection partielle.
 * Exporté pour test unitaire (la logique est pure, le reste du toggle est du
 * plombage store + debounce).
 * @param {Array<string>} base sélection courante
 * @param {Array<string>} values membres du groupe cliqué
 * @returns {Array<string>} nouvelle sélection
 */
export function nextGroupSelection(base = [], values = []) {
  const baseSet = new Set(base)
  const allPresent = values.length > 0 && values.every((v) => baseSet.has(v))
  if (allPresent) {
    const drop = new Set(values)
    return base.filter((v) => !drop.has(v))
  }
  return [...base, ...values.filter((v) => !baseSet.has(v))]
}

function debounce(fn, delay = 150) {
  let t = null
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), delay)
  }
}

export function useFilters() {
  const store = useStore()

  const filters = computed(() => store.state.analyse.filters)
  const filteredEvents = computed(() => store.getters['analyse/filteredEvents'])
  const filteredShopGranularData = computed(() => store.getters['analyse/filteredShopGranularData'])
  const activeFilterChips = computed(() => store.getters['analyse/activeFilterChips'])

  // Options dynamiques alimentant les selects du FilterPanel.
  // Data-driven (parité React) : shops/items/types/catégories viennent des VENTES
  // (getters sales*, dérivés des records des events analysables). Les options events
  // restent dérivées des events analysables (cf. getters store).
  const options = {
    shopNames:           computed(() => store.getters['analyse/salesShopNames']),
    shopTypes:           computed(() => store.getters['analyse/salesShopTypes']),
    shopAreas:           computed(() => store.getters['analyse/salesShopAreas']),
    menuItemNames:       computed(() => store.getters['analyse/salesMenuItemNames']),
    menuItemTypes:       computed(() => store.getters['analyse/salesMenuItemTypes']),
    menuItemCategories:  computed(() => store.getters['analyse/salesMenuItemCategories']),
    eventCategories:     computed(() => store.getters['analyse/uniqueEventCategories']),
    eventTypes:          computed(() => store.getters['analyse/uniqueEventTypes']),
    teams:               computed(() => store.getters['analyse/uniqueTeams']),
    sponsors:            computed(() => store.getters['analyse/uniqueSponsors']),
    // Filtres avancés additionnels (cf. parité React)
    subcategories:       computed(() => store.getters['analyse/uniqueSubcategories']),
    sessions:            computed(() => store.getters['analyse/uniqueSessions']),
    doorsOpenings:       computed(() => store.getters['analyse/uniqueDoorsOpenings']),
    showTimes:           computed(() => store.getters['analyse/uniqueShowTimes']),
    performers:          computed(() => store.getters['analyse/uniquePerformers']),
    visitingTeams:       computed(() => store.getters['analyse/uniqueVisitingTeams']),
    openingActs:         computed(() => store.getters['analyse/uniqueOpeningActs']),
  }
  // Présence de catégories pour le rendu conditionnel
  const categoryFlags = {
    hasEntertainment: computed(() => store.getters['analyse/hasEntertainmentCategory']),
    hasSports:        computed(() => store.getters['analyse/hasSportsCategory']),
    hasTradeshow:     computed(() => store.getters['analyse/hasTradeshowCategory']),
  }
  const attendanceBounds = computed(() => store.getters['analyse/attendanceBounds'])
  const configurations = computed(() => store.state.analyse.configurations)
  const activeConfiguration = computed(() => store.getters['analyse/activeConfiguration'])
  // État des filtres (loading/error/ready) + events analysables.
  const filtersState = computed(() => store.getters['analyse/filtersState'])
  const analysableEvents = computed(() => store.getters['analyse/analysableEvents'])

  const _debounced = debounce((payload) => store.dispatch('analyse/updateFilter', payload), 150)
  function setFilter(key, value) {
    _debounced({ key, value })
  }

  // BUG-284 : toggle coalescé des filtres tableau (clics segments des graphs /
  // camemberts). Le read-modify-write se fait sur l'état EN ATTENTE, pas le store :
  // des clics rapides sur la même clé se cumulent correctement, et un seul dispatch
  // (donc une seule vague de recalculs) part après 150 ms d'accalmie, par clé.
  const _pendingArrays = new Map()
  const _toggleTimers = new Map()
  function _cancelPendingToggle(key) {
    if (_toggleTimers.has(key)) {
      clearTimeout(_toggleTimers.get(key))
      _toggleTimers.delete(key)
      _pendingArrays.delete(key)
    }
  }
  function toggleArrayFilter(key, value) {
    if (value == null) return
    const base = _pendingArrays.has(key)
      ? _pendingArrays.get(key)
      : (store.state.analyse.filters?.[key] || [])
    const next = base.includes(value)
      ? base.filter((v) => v !== value)
      : [...base, value]
    _pendingArrays.set(key, next)
    filtersRecomputing.value = true
    clearTimeout(_toggleTimers.get(key))
    _toggleTimers.set(key, setTimeout(() => {
      _toggleTimers.delete(key)
      _pendingArrays.delete(key)
      store.dispatch('analyse/updateFilter', { key, value: next })
      _scheduleRecomputeDone(() => _toggleTimers.size > 0)
    }, 150))
  }

  /**
   * Toggle GROUPÉ : plusieurs valeurs d'un coup, sémantique d'ensemble et non
   * valeur par valeur (17/08, clic sur une ligne « DisplayName » du classement
   * qui couvre N articles). Toutes déjà présentes → on les retire toutes ;
   * sinon → on ajoute les manquantes. Une boucle sur toggleArrayFilter donnerait
   * un résultat incohérent sur une sélection partielle (elle inverserait chaque
   * membre au lieu de sélectionner le groupe). Même file d'attente et même
   * debounce que toggleArrayFilter (un seul dispatch après 150 ms).
   */
  function toggleArrayFilterMany(key, values) {
    const list = (Array.isArray(values) ? values : [values]).filter((v) => v != null)
    if (!list.length) return
    if (list.length === 1) return toggleArrayFilter(key, list[0])
    const base = _pendingArrays.has(key)
      ? _pendingArrays.get(key)
      : (store.state.analyse.filters?.[key] || [])
    const next = nextGroupSelection(base, list)
    _pendingArrays.set(key, next)
    filtersRecomputing.value = true
    clearTimeout(_toggleTimers.get(key))
    _toggleTimers.set(key, setTimeout(() => {
      _toggleTimers.delete(key)
      _pendingArrays.delete(key)
      store.dispatch('analyse/updateFilter', { key, value: next })
      _scheduleRecomputeDone(() => _toggleTimers.size > 0)
    }, 150))
  }

  function setFilterImmediate(key, value) {
    // Un write direct sur une clé annule le toggle en attente sur cette clé —
    // sinon le toggle différé écraserait ce write 150 ms plus tard (ex. « tout
    // effacer » suivi d'un dispatch fantôme).
    _cancelPendingToggle(key)
    filtersRecomputing.value = true
    store.dispatch('analyse/updateFilter', { key, value })
    _scheduleRecomputeDone(() => _toggleTimers.size > 0)
  }
  function resetFilters() {
    for (const key of _toggleTimers.keys()) clearTimeout(_toggleTimers.get(key))
    _toggleTimers.clear()
    _pendingArrays.clear()
    store.dispatch('analyse/resetFilters')
  }

  return {
    filters,
    filteredEvents,
    filteredShopGranularData,
    activeFilterChips,
    options,
    categoryFlags,
    attendanceBounds,
    configurations,
    activeConfiguration,
    filtersState,
    analysableEvents,
    setFilter,
    setFilterImmediate,
    toggleArrayFilter,
    toggleArrayFilterMany,
    resetFilters,
    filtersRecomputing,
  }
}
