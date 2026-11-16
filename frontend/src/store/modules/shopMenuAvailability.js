import {
  getShopAvailableMenuItems,
  getSpaceMenuItemsWithAvailability,
  getSpaceMenuConfiguration,
} from '@/api/endpoints/menu.api'
import { applyEnabledChanges } from '@/utils/shopMenuAssignmentMaps'
import { loadShopRowsForConfig } from '@/utils/shopMenuAvailabilityBatch'

/**
 * Catalogue d'un shop avec DISPONIBILITÉ calculée côté serveur — BUG-291-02.
 *
 * Source : `GET /space-menu/shop/:id/items` (payload LÉGER : id, nom, catégorie,
 * prix, `available`, `hasRecipe`, `missingIngredients`, `enabled`, `assigned`).
 *
 * ⚠️ NE PAS confondre avec le store `shopMenuItems`, qui interroge
 * `GET /space-menu/shop/:id` — payload LOURD portant les RECETTES complètes
 * (composants, ingrédients, coûts). L'Inventaire en dépend pour construire son
 * arbre (`useInventoryData.js`) : les deux endpoints ne sont pas
 * interchangeables, d'où deux stores distincts plutôt qu'une migration.
 *
 * `available` est la MÊME valeur que celle affichée par le tiroir Space Menu
 * (`ShopMenuItemsDrawer`) : un article « non disponible » là-bas l'est ici aussi,
 * sans re-dérivation front — c'est ce qui garantit que les deux écrans ne
 * divergent pas.
 */

const TTL = 15 * 60 * 1000 // 15 minutes — aligné sur shopMenuItems

// Single-flight HORS state Vuex (une Promise dans un state réactif = anti-pattern) :
// deux appels concurrents attendent la MÊME Promise, le getter n'est jamais lu
// vide par une course.
const inflight = new Map()

function cacheKey(shopId, configId) {
  return `${shopId}::${configId || ''}`
}

function unwrap(res) {
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  return []
}

