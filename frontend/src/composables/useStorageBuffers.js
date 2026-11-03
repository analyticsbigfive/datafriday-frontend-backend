import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useStorageRowWriter } from '@/composables/useStorageRowWriter'
import { useStorageProductOptions } from '@/composables/useStorageProductOptions'
import { marketPriceOf, packsToUnits } from '@/utils/bufferPackaging'
import { storageBufferRows, filterBufferRows } from '@/utils/restockStorageBuffers'

const MAX_SHOWN = 100

/**
 * Stocks tampons d'UN stockage (drawer « Paramétrer » de l'onglet STOCK de Commande).
 * Même écriture que le drawer Stockage de la page Stockage (useStorageRowWriter : upsert de la ligne
 * (élément, produit), toutes configs) ; tampon saisi en colis, écrit en unités de base.
 *
 * @param {{ isOpen: import('vue').Ref<boolean>, spaceId: import('vue').Ref<string>, elementId: import('vue').Ref<string>, readOnly: import('vue').Ref<boolean> }} args
 */
export function useStorageBuffers({ isOpen, spaceId, elementId, readOnly }) {
  const store = useStore()
  const writer = useStorageRowWriter()
  const { products, loading: productsLoading, error: productsError, ensureLoaded } = useStorageProductOptions(spaceId)
  const loading = ref(false)
  const loadError = ref(false)
  const search = ref('')
  const local = ref({}) // nom normalisé -> { isStored?, quantity? (colis) }

  const marketPrices = computed(() => store.getters['marketPrices/rows'] || [])
  const packOf = (product) => marketPriceOf(product, marketPrices.value)

  const element = computed(() =>
    (store.getters['storageInventory/forSpace'](spaceId.value) || []).find((e) => String(e.id) === String(elementId.value)) || null,
  )
  const rows = computed(() => storageBufferRows(products.value, element.value?.inventoryByConfig || {}, local.value, packOf))
  const filtered = computed(() => filterBufferRows(rows.value, search.value))
  const visible = computed(() => filtered.value.slice(0, MAX_SHOWN))
  const hiddenCount = computed(() => Math.max(0, filtered.value.length - MAX_SHOWN))
  const storedCount = computed(() => rows.value.filter((r) => r.stored).length)

  async function load() {
    if (!spaceId.value) return
    loading.value = true
    loadError.value = false
    try {
      await Promise.all([
        store.dispatch('storageInventory/fetchForSpace', { spaceId: spaceId.value, force: true }),
        ensureLoaded(),
      ])
    } catch {
      loadError.value = true
    } finally {
      loading.value = false
    }
  }

  const idPatch = (row) => (row.marketPriceId ? { marketPriceId: row.marketPriceId } : {})
  function setLocal(row, patch) {
    local.value = { ...local.value, [row.key]: { ...(local.value[row.key] || {}), ...patch } }
  }

  function toggle(row) {
    if (readOnly.value || !elementId.value) return
    const stored = !row.stored
    setLocal(row, { isStored: stored })
    writer.queue(elementId.value, row.name, { isStored: stored, ...idPatch(row) })
  }

  /** Tampon saisi en colis (décimaux permis), écrit en unités de base. Valeur invalide ou négative ignorée. */
  function setBuffer(row, raw) {
    if (readOnly.value || !elementId.value) return
    const n = Number(raw)
    if (raw === '' || !Number.isFinite(n) || n < 0) return
    setLocal(row, { quantity: n })
    writer.queue(elementId.value, row.name, { quantity: packsToUnits(n, packOf(row)), ...idPatch(row) })
  }

  /** Fermeture : envoie les écritures en attente, puis invalide le cache si quelque chose a été écrit. */
  async function finish() {
    await writer.flushAll()
    const wrote = writer.wrote.value
    if (wrote) store.dispatch('storageInventory/invalidate', spaceId.value)
    return wrote
  }

  watch(isOpen, (open) => {
    if (open) {
      writer.reset()
      local.value = {}
      search.value = ''
      load()
    }
  }, { immediate: true })

  // Écriture refusée : on abandonne l'affichage optimiste et on relit l'état réel du serveur.
  watch(writer.status, (st) => {
    if (st === 'error') {
      local.value = {}
      load()
    }
  })

  return {
    search, visible, hiddenCount, storedCount, packOf,
    loading: computed(() => loading.value || productsLoading.value),
    loadError: computed(() => loadError.value || productsError.value),
    saveStatus: writer.status, saveError: writer.error,
    toggle, setBuffer, finish,
  }
}
