// src/store/modules/inventory.js
// Vuex module: inventaire (counts par space+event, market prices, packaging types).

import {
  getInventory as apiGetInventory,
  saveInventory as apiSaveInventory,
  saveInventoryCount as apiSaveInventoryCount,
  getAllPackagingTypes as apiGetAllPackagingTypes,
} from '@/api/endpoints/inventory.api'
import { getMarketPrices } from '@/api/endpoints/market.price.api'
import { isDemoMode } from '@/utils/demoMode'
import * as localDb from '@/data/localDb'

// Persistance locale (localStorage) déléguée à localDb — source unique de clé,
// partagée avec SpaceRestockView.
const loadCountsFromLS = (spaceId, eventId) => localDb.getInventoryCounts(spaceId, eventId)
const saveCountsToLS = (spaceId, eventId, counts) => localDb.setInventoryCounts(spaceId, eventId, counts)

// TTL du cache mémoire pour market prices / packaging types (cf. getters isXCacheValid).
const TTL = 15 * 60 * 1000 // 15 minutes

// packedUnits / looseUnits ne peuvent pas être < 0 (validation backend @Min(0)
// sur POST /inventory-counts). On clampe ici — chokepoint unique de toutes les
// saisies (input, steppers, mobile) — pour éviter le 400 "must not be less than 0".
function sanitizeCountPatch(patch = {}) {
  const out = { ...patch }
  for (const key of ['packedUnits', 'looseUnits']) {
    if (out[key] != null) out[key] = Math.max(0, Number(out[key]) || 0)
  }
  return out
}

// Dédup des chargements concurrents : SpaceInventoryView déclenche loadInventory
// 2× au montage (set selectedEventId → watcher, + dispatch explicite). On coalesce
// les appels identiques (même spaceId/eventId) en vol → un seul GET.
let _loadInFlight = null
let _loadInFlightKey = null

const state = () => ({
  inventoryCounts: {}, // { [shopId]: { [itemId]: InventoryCount } }
  marketPrices: [],
  marketPricesCachedAt: null,
  packagingTypes: [],
  packagingTypesCachedAt: null,
  lastEvent: null,
  loading: false,
  saving: false,
  error: null,
  currentSpaceId: null,
  currentEventId: null,
})

const getters = {
  countFor: (state) => (shopId, itemId) => state.inventoryCounts?.[shopId]?.[itemId] || null,
  countedInShop: (state) => (shopId) =>
    Object.values(state.inventoryCounts?.[shopId] || {}).filter((c) => c?.isCounted).length,
  marketPriceById: (state) => (id) => state.marketPrices.find((m) => m.id === id) || null,
  isMarketPricesCacheValid: (state) =>
    state.marketPricesCachedAt !== null && Date.now() - state.marketPricesCachedAt < TTL,
  isPackagingTypesCacheValid: (state) =>
    state.packagingTypesCachedAt !== null && Date.now() - state.packagingTypesCachedAt < TTL,
}

const mutations = {
  SET_LOADING(state, v) { state.loading = !!v },
  SET_SAVING(state, v) { state.saving = !!v },
  SET_ERROR(state, v) { state.error = v || null },
  SET_INVENTORY_COUNTS(state, v) { state.inventoryCounts = v || {} },
  UPSERT_COUNT(state, { shopId, itemId, patch, eventId }) {
    const shopCounts = { ...(state.inventoryCounts[shopId] || {}) }
    const prev = shopCounts[itemId] || { itemId }
    shopCounts[itemId] = { ...prev, ...patch, itemId, eventId: eventId ?? prev.eventId ?? null }
    state.inventoryCounts = { ...state.inventoryCounts, [shopId]: shopCounts }
  },
  SET_MARKET_PRICES(state, v) {
    state.marketPrices = Array.isArray(v) ? v : []
    state.marketPricesCachedAt = Date.now()
  },
  SET_PACKAGING_TYPES(state, v) {
    state.packagingTypes = Array.isArray(v) ? v : []
    state.packagingTypesCachedAt = Date.now()
  },
  INVALIDATE_MARKET_PRICES(state) { state.marketPricesCachedAt = null },
  INVALIDATE_PACKAGING_TYPES(state) { state.packagingTypesCachedAt = null },
  SET_LAST_EVENT(state, v) { state.lastEvent = v || null },
  SET_CONTEXT(state, { spaceId, eventId }) {
    state.currentSpaceId = spaceId || null
    state.currentEventId = eventId || null
  },
  // Contexte invalide (inventaire ouvert sans ?event valide) : vide l'AFFICHAGE
  // (comptages en mémoire + erreur + contexte). NE TOUCHE PAS localStorage/DB —
  // la persistance des comptages d'un autre event reste intacte.
  CLEAR_CONTEXT(state) {
    state.inventoryCounts = {}
    state.error = null
    state.currentSpaceId = null
    state.currentEventId = null
    state.loading = false
  },
}

