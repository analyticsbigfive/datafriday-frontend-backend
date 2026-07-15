// src/composables/useInventoryData.js
// Inventaire = PdV de la CONFIGURATION de l'event ouvert dans Event Predict.
// La liste des shops est l'UNION des rows NestJS (/spaces/:id/shops?configId=)
// et des éléments de plan `type==='shop'` de la config (getConfiguration) :
// l'assignation Space Menu détermine ce qu'on peut COMPTER dans un shop, pas
// si le shop existe. Aucun gate isOpen/menuItemsCount : un shop fermé ou sans
// item assigné reste visible (décision user 2026-07-06). Ce composable est le
// PROPRIÉTAIRE UNIQUE des refs : la vue n'appelle que loadContext/resetContext
// et lit les refs.

import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import { normalizeStr } from '@/utils/predictiveAnalytics'
import { getConfiguration } from '@/api/endpoints/configuration.api'
import { runWithConcurrency } from '@/utils/asyncPool'
import {
  buildConsolidatedInventory,
  buildStorageInventory,
  buildMerchStorageInventory,
} from '@/utils/inventoryUtils'

/**
 * Liste canonique des shops de la config : union rows NestJS + éléments de plan.
 * - Seed depuis les rows (source:'api') ; dédup par shopId.
 * - Éléments `type==='shop'` : match par id → enrichit floorName/shopType/shopArea
 *   manquants ; sinon match par nom normalisé SEULEMENT si exactement 1 candidat
 *   (jamais de merge ambigu entre homonymes) ; sinon nouvelle entrée source:'config'
 *   (assignation menu keyée elementId === shopId, convention projet).
 * Le match par nom enrichit, ne supprime jamais d'entrée.
 * @returns {Array<{shopId,name,isOpen,floorName,shopType,shopArea,source}>}
 */
export function buildConfigShopList(rows, floors) {
  const entries = []
  const byId = new Map()
  for (const r of rows || []) {
    const shopId = String(r?.id ?? r?._id ?? r?.shopId ?? '')
    if (!shopId || byId.has(shopId)) continue
    const name = String(r?.name ?? r?.shopName ?? '').trim()
    const entry = {
      shopId,
      name: name || shopId,
      isOpen: r?.isOpen === true,
      floorName: null,
      shopType: r?.shopType ?? null,
      shopArea: r?.shopArea ?? null,
      source: 'api',
    }
    byId.set(shopId, entry)
    entries.push(entry)
  }
  const byName = new Map()
  for (const e of entries) {
    const k = normalizeStr(e.name)
    if (!k) continue
    const arr = byName.get(k) || []
    arr.push(e)
    byName.set(k, arr)
  }
  for (const floor of floors || []) {
    for (const el of floor?.elements || []) {
      if (el?.type !== 'shop') continue
      const elId = String(el?.id ?? '')
      let target = elId ? byId.get(elId) : null
      if (!target) {
        const candidates = byName.get(normalizeStr(el?.name)) || []
        if (candidates.length === 1) target = candidates[0]
      }
      if (target) {
        if (target.floorName == null) target.floorName = floor?.name ?? null
        if (target.shopType == null) target.shopType = el?.shopType ?? null
        if (target.shopArea == null) target.shopArea = el?.shopArea ?? null
        continue
      }
      if (!elId) continue
      const entry = {
        shopId: elId,
        name: String(el?.name ?? '').trim() || elId,
        isOpen: null, // inconnu : pas de row NestJS
        floorName: floor?.name ?? null,
        shopType: el?.shopType ?? null,
        shopArea: el?.shopArea ?? null,
        source: 'config',
      }
      byId.set(elId, entry)
      entries.push(entry)
    }
  }
  return entries
}

