// useMenuItemAvailability(space) — spec composable #3.
// Pour un menu item : { isAvailable, missingIngredients[] }, récursif sur combos
// et composants. Logique pure dans @/utils/menuItemAvailability ; ici on branche
// le store (menuItems, components, ingredients, marketPrices, suppliers).

import { computed } from 'vue'
import { useStore } from 'vuex'
import { computeMenuItemAvailability } from '@/utils/menuItemAvailability'

function unref(maybe) {
  if (typeof maybe === 'function') return maybe()
  if (maybe && maybe.value !== undefined) return maybe.value
  return maybe
}

export function useMenuItemAvailability(spaceRef) {
  const store = useStore()

  const ctx = computed(() => {
    const space = unref(spaceRef) || store.state.analyse?.space || null
    return {
      menuItems: store.state.analyse?.menuItems || [],
      components: store.state.analyse?.components || [],
      ingredients: store.state.analyse?.ingredients || [],
      marketPrices:
        store.state.inventory?.marketPrices || store.state.analyse?.marketPrices || [],
      suppliers: store.state.analyse?.suppliers || [],
      spaceId: space?.id || null,
    }
  })

  /** @returns {{ isAvailable: boolean, missingIngredients: string[] }} */
  function availabilityFor(menuItem) {
    return computeMenuItemAvailability(menuItem, ctx.value)
  }

  return { availabilityFor, ctx, computeMenuItemAvailability }
}
