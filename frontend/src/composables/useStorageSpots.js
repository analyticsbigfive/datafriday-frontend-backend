import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useStorageRowWriter } from '@/composables/useStorageRowWriter'
import { splitSpots, findProductRow, filterSpots } from '@/components/menu-fb/views/storage/utils/storageSpots'
import { isRowStored } from '@/utils/storageRowStored'

/**
 * Points de stockage d'un produit dans un espace : PDV et Storage du builder, case = ligne
 * d'inventaire cochée (isStored). Tampon (quantity) sur tout PDV ou Storage coché.
 * Les modifications sont appliquées localement tout de suite puis écrites par upsert de ligne.
 *
 * @param {{ isOpen: import('vue').Ref<boolean>, spaceId: import('vue').Ref<string>, productName: import('vue').Ref<string>, readOnly?: import('vue').Ref<boolean> }} args
 */
export function useStorageSpots({ isOpen, spaceId, productName, readOnly = ref(false) }) {
  const store = useStore()
  const writer = useStorageRowWriter()
  const loading = ref(false)
  const loadError = ref(false)
  const tab = ref('shops')
  const search = ref('')
  const local = ref({}) // elementId -> { isStored?, quantity? } (valeurs affichées avant retour serveur)

  const elements = computed(() => store.getters['storageInventory/forSpace'](spaceId.value))

  const decorate = (el) => {
    const row = findProductRow(el.inventoryByConfig, productName.value)
    const o = local.value[el.id] || {}
    return {
      id: el.id,
      name: el.name,
      type: el.type,
      stored: o.isStored !== undefined ? o.isStored : isRowStored(row),
      quantity: o.quantity !== undefined ? o.quantity : (row ? Number(row.quantity) || 0 : 0),
    }
  }

  const groups = computed(() => {
    const { shops, storages } = splitSpots(elements.value)
    return { shops: shops.map(decorate), storages: storages.map(decorate) }
  })
  const visible = computed(() => filterSpots(groups.value[tab.value], search.value))
  const counts = computed(() => ({ shops: groups.value.shops.length, storages: groups.value.storages.length }))
  const allSelected = computed(() => visible.value.length > 0 && visible.value.every((s) => s.stored))

  async function load() {
    if (!spaceId.value) return
    loading.value = true
    loadError.value = false
    try {
      await store.dispatch('storageInventory/fetchForSpace', { spaceId: spaceId.value, force: true })
    } catch {
      loadError.value = true
    } finally {
      loading.value = false
    }
  }

  function setLocal(id, patch) {
    local.value = { ...local.value, [id]: { ...(local.value[id] || {}), ...patch } }
  }

  function setStored(spot, stored) {
    if (readOnly.value) return
    if (spot.stored === stored) return
    setLocal(spot.id, { isStored: stored })
    writer.queue(spot.id, productName.value, { isStored: stored })
  }

  const toggle = (spot) => setStored(spot, !spot.stored)
  const toggleAll = () => {
    const next = !allSelected.value
    visible.value.forEach((s) => setStored(s, next))
  }

  /** Tampon d'un Storage. Valeur invalide ou négative ignorée. */
  function setBuffer(spot, raw) {
    if (readOnly.value) return
    const n = Number(raw)
    if (raw === '' || !Number.isFinite(n) || n < 0) return
    setLocal(spot.id, { quantity: n })
    writer.queue(spot.id, productName.value, { quantity: n })
  }

  /** Fermeture : envoie les écritures en attente puis invalide le cache pour que l'inventaire se relise. */
  async function finish() {
    await writer.flushAll()
    if (writer.wrote.value) store.dispatch('storageInventory/invalidate', spaceId.value)
  }

  watch(isOpen, (open) => {
    if (open) {
      writer.reset()
      local.value = {}
      search.value = ''
      tab.value = 'shops'
      load()
    }
  })

  // Écriture refusée : on abandonne l'affichage optimiste et on relit l'état réel du serveur.
  watch(writer.status, (st) => {
    if (st === 'error') {
      local.value = {}
      load()
    }
  })

  return {
    loading, loadError, tab, search, visible, counts, allSelected,
    saveStatus: writer.status, saveError: writer.error,
    toggle, toggleAll, setBuffer, finish, load,
  }
}
