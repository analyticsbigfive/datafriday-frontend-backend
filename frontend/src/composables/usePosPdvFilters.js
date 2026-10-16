import { computed, ref, unref } from 'vue'

/**
 * Filtres de la liste des PdV de l'outil POS : recherche, type de PdV, Space Menu, statut
 * (actives / inactives). Les options de filtre sont déduites des PdV chargés, jamais figées.
 */

const norm = (value) => String(value || '').trim().toLowerCase()

export function matchesPdvSearch(pdv, query) {
  const q = norm(query)
  if (!q) return true
  return norm(`${pdv.name} ${pdv.spaceMenuLabel || ''} ${pdv.zoneLabel || ''}`).includes(q)
}

/** Valeurs distinctes d'un champ avec leur effectif, triées par libellé. */
export function countBy(pdvs, field) {
  const counts = new Map()
  pdvs.forEach((pdv) => {
    const value = pdv[field]
    if (!value) return
    counts.set(value, (counts.get(value) || 0) + 1)
  })
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => String(a.value).localeCompare(String(b.value)))
}

export function isPdvActive(pdv) {
  return pdv.status !== 'inactive'
}

/**
 * @param {import('vue').Ref<import('@/api/endpoints/pos.contracts').PosPdvRow[]>|import('@/api/endpoints/pos.contracts').PosPdvRow[]} pdvsSource
 */
export function usePosPdvFilters(pdvsSource) {
  const search = ref('')
  const selectedTypes = ref([])
  const selectedMenus = ref([])
  const statusFilter = ref(null) // null | 'active' | 'inactive'

  const pdvs = computed(() => unref(pdvsSource) || [])
  const typeOptions = computed(() => countBy(pdvs.value, 'type'))
  const menuOptions = computed(() => countBy(pdvs.value, 'spaceMenuLabel'))

  // Base = recherche + type + menu : les compteurs Actives / Inactives portent sur elle.
  const base = computed(() =>
    pdvs.value.filter(
      (pdv) =>
        matchesPdvSearch(pdv, search.value) &&
        (!selectedTypes.value.length || selectedTypes.value.includes(pdv.type)) &&
        (!selectedMenus.value.length || selectedMenus.value.includes(pdv.spaceMenuLabel))
    )
  )
  const activeCount = computed(() => base.value.filter(isPdvActive).length)
  const inactiveCount = computed(() => base.value.length - activeCount.value)
  const shown = computed(() =>
    base.value.filter((pdv) => {
      if (statusFilter.value === 'active') return isPdvActive(pdv)
      if (statusFilter.value === 'inactive') return !isPdvActive(pdv)
      return true
    })
  )

  function toggleIn(listRef, value) {
    listRef.value = listRef.value.includes(value)
      ? listRef.value.filter((v) => v !== value)
      : [...listRef.value, value]
  }
  const toggleType = (value) => toggleIn(selectedTypes, value)
  const toggleMenu = (value) => toggleIn(selectedMenus, value)
  const toggleStatus = (value) => {
    statusFilter.value = statusFilter.value === value ? null : value
  }
  function reset() {
    search.value = ''
    selectedTypes.value = []
    selectedMenus.value = []
    statusFilter.value = null
  }

  return {
    search,
    selectedTypes,
    selectedMenus,
    statusFilter,
    typeOptions,
    menuOptions,
    shown,
    activeCount,
    inactiveCount,
    toggleType,
    toggleMenu,
    toggleStatus,
    reset,
  }
}