export default {
  namespaced: true,

  state: () => ({
    cache: {}, // { [`${shopId}::${configId}`]: { rows: [], cachedAt: number } }
    fetching: {},
  }),

  getters: {
    forShop: (state) => (shopId, configId) => state.cache[cacheKey(shopId, configId)]?.rows || [],
    isCacheValidForShop: (state) => (shopId, configId) => {
      const entry = state.cache[cacheKey(shopId, configId)]
      return !!entry && Date.now() - entry.cachedAt < TTL
    },
    /** Set des ids NON disponibles pour ce shop — `available === false` strict. */
    unavailableIdsForShop: (state) => (shopId, configId) => {
      const rows = state.cache[cacheKey(shopId, configId)]?.rows || []
      return new Set(rows.filter((r) => r?.available === false).map((r) => String(r.id)))
    },
  },

  mutations: {
    SET_FOR_SHOP(state, { shopId, configId, rows }) {
      const k = cacheKey(shopId, configId)
      state.cache = { ...state.cache, [k]: { rows, cachedAt: Date.now() } }
    },
    SET_FETCHING_FOR_SHOP(state, { shopId, configId, val }) {
      state.fetching = { ...state.fetching, [cacheKey(shopId, configId)]: val }
    },
    /**
     * BUG-387-02 : reflète en mémoire une activation/désactivation DÉJÀ écrite en base,
     * au lieu de purger l'entrée. Purger obligeait chaque écran à re-télécharger le
     * menu du shop (Event Predict relisait ceux de TOUS les PdV de la config à chaque
     * case cochée) ; seul `enabled` bouge ici, `assigned` et `available` restent les
     * vérités serveur. `cachedAt` est CONSERVÉ : la fraîcheur de la donnée n'a pas
     * changé, on vient d'y appliquer exactement ce que le serveur a enregistré.
     */
    PATCH_ENABLED_FOR_SHOP(state, { shopId, configId, changes } = {}) {
      const k = cacheKey(shopId, configId)
      const entry = state.cache[k]
      if (!entry) return
      const { rows } = applyEnabledChanges(entry.rows, changes)
      state.cache = { ...state.cache, [k]: { rows, cachedAt: entry.cachedAt } }
    },
    INVALIDATE_FOR_SHOP(state, { shopId, configId } = {}) {
      const cache = { ...state.cache }
      if (configId !== undefined) {
        delete cache[cacheKey(shopId, configId)]
      } else {
        for (const k of Object.keys(cache)) {
          if (k.startsWith(`${shopId}::`)) delete cache[k]
        }
      }
      state.cache = cache
    },
  },

  actions: {
    async fetchForShop({ commit, getters }, { shopId, configId = null, forceRefresh = false } = {}) {
      if (!shopId) return
      if (!forceRefresh && getters.isCacheValidForShop(shopId, configId)) return
      const key = cacheKey(shopId, configId)
      if (inflight.has(key)) return inflight.get(key)
      commit('SET_FETCHING_FOR_SHOP', { shopId, configId, val: true })
      const p = (async () => {
        try {
          // `enabledOnly` NON passé : on veut aussi les items assignés-mais-désactivés
          // pour l'index d'appartenance (`shopMenuMembership`), qui sert de garde-fou
          // anti-ouverture avec un article hors menu.
          const res = await getShopAvailableMenuItems(shopId, configId)
          commit('SET_FOR_SHOP', { shopId, configId, rows: unwrap(res) })
        } finally {
          commit('SET_FETCHING_FOR_SHOP', { shopId, configId, val: false })
          inflight.delete(key)
        }
      })()
      inflight.set(key, p)
      return p
    },

    /**
     * Remplit le cache de PLUSIEURS shops d'une configuration en 2 appels (articles de
     * l'espace + matrice d'assignation) au lieu d'un `fetchForShop` par shop (N+1), puis
     * `fetchForShop` trouve le cache valide et ne rappelle rien. Voir
     * `utils/shopMenuAvailabilityBatch.js` pour l'équivalence avec la réponse par shop.
     *
     * Ne lève jamais : rend `false` quand le lot est indisponible (échec ou réponse vide),
     * auquel cas rien n'est écrit et la boucle par shop de l'appelant reprend comme avant.
     * Seuls les shops dont le cache n'est pas valide sont écrits (sauf `forceRefresh`).
     * Single-flight par espace + configuration : deux écrans qui chargent en même temps
     * partagent les mêmes 2 appels.
     */
    async hydrateForShops({ commit, getters }, { spaceId, configId = null, shopIds = [], forceRefresh = false } = {}) {
      if (!spaceId || !configId) return false
      const wanted = [...new Set((shopIds || []).map(String).filter(Boolean))].filter(
        (id) => forceRefresh || !getters.isCacheValidForShop(id, configId),
      )
      if (!wanted.length) return true
      const key = `hydrate::${spaceId}::${configId}`
      if (inflight.has(key) && !forceRefresh) {
        const ok = await inflight.get(key)
        // Le lot partagé a pu couvrir un autre sous-ensemble de shops : si certains manquent
        // encore, l'appelant les chargera par shop (cache valide = aucun appel superflu).
        return ok
      }
      const p = (async () => {
        try {
          const byShop = await loadShopRowsForConfig({
            spaceId,
            configId,
            shopIds: wanted,
            fetchSpaceItems: getSpaceMenuItemsWithAvailability,
            fetchMatrix: getSpaceMenuConfiguration,
          })
          if (!byShop) return false
          for (const id of wanted) commit('SET_FOR_SHOP', { shopId: id, configId, rows: byShop[id] })
          return true
        } catch (_) {
          return false
        } finally {
          inflight.delete(key)
        }
      })()
      inflight.set(key, p)
      return p
    },

    /** Voir `PATCH_ENABLED_FOR_SHOP`. No-op si le shop n'est pas en cache. */
    patchEnabledForShop({ commit }, payload) {
      commit('PATCH_ENABLED_FOR_SHOP', payload || {})
    },

    invalidateForShop({ commit }, payload) {
      if (typeof payload === 'string') commit('INVALIDATE_FOR_SHOP', { shopId: payload })
      else commit('INVALIDATE_FOR_SHOP', payload || {})
    },
  },
}