const actions = {
  loadInventory({ commit, state }, { spaceId, eventId }) {
    const key = `${spaceId}::${eventId}`
    // Si un chargement identique est déjà en vol, on le réutilise (pas de 2e GET).
    if (_loadInFlight && _loadInFlightKey === key) return _loadInFlight

    commit('SET_CONTEXT', { spaceId, eventId })
    commit('SET_LOADING', true)
    commit('SET_ERROR', null)

    // Anti-obsolète : le contexte demandé. Une réponse tardive (event A) ne doit
    // JAMAIS écraser les comptages / couper le spinner d'un event B plus récent.
    const isActive = () =>
      String(state.currentSpaceId ?? '') === String(spaceId) &&
      String(state.currentEventId ?? '') === String(eventId)

    _loadInFlightKey = key
    _loadInFlight = (async () => {
      try {
        // Mode démo : zéro réseau, DB locale = source de vérité.
        if (isDemoMode()) {
          console.log('[inventory] 📥 loadInventory — mode démo, lecture localStorage', { spaceId, eventId })
          const local = loadCountsFromLS(spaceId, eventId)
          if (isActive()) commit('SET_INVENTORY_COUNTS', local)
          return
        }

        // Mode réel : l'API est la source de vérité. Le backend doit retourner
        // { inventoryCounts: {...} } (même vide) — plus de 404, plus de merge local.
        console.log(`[inventory] 📥 loadInventory — GET /inventory/${spaceId}/${eventId} …`)
        const remote = await apiGetInventory(spaceId, eventId)
        const counts = remote?.inventoryCounts ?? {}
        const shopCount = Object.keys(counts).length
        const itemCount = Object.values(counts).reduce((n, s) => n + Object.keys(s || {}).length, 0)
        if (!isActive()) {
          console.log(`[inventory] 📥⏭️ réponse obsolète ignorée (${key} ≠ contexte actif)`)
          return
        }
        commit('SET_INVENTORY_COUNTS', counts)
        console.log(`[inventory] 📥✅ loadInventory OK — ${shopCount} boutique(s), ${itemCount} comptage(s) depuis l'API`)
      } catch (e) {
        // API KO — garder le state existant, ne pas l'écraser.
        console.error('[inventory] 📥❌ loadInventory ÉCHEC —', e?.response?.status, e?.response?.data ?? e?.message)
        // 401 = session expirée : l'intercepteur (client.js) gère déjà le refresh
        // puis la redirection /login. Pas de toast "erreur serveur" en doublon.
        if (e?.response?.status !== 401 && isActive()) {
          commit('SET_ERROR', e?.userMessage || 'Impossible de charger l\'inventaire (erreur serveur).')
        }
      } finally {
        // Ne couper le spinner que si on est encore le contexte actif (sinon on
        // masquerait le chargement d'un event plus récent).
        if (isActive()) commit('SET_LOADING', false)
        if (_loadInFlightKey === key) {
          _loadInFlight = null
          _loadInFlightKey = null
        }
      }
    })()
    return _loadInFlight
  },
  /** Contexte invalide : vide l'affichage (délègue à la mutation). */
  clearContext({ commit }) {
    commit('CLEAR_CONTEXT')
  },

  /** Sauvegarde un comptage unitaire (debounced côté view si besoin). */
  async upsertCount({ state, commit }, { shopId, itemId, patch }) {
    const eventId = state.currentEventId
    // Clampe packed/loose ≥ 0 avant commit ET envoi (cf. sanitizeCountPatch).
    const safePatch = sanitizeCountPatch(patch)
    // Optimistic UI : commit immédiat.
    commit('UPSERT_COUNT', { shopId, itemId, patch: safePatch, eventId })

    // Mode démo : persistance locale pour survivre au reload, pas de réseau.
    if (isDemoMode()) {
      saveCountsToLS(state.currentSpaceId, eventId, state.inventoryCounts)
      return
    }

    // Mode réel : l'API est la source de vérité. On ne re-throw pas (appelants
    // fire-and-forget) — l'erreur passe par SET_ERROR → toast dans la vue.
    try {
      // Le backend valide un DTO complet (NestJS ValidationPipe). On envoie donc
      // l'objet count fusionné — pas le patch partiel — avec des valeurs par défaut
      // sûres, sinon un champ requis manquant (ex: looseUnits) renvoie 400.
      // Le DTO backend déployé est en whitelist stricte (forbidNonWhitelisted).
      // On n'envoie que le noyau accepté : tout champ hors liste (discardedQuantity,
      // storageLocation, countingStatus…) renvoie 400. Ces champs restent persistés
      // localement + dans le snapshot complet (POST /inventory, colonne Json).
      const current = state.inventoryCounts[shopId]?.[itemId] || {}
      const payload = {
        spaceId: state.currentSpaceId,
        shopId,
        itemId,
        packedUnits: Number(current.packedUnits) || 0,
        looseUnits: Number(current.looseUnits) || 0,
        isCounted: Boolean(current.isCounted),
      }
      // eventId est un champ UUID côté backend : ne jamais envoyer `null`
      // (sinon @IsUUID rejette → 400). On l'omet quand aucun event n'est choisi.
      if (eventId) payload.eventId = eventId
      console.log('[inventory] 📤 upsertCount — POST /inventory-counts …', payload)
      await apiSaveInventoryCount(payload)
      console.log('[inventory] 📤✅ upsertCount OK — comptage sauvegardé en BDD', { shopId, itemId })
    } catch (e) {
      // Log détaillé du 400 (validation backend) pour diagnostic…
      console.error(
        '[inventory] 📤❌ upsertCount ÉCHEC —',
        e?.response?.status,
        e?.response?.data ?? e?.message,
      )
      // …et toast utilisateur (UX upstream). En mode réel l'API est source de vérité.
      commit('SET_ERROR', e?.userMessage || e?.message || 'Échec de la sauvegarde du comptage')
    }
  },

  /** Sauvegarde snapshot complet (bouton Save). API source de vérité hors démo. */
  async saveInventory({ state, commit, dispatch }) {
    commit('SET_SAVING', true)
    try {
      // Mode démo : persistance locale uniquement, pas de réseau.
      if (isDemoMode()) {
        saveCountsToLS(state.currentSpaceId, state.currentEventId, state.inventoryCounts)
        return
      }
      // Mode réel : l'erreur remonte (awaited par onSaveAll → toast + pas de nav).
      console.log(`[inventory] 💾 saveInventory — POST /inventory (snapshot) space=${state.currentSpaceId} event=${state.currentEventId} …`)
      await apiSaveInventory({
        spaceId: state.currentSpaceId,
        eventId: state.currentEventId,
        inventoryCounts: state.inventoryCounts,
      })
      console.log('[inventory] 💾✅ saveInventory OK — snapshot complet sauvegardé en BDD')
      // Notif « comptage terminé » : UNE fois, à la clôture du snapshot (pas par item
      // dans upsertCount, qui est appelé en boucle → spam).
      const counted = Object.keys(state.inventoryCounts || {}).length
      dispatch(
        'notifications/push',
        {
          type: 'inventory',
          title: 'Comptage enregistré',
          message: counted ? `${counted} article(s) comptés` : 'Snapshot inventaire sauvegardé',
          meta: { spaceId: state.currentSpaceId, eventId: state.currentEventId },
        },
        { root: true },
      )
    } finally {
      commit('SET_SAVING', false)
    }
  },

  async loadMarketPrices({ state, commit, getters }, { forceRefresh = false } = {}) {
    if (!forceRefresh && getters.isMarketPricesCacheValid) {
      // NB : `state` DOIT venir du contexte d'action (le `state` module-level est
      // la FACTORY → .marketPrices undefined → crash au premier cache hit).
      console.log(`[inventory] 💰 loadMarketPrices — déjà en cache (${state.marketPrices?.length ?? 0}), skip`)
      return
    }
    // Mode démo : zéro réseau (évite 401 → router.push('/login')). Liste vide.
    if (isDemoMode()) {
      console.log('[inventory] 💰 loadMarketPrices — mode démo, aucun appel réseau (coûts vides)')
      commit('SET_MARKET_PRICES', [])
      return
    }
    // SWR : hydrate immédiat depuis le cache disque (cross-session) si le store est
    // vide → stock affichable sans attendre la query backend (~60s / cold-start Render).
    // Le refresh réseau ci-dessous MAJ ensuite le store + réécrit le cache.
    if (!state.marketPrices?.length) {
      const cached = localDb.getMarketPricesCache()
      if (cached && cached.length) {
        commit('SET_MARKET_PRICES', cached)
        console.log(`[inventory] 💰 loadMarketPrices — hydraté depuis cache disque (${cached.length}), refresh réseau en fond…`)
      }
    }
    console.log('[inventory] 💰 loadMarketPrices — GET /market-prices …')
    try {
      const data = await getMarketPrices()
      const list = Array.isArray(data) ? data : data?.data || []
      commit('SET_MARKET_PRICES', list)
      localDb.setMarketPricesCache(list)
      console.log(`[inventory] 💰✅ loadMarketPrices OK — ${list.length} coût(s) récupéré(s) depuis l'API`, list.slice(0, 3))
    } catch (e) {
      console.error('[inventory] 💰❌ loadMarketPrices ÉCHEC —', e?.response?.status, e?.response?.data ?? e?.message)
    }
  },

  async loadPackagingTypes({ state, commit, getters }, { forceRefresh = false } = {}) {
    if (!forceRefresh && getters.isPackagingTypesCacheValid) {
      console.log(`[inventory] 📦 loadPackagingTypes — déjà en cache (${state.packagingTypes?.length ?? 0}), skip`)
      return
    }
    // Mode démo : zéro réseau (évite 401 → router.push('/login')). Liste vide.
    if (isDemoMode()) {
      console.log('[inventory] 📦 loadPackagingTypes — mode démo, aucun appel réseau (liste vide)')
      commit('SET_PACKAGING_TYPES', [])
      return
    }
    console.log('[inventory] 📦 loadPackagingTypes — GET /packaging …')
    try {
      const data = await apiGetAllPackagingTypes()
      const list = Array.isArray(data) ? data : data?.data || []
      commit('SET_PACKAGING_TYPES', list)
      console.log(`[inventory] 📦✅ loadPackagingTypes OK — ${list.length} type(s) d'emballage depuis l'API`)
    } catch (e) {
      console.error('[inventory] 📦❌ loadPackagingTypes ÉCHEC —', e?.response?.status, e?.response?.data ?? e?.message)
    }
  },

  invalidateMarketPrices({ commit }) {
    commit('INVALIDATE_MARKET_PRICES')
  },

  invalidatePackagingTypes({ commit }) {
    commit('INVALIDATE_PACKAGING_TYPES')
  },

  /** Sélectionne automatiquement le dernier event passé pour ce space. */
  resolveLastPastEvent({ commit, rootState }, { spaceId } = {}) {
    const events = rootState.analyse?.events || []
    const now = Date.now()
    const past = events
      .filter((e) => {
        if (!spaceId) return true
        const evSpaceId = e.spaceId || e.space?.id || null
        return !evSpaceId || String(evSpaceId) === String(spaceId)
      })
      .filter((e) => {
        const d = new Date(e.date || e.eventDate)
        return !Number.isNaN(d.getTime()) && d.getTime() <= now
      })
      .sort((a, b) => {
        const da = new Date(a.date || a.eventDate).getTime()
        const db = new Date(b.date || b.eventDate).getTime()
        return db - da
      })
    const last = past[0] || null
    commit('SET_LAST_EVENT', last)
    return last
  },
}

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions,
}
