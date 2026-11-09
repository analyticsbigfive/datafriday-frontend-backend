import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { useStorageRowWriter } from '@/composables/useStorageRowWriter'
import { marketPriceOf, packsToUnits, packLabelOf, sharedPackLabel } from '@/utils/bufferPackaging'
import { packSizeMissing } from '@/utils/marketPricePackSize'
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
export function useStorageSpots({ isOpen, spaceId, productNames, products = ref([]), readOnly = ref(false), initialTab = ref('shops') }) {
  const store = useStore()
  const { t, locale } = useI18n()
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

  // Market Price de chaque produit (liste déjà chargée par la page Stockage) : contenance et nom du colis.
  const marketPrices = computed(() => store.getters['marketPrices/rows'] || [])
  const packOf = (ref_) => marketPriceOf(ref_, marketPrices.value)
  // Libellé du conditionnement à côté du champ tampon, commun à tous les produits. Null si les
  // conditionnements diffèrent ou si un Market Price est inconnu : le drawer affiche alors un champ
  // par produit, avec son propre conditionnement (jamais un mot vague).
  const bufferLabel = computed(() => sharedPackLabel(refs.value.map(packOf), t, locale.value))
  // Conditionnement propre à chaque produit : { nom: libellé pluriel, '' si Market Price inconnu }.
  const packLabels = computed(() => Object.fromEntries(refs.value.map((r) => {
    const mp = packOf(r)
    return [r.name, mp ? packLabelOf(mp, t, locale.value, { plural: true }) : '']
  })))

  // Produits qui ont un type de conditionnement mais aucune contenance : alerte « à renseigner ».
  const missingPackSize = computed(() => refs.value.filter((r) => packSizeMissing(packOf(r))).map((r) => r.name))

  const elements = computed(() => store.getters['storageInventory/forSpace'](spaceId.value))

  const decorate = (el) => {
    const rowFor = (ref_) => findProductRow(el.inventoryByConfig, ref_)
    const agg = aggregateSpot(rowFor, refs.value, local.value[el.id] || {}, packOf)
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
      // Le catalogue Market Price donne la contenance et le conditionnement : sans lui, 300 L
      // s'afficheraient « 300 colis » (contenance 1). La page Stockage le charge déjà, Commandes non.
      await Promise.all([
        store.dispatch('storageInventory/fetchForSpace', { spaceId: spaceId.value, force: true }),
        store.dispatch('marketPrices/fetchRows', { forceRefresh: false }),
      ])
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

  /**
   * Tampon d'un Storage, saisi en colis (décimaux permis) et écrit en unités de base. Valeur invalide
   * ou négative ignorée. `name` = un seul produit (champ par produit), sinon tous. Un produit dont le
   * Market Price est inconnu n'est jamais écrit : sa contenance n'est pas connue.
   */
  function setBuffer(spot, raw, name = null) {
    if (readOnly.value) return
    // Catalogue absent : la conversion colis vers unités serait fausse (10 écrit comme 10 L). On n'écrit rien.
    if (!marketPrices.value.length) return
    const n = Number(raw)
    if (raw === '' || !Number.isFinite(n) || n < 0) return
    const targets = refs.value.filter((r) => (name === null || r.name === name) && packOf(r))
    if (!targets.length) return
    if (name === null) setLocal(spot.id, { quantity: n, quantities: {} })
    else setLocal(spot.id, { quantity: undefined, quantities: { ...((local.value[spot.id] || {}).quantities || {}), [name]: n } })
    targets.forEach((r) => writer.queue(spot.id, r.name, { quantity: packsToUnits(n, packOf(r)), ...idPatch(r) }))
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
      tab.value = initialTab.value === 'storages' ? 'storages' : 'shops'
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
    bufferLabel, packLabels, missingPackSize, loading, loadError, tab, search, visible, counts, allSelected, someSelected,
    saveStatus: writer.status, saveError: writer.error,
    toggle, toggleAll, setBuffer, finish, load,
  }
}
