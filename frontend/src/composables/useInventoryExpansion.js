// useInventoryExpansion() — spec composable #4.
// expandMenuItem(item): InventoryLine[]  (applique la Règle 2 d'inventaire)
// buildConsolidated(elements): une ligne par InventoryItem, avec usedInMenuItems[]
//
// La logique pure vit dans @/utils/inventoryUtils. Ce composable branche le store
// (menuItems, components, marketPrices) pour résoudre les métadonnées.

import { computed } from 'vue'
import { useStore } from 'vuex'
import {
  buildConsolidatedInventory,
  expandInventoryItems,
} from '@/utils/inventoryUtils'

export function useInventoryExpansion() {
  const store = useStore()

  const menuItems = computed(() => store.state.analyse?.menuItems || [])
  const components = computed(() => store.state.analyse?.components || [])
  const marketPrices = computed(() => store.state.inventory?.marketPrices || [])

  /**
   * Déplie un seul menu item en ses lignes d'inventaire (Règle 2).
   * @returns {Array} InventoryLine[]
   */
  function expandMenuItem(item) {
    if (!item) return []
    return buildConsolidatedInventory(
      [item],
      menuItems.value,
      marketPrices.value,
      true,
      components.value,
    )
  }

  /**
   * Consolide l'inventaire tous PDV confondus : une ligne par InventoryItem,
   * avec la liste des menu items qui l'utilisent (usedInMenuItems[]).
   * @param {Array} elements [{ availableMenuItems | menuItems }]
   */
  function buildConsolidated(elements) {
    const all = []
    ;(elements || []).forEach((el) => {
      const items = el.availableMenuItems || el.menuItems || []
      items.forEach((mi) => all.push(mi))
    })
    const consolidated = buildConsolidatedInventory(
      all,
      menuItems.value,
      marketPrices.value,
      false,
      components.value,
    )
    return consolidated.map((line) => ({ ...line, usedInMenuItems: line.usedIn }))
  }

  return { expandMenuItem, buildConsolidated, expandInventoryItems }
}
