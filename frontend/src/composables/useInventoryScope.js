// src/composables/useInventoryScope.js
// Bascule « Voir tout l'inventaire » de l'écran Post-event Inventory.
// Par défaut, l'inventaire couvre les PdV de la configuration de l'event
// (règle BUG-383-02). Dans certains cas il faut tout compter : le mode élargi
// charge les PdV et réserves de toutes les configurations de l'espace
// (cf. utils/inventoryScope.js). Réservé au post-event : le pre-event reste
// sur les PdV ouverts pour le match.

import { ref, computed } from 'vue'
import { INVENTORY_SCOPE_EVENT, INVENTORY_SCOPE_SPACE } from '@/utils/inventoryScope'

export function useInventoryScope() {
  const inventoryScope = ref(INVENTORY_SCOPE_EVENT)
  const isFullInventory = computed(() => inventoryScope.value === INVENTORY_SCOPE_SPACE)

  function setFullInventory(on) {
    inventoryScope.value = on ? INVENTORY_SCOPE_SPACE : INVENTORY_SCOPE_EVENT
  }

  /** Périmètre effectif : toujours celui de l'event hors post-event. */
  function scopeFor(isPostMode) {
    return isPostMode ? inventoryScope.value : INVENTORY_SCOPE_EVENT
  }

  return { inventoryScope, isFullInventory, setFullInventory, scopeFor }
}
