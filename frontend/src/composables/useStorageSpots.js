import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useStorageRowWriter } from '@/composables/useStorageRowWriter'
import { splitSpots, findProductRow, filterSpots, aggregateSpot } from '@/components/menu-fb/views/storage/utils/storageSpots'

/**
 * Points de stockage d'un produit dans un espace : PDV et Storage du builder, case = ligne
 * d'inventaire cochée (isStored). Tampon (quantity) sur tout PDV ou Storage coché.
 * `productNames` (tableau) permet d'agir sur plusieurs produits à la fois : case cochée si tous y sont
 * stockés, indéterminée si une partie, tampon commun ou null s'il diffère. Les modifications sont appliquées localement tout de suite puis écrites par upsert de ligne.
 *
 * `products` (optionnel) = [{ name, marketPriceId }] : id du Market Price des produits, utilisé pour
 * retrouver les lignes (id d'abord, nom en repli) et envoyé à l'écriture.
 *
 * @param {{ isOpen: import('vue').Ref<boolean>, spaceId: import('vue').Ref<string>, productNames: import('vue').Ref<string[]>, readOnly?: import('vue').Ref<boolean> }} args
 */
export function useStorageSpots({ isOpen, spaceId, productNames, products = ref([]), readOnly = ref(false) }) {
  const store = useStore()
  const writer = useStorageRowWriter()
  const loading = ref(false)
  const loadError = ref(false)
  const tab = ref('shops')
  const search = ref('')
  const local = ref({}) // elementId -> { isStored?, quantity? } (valeurs affichées avant retour serveur)

  // Produits agissants : id connu via `products` (rapproché par nom), sinon nom seul.
  const refs = computed(() => {
    const byName = new Map((products.value || []).map((p) => [p.name, p.marketPriceId || null]))
    return productNames.value.map((name) => ({ name, marketPriceId: byName.get(name) || null }))
  })
  const idPatch = (ref_) => (ref_.marketPriceId ? { marketPriceId: ref_.marketPriceId } : {})

  const elements = computed(() => store.getters['storageInventory/forSpace'](spaceId.value))

  const decorate = (el) => {
    const rowFor = (ref_) => findProductRow(el.inventoryByConfig, ref_)
    const agg = aggregateSpot(rowFor, refs.value, local.value[el.id] || {})
    return { id: el.id, name: el.name, type: el.type, ...agg }
  }

  const groups = computed(() => {
    const { shops, storages } = splitSpots(elements.value)
    return { shops: shops.map(decorate), storages: storages.map(decorate) }
  })
  const visible = computed(() => filterSpots(groups.value[tab.value], search.value))
  const counts = computed(() => ({ shops: groups.value.shops.length, storages: groups.value.storages.length }))
  const allSelected = computed(() => visible.value.length > 0 && visible.value.every((s) => s.stored))
  const someSelected = computed(() => !allSelected.value && visible.value.some((s) => s.stored || s.partial))

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
    if (spot.stored === stored && !spot.partial) return
    setLocal(spot.id, { isStored: stored })
    refs.value.forEach((r) => writer.queue(spot.id, r.name, { isStored: stored, ...idPatch(r) }))
  }

  // Un état partiel se coche d'abord pour tous les produits.
  const toggle = (spot) => setStored(spot, spot.partial ? true : !spot.stored)
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
    refs.value.forEach((r) => writer.queue(spot.id, r.name, { quantity: n, ...idPatch(r) }))
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
    loading, loadError, tab, search, visible, counts, allSelected, someSelected,
    saveStatus: writer.status, saveError: writer.error,
    toggle, toggleAll, setBuffer, finish, load,
  }
}
