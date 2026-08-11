import { useStore } from 'vuex'

/**
 * Inventaire « stock tampon » des éléments du 3D Builder (section Inventaire),
 * projeté depuis le builder state (store `storageInventory`, TTL 15 min).
 * Consommé par le réarmement (onglet « Espaces de stockage ») : le tampon est
 * SAISI dans le Builder (PUT full-replace) — ici, lecture seule.
 */
export function useStorageInventory() {
  const store = useStore()

  const loadStorageInventory = (spaceId, { force = false } = {}) =>
    store.dispatch('storageInventory/fetchForSpace', { spaceId, force })

  const elementsForSpace = (spaceId) =>
    store.getters['storageInventory/forSpace'](spaceId)

  /**
   * Lignes d'inventaire d'un élément pour une config donnée.
   * Repli clé '' = lignes non scopées config (même règle que
   * StorageInventorySection.vue côté Builder).
   */
  const storageInventoryFor = (spaceId, elementId, configId) => {
    const el = elementsForSpace(spaceId).find((e) => e.id === String(elementId))
    if (!el) return []
    const byConfig = el.inventoryByConfig || {}
    return byConfig[configId] || byConfig[''] || []
  }

  return { loadStorageInventory, elementsForSpace, storageInventoryFor }
}