export function useInventoryData(selectedConfigId) {
  const store = useStore()

  // --- État possédé par ce composable -------------------------------------
  const shops = ref([]) // [{ shopId, name, isOpen, floorName, shopType, shopArea, source, items:[...] }]
  const shopsByName = ref(new Map()) // Map<normName, Shop[]> (homonymes conservés)
  const storageElements = ref([]) // floors config type storage (+displayName désambiguïsé)
  const merchElements = ref([]) // floors config type merchshop
  const contextLoading = ref(false)
  const contextError = ref(null)
  const contextWarning = ref(null)

  // Jeton anti-race LOCAL à l'instance + single-flight in-flight par space::config.
  let reqSeq = 0
  const inflight = new Map() // `${spaceId}::${configId}` → Promise

  const menuItems = computed(() => store.state.analyse?.menuItems || [])
  const components = computed(() => store.state.analyse?.components || [])
  const marketPrices = computed(() => store.state.inventory?.marketPrices || [])

  const catalogById = computed(() => {
    const m = new Map()
    for (const mi of menuItems.value) if (mi?.id != null) m.set(String(mi.id), mi)
    return m
  })
  const catalogByName = computed(() => {
    const m = new Map()
    for (const mi of menuItems.value) {
      const k = normalizeStr(mi?.name)
      if (k && !m.has(k)) m.set(k, mi)
    }
    return m
  })

  function resetContext() {
    reqSeq += 1 // invalide toute réponse en vol
    shops.value = []
    shopsByName.value = new Map()
    storageElements.value = []
    merchElements.value = []
    contextLoading.value = false
    contextError.value = null
    contextWarning.value = null
  }

  async function loadContext(spaceId, configId) {
    if (!spaceId || !configId) {
      resetContext()
      return
    }
    const key = `${spaceId}::${configId}`
    if (inflight.has(key)) return inflight.get(key)
    const myReq = ++reqSeq
    const stale = () => myReq !== reqSeq
    contextLoading.value = true
    contextError.value = null
    contextWarning.value = null

    const run = (async () => {
      // --- Rows NestJS + détail config en parallèle : les floors servent à
      //     l'union des shops, pas seulement au storage/merch. ---------------
      const [rowsRes, configRes] = await Promise.allSettled([
        store.dispatch('spaceShops/fetchForSpace', { spaceId, configId }),
        getConfiguration(configId),
      ])
      if (stale()) return

      let rows = []
      const rowsFailed = rowsRes.status === 'rejected'
      if (!rowsFailed) {
        const all = Array.isArray(rowsRes.value) ? rowsRes.value : []
        // Filtre client conservé : le backend peut ignorer ?configId= (anciens déploiements).
        rows = all.filter(
          (r) => String(r?.configId ?? r?._raw?.configId ?? '') === String(configId),
        )
      } else {
        // eslint-disable-next-line no-console
        console.warn('[inventory] échec chargement liste shops:', rowsRes.reason?.message)
      }

      let floors = []
      const configFailed = configRes.status === 'rejected'
      if (!configFailed) {
        floors = configRes.value?.data?.floors ?? configRes.value?.floors ?? []
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          '[inventory] détail config (floors/storage/merch) indisponible:',
          configRes.reason?.message,
        )
      }

      if (rowsFailed && configFailed) {
        contextError.value = rowsRes.reason?.message || 'shops-load-failed'
        shops.value = []
        shopsByName.value = new Map()
        storageElements.value = []
        merchElements.value = []
        return
      }

      // --- Storage / Merch depuis les floors ; homonymes désambiguïsés à
      //     l'affichage (clé réelle = element.id, jamais de merge). ----------
      const storages = []
      const merch = []
      for (const floor of floors) {
        for (const el of floor?.elements || []) {
          const withFloor = { ...el, floorName: floor?.name }
          if (el?.type === 'storage') storages.push(withFloor)
          else if (el?.type === 'merchshop') merch.push(withFloor)
        }
      }
      const storageNameCounts = new Map()
      for (const s of storages) {
        const k = normalizeStr(s?.name)
        if (k) storageNameCounts.set(k, (storageNameCounts.get(k) || 0) + 1)
      }
      for (const s of storages) {
        const k = normalizeStr(s?.name)
        s.displayName =
          k && storageNameCounts.get(k) > 1 && s.floorName
            ? `${s.name} — ${s.floorName}`
            : s.name
      }
      storageElements.value = storages
      merchElements.value = merch

      // --- Union canonique des shops de la config ---------------------------
      const union = buildConfigShopList(rows, floors)
      if (rowsFailed && union.length) contextWarning.value = 'assignment-partial'

      // --- Menus pour TOUS les shops de l'union (fan-out borné, échec partiel
      //     toléré). Pas de skip sur menuItemsCount : champ non fiable. -------
      const itemsByShopId = new Map()
      const fetchShopMenu = async (entry) => {
        try {
          // configId OBLIGATOIRE : l'assignation menu est scopée par config côté
          // backend. Sans lui → config arbitraire → 0 item (bug inventaire vide).
          await store.dispatch('shopMenuItems/fetchForShop', { shopId: entry.shopId, configId })
          const forShop = store.getters['shopMenuItems/forShop']
          const items =
            typeof forShop === 'function' ? forShop(entry.shopId, configId) || [] : []
          itemsByShopId.set(entry.shopId, items)
        } catch (e) {
          // Shop issu du plan sans record NestJS : 404 = « 0 item », pas un échec.
          const status = e?.response?.status ?? e?.status
          if (entry.source === 'config' && status === 404) itemsByShopId.set(entry.shopId, [])
          // Autre échec : laissé hors de la map → retenté ci-dessous.
        }
      }
      await runWithConcurrency(union, 6, fetchShopMenu)
      if (stale()) return

      // Retry ciblé des shops en échec (backend lent / cold-start Render → timeouts
      // transitoires). Une seule passe, concurrence réduite, avant de conclure au
      // bandeau « chargement partiel ».
      const failedEntries = union.filter((e) => !itemsByShopId.has(e.shopId))
      if (failedEntries.length) {
        await runWithConcurrency(failedEntries, 3, fetchShopMenu)
        if (stale()) return
      }
      let failures = 0
      for (const e of union) if (!itemsByShopId.has(e.shopId)) failures += 1

      const nextShops = []
      const byName = new Map()
      let withItems = 0
      for (const entry of union) {
        if (!itemsByShopId.has(entry.shopId)) continue // fetch en échec
        const items = itemsByShopId.get(entry.shopId)
        // enabled : filtrer si le champ existe ; sinon garder tous (payload ancien).
        const hasEnabledField = items.some((it) => typeof it?.enabled === 'boolean')
        const assigned = hasEnabledField ? items.filter((it) => it?.enabled === true) : items
        const shop = {
          shopId: entry.shopId,
          name: entry.name,
          isOpen: entry.isOpen, // statut d'affichage uniquement (true/false/null)
          floorName: entry.floorName,
          shopType: entry.shopType,
          shopArea: entry.shopArea,
          source: entry.source,
          items: assigned.map((it) => ({
            id: it?.id ?? it?._id ?? it?.name,
            name: String(it?.name ?? '').trim(),
            basePrice: it?.basePrice,
            category: it?.productCategory?.name || it?.category || '',
            picture: it?.picture || null,
          })),
        }
        if (shop.items.length) withItems += 1
        nextShops.push(shop) // conservé même sans item (carte « aucun article assigné »)
        const k = normalizeStr(shop.name)
        if (k) {
          const arr = byName.get(k) || []
          arr.push(shop)
          byName.set(k, arr)
        }
      }

      shops.value = nextShops
      shopsByName.value = byName
      if (failures && nextShops.length) contextWarning.value = 'assignment-partial'
      else if (failures && !nextShops.length) contextError.value = 'assignment-failed'

      // --- Diagnostic (isole la cause si vide) -------------------------------
      const configOnly = union.filter((e) => e.source === 'config').length
      // eslint-disable-next-line no-console
      console.log(
        `[inventory] space=${rows.length} rows config, union=${union.length}, ` +
          `config-only=${configOnly}, avec-items=${withItems}, échecs=${failures}, ` +
          `clés=[${[...byName.keys()].slice(0, 12).join(', ')}]`,
      )
    })()
      .finally(() => {
        inflight.delete(key)
        if (!stale()) contextLoading.value = false
      })

    inflight.set(key, run)
    return run
  }

  /**
   * Items assignés enrichis catalogue : le catalogue fournit la STRUCTURE de
   * décomposition (components/readyForSale/comboItem), l'API l'enabled/basePrice.
   * Nom final = catalogue → API → id. Article encore sans nom → écarté.
   */
  function enrichForBuild(item) {
    const catalog =
      (item?.id != null && catalogById.value.get(String(item.id))) ||
      catalogByName.value.get(normalizeStr(item?.name)) ||
      null
    const name =
      (catalog?.name && String(catalog.name).trim()) ||
      (item?.name && String(item.name).trim()) ||
      (item?.id != null ? String(item.id) : '')
    if (!name) return null
    if (catalog) {
      // Préserve components/readyForSale/comboItem du catalogue ; complète le prix.
      return { ...catalog, name, basePrice: catalog.basePrice ?? item?.basePrice }
    }
    return {
      id: item?.id ?? name,
      name,
      category: item?.category || '',
      basePrice: item?.basePrice,
      components: [],
    }
  }

  /** [{ element, availableMenuItems, consolidatedInventory }] — une carte par shopId. */
  const shopsWithInventory = computed(() =>
    shops.value.map((shop) => {
      const availableMenuItems = shop.items.map(enrichForBuild).filter(Boolean)
      const consolidatedInventory = availableMenuItems.length
        ? buildConsolidatedInventory(
            availableMenuItems,
            menuItems.value,
            marketPrices.value,
            false,
            components.value,
          )
        : []
      return {
        element: {
          id: shop.shopId,
          name: shop.name,
          shopType: shop.shopType ?? null,
          shopArea: shop.shopArea ?? null,
          floorName: shop.floorName ?? null,
          isOpen: shop.isOpen,
        },
        availableMenuItems,
        consolidatedInventory,
      }
    }),
  )

  const storagesWithInventory = computed(() => {
    const fbElements = shopsWithInventory.value.map((s) => ({
      id: s.element.id,
      name: s.element.name,
      availableMenuItems: s.availableMenuItems,
    }))
    return storageElements.value.map((el) => {
      const types = Array.isArray(el.storageType) ? el.storageType : []
      // marketPrices : même renommage market-price que côté shops (clé de denrée
      // identique shop↔storage — indispensable au ledger Logistic keyé par nom).
      const storageInventory = buildStorageInventory(
        types, fbElements, menuItems.value, el.selectedShops, components.value, marketPrices.value,
      )
      return { element: el, storageInventory }
    })
  })

  const merchWithInventory = computed(() => {
    const merchEls = merchElements.value.map((m) => ({
      id: m.id,
      name: m.name,
      merchItems: Array.isArray(m.merchItems) ? m.merchItems : [],
    }))
    const merchInventory = buildMerchStorageInventory(merchEls)
    return merchInventory.length
      ? [{ element: { id: 'merch-aggregate', name: 'Merch Aggregate' }, merchInventory }]
      : []
  })

  return {
    loadContext,
    resetContext,
    shops,
    shopsByName,
    shopsWithInventory,
    storagesWithInventory,
    merchWithInventory,
    contextLoading,
    contextError,
    contextWarning,
  }
}
