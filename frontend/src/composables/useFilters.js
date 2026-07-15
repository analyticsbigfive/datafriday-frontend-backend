/**
 * useFilters — wrappers autour du store Vuex analyse.
 * Applique un debounce 150ms à l'écriture des filtres.
 */
import { computed } from 'vue'
import { useStore } from 'vuex'

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
  function setFilterImmediate(key, value) {
    store.dispatch('analyse/updateFilter', { key, value })
  }
  function resetFilters() {
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
    resetFilters,
  }
}
