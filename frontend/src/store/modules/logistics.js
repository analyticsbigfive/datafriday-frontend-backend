// src/store/modules/logistics.js
// Vuex module : Logistic — stock attendu par PDV/Storage (ledger backend),
// mouvements +/−, historique par élément, reset après inventaire, réconciliations.
//
// Clé item = `itemKey` = NOM du référentiel d'inventaire (même clé que
// buildConsolidatedInventory : itemName market price, nom d'ingrédient/composant
// ou de menu item). L'attendu affiché = StockLevel − consommation ventes, avec
// « casse de pack » (le vrac négatif emprunte des packs, cf. normalizeExpected).

import {
  getLogisticsStock,
  createStockMovement,
  getElementHistory,
  resetLogisticsInventory,
  getReconciliations,
  getMarketPricesForItem,
  simulateSale,
  purgeSimulatedSales,
} from '@/api/endpoints/logistics.api'

const keyOf = (elementId, itemKey) => `${elementId}::${String(itemKey ?? '').trim()}`

/**
 * Casse de pack (miroir de LogisticsService.normalizeLevel) : un vrac négatif
 * emprunte des packs entiers (packed −1, loose += unitsPerPack), puis clamp ≥ 0.
 */
export function normalizeExpected(packed, loose, unitsPerPack) {
  let p = Number(packed) || 0
  let l = Number(loose) || 0
  const upp = Number(unitsPerPack) > 0 ? Number(unitsPerPack) : null
  if (upp && l < -1e-9 && p > 0) {
    const borrowed = Math.min(p, Math.ceil((-l - 1e-9) / upp))
    p -= borrowed
    l += borrowed * upp
  }
  if (p < 0) p = 0
  if (l < 0) l = 0
  return { packed: p, loose: Math.round(l * 100) / 100 }
}

// Anti-race : une réponse stock obsolète ne doit pas écraser un espace plus récent.
let _stockSeq = 0

const state = () => ({
  spaceId: null,
  space: null, // { id, name } — résolu par /stock, plus besoin d'analyse/loadSpace
  configurations: [], // [{ id, name }]
  resolvedConfigId: null,
  elements: [], // [{ id, name, type, items: [{name,id,unit,marketPriceId,unitsPerPack,picture,usedIn}] }]
  levels: {}, // { `${elementId}::${itemKey}`: StockLevel }
  consumption: {}, // { `${elementId}::${itemKey}`: quantity (unités loose vendues) }
  anchor: null, // { at, reconciliationId } | null
  reconciliations: [],
  loading: false,
  saving: false,
  resetting: false,
  error: null,
})

const getters = {
  /** Éléments PDV (tous types sauf storage — cf. LogisticsService.SHOP_TYPES côté back). */
  shopElements: (state) => state.elements.filter((e) => e.type !== 'storage'),
  storageElements: (state) => state.elements.filter((e) => e.type === 'storage'),
  levelFor: (state) => (elementId, itemKey) => state.levels[keyOf(elementId, itemKey)] || null,
  consumedFor: (state) => (elementId, itemKey) => state.consumption[keyOf(elementId, itemKey)] || 0,
  /** Stock attendu affiché (packed/loose) après ventes + casse de pack. */
  expectedFor: (state, getters) => (elementId, itemKey) => {
    const level = getters.levelFor(elementId, itemKey)
    const consumed = getters.consumedFor(elementId, itemKey)
    if (!level && !consumed) return null
    return {
      ...normalizeExpected(
        level?.packedUnits ?? 0,
        (level?.looseUnits ?? 0) - consumed,
        level?.unitsPerPack,
      ),
      unitsPerPack: level?.unitsPerPack ?? null,
      marketPriceId: level?.marketPriceId ?? null,
    }
  },
}

const mutations = {
  SET_LOADING(state, v) { state.loading = !!v },
  SET_SAVING(state, v) { state.saving = !!v },
  SET_RESETTING(state, v) { state.resetting = !!v },
  SET_ERROR(state, v) { state.error = v || null },
  SET_STOCK(state, { spaceId, space, configurations, resolvedConfigId, elements, levels, consumption, anchor }) {
    state.spaceId = spaceId || null
    state.space = space || null
    state.configurations = Array.isArray(configurations) ? configurations : []
    state.resolvedConfigId = resolvedConfigId || null
    state.elements = Array.isArray(elements) ? elements : []
    const levelMap = {}
    for (const l of levels || []) levelMap[keyOf(l.elementId, l.itemKey)] = l
    const consMap = {}
    for (const c of consumption || []) consMap[keyOf(c.elementId, c.itemKey)] = Number(c.quantity) || 0
    state.levels = levelMap
    state.consumption = consMap
    state.anchor = anchor || null
  },
  UPSERT_LEVEL(state, level) {
    if (!level) return
    state.levels = { ...state.levels, [keyOf(level.elementId, level.itemKey)]: level }
  },
  SET_RECONCILIATIONS(state, v) { state.reconciliations = Array.isArray(v) ? v : [] },
  CLEAR(state) {
    state.spaceId = null
    state.space = null
    state.configurations = []
    state.resolvedConfigId = null
    state.elements = []
    state.levels = {}
    state.consumption = {}
    state.anchor = null
    state.reconciliations = []
    state.error = null
    state.loading = false
    state.saving = false
    state.resetting = false
  },
}

const actions = {
  async loadStock({ commit }, { spaceId, configId, eventId } = {}) {
    if (!spaceId) return
    const mySeq = ++_stockSeq
    commit('SET_LOADING', true)
    commit('SET_ERROR', null)
    try {
      const data = await getLogisticsStock(spaceId, configId, eventId)
      if (mySeq !== _stockSeq) return // réponse obsolète
      commit('SET_STOCK', {
        spaceId,
        space: data?.space || null,
        configurations: data?.configurations || [],
        resolvedConfigId: data?.resolvedConfigId || null,
        elements: data?.elements || [],
        levels: data?.levels || [],
        consumption: data?.consumption || [],
        anchor: data?.anchor || null,
      })
    } catch (e) {
      console.error('[logistics] 📥❌ loadStock ÉCHEC —', e?.response?.status, e?.response?.data ?? e?.message)
      if (mySeq === _stockSeq && e?.response?.status !== 401) {
        commit('SET_ERROR', e?.userMessage || 'Impossible de charger le stock logistique.')
      }
    } finally {
      if (mySeq === _stockSeq) commit('SET_LOADING', false)
    }
  },

  /**
   * Crée un mouvement (+/−). L'API renvoie les niveaux mis à jour (élément +
   * contrepartie éventuelle) qu'on merge — pas de reload complet. Re-throw pour
   * que le dialog affiche l'erreur et reste ouvert.
   */
  async createMovement({ commit }, movement) {
    commit('SET_SAVING', true)
    try {
      const res = await createStockMovement(movement)
      // Invalide tout loadStock parti AVANT le mouvement : sa réponse (snapshot
      // pré-mouvement) écraserait les niveaux qu'on merge à l'instant.
      _stockSeq += 1
      commit('UPSERT_LEVEL', res?.level)
      commit('UPSERT_LEVEL', res?.counterpartyLevel)
      return res
    } catch (e) {
      console.error('[logistics] 📤❌ createMovement ÉCHEC —', e?.response?.status, e?.response?.data ?? e?.message)
      throw e
    } finally {
      commit('SET_SAVING', false)
    }
  },

  /** Historique d'un élément (non mis en cache : drawer ponctuel). */
  async loadHistory(_ctx, { elementId, limit, cursor }) {
    return getElementHistory(elementId, { limit, cursor })
  },

  /**
   * Inventory Reset : le référentiel + comptages sont mappés côté vue en lignes
   * { elementId, itemKey, countedPacked, countedLoose, unitsPerPack? }.
   * Recharge le stock (nouvelle ancre) puis les réconciliations.
   */
  async reset({ commit, dispatch }, { spaceId, eventId, eventName, lines }) {
    commit('SET_RESETTING', true)
    try {
      const payload = { lines }
      if (eventId) payload.eventId = eventId
      if (eventName) payload.eventName = eventName
      const res = await resetLogisticsInventory(spaceId, payload)
      await Promise.all([
        dispatch('loadStock', { spaceId }),
        dispatch('loadReconciliations', { spaceId }),
      ])
      return res
    } catch (e) {
      console.error('[logistics] 🔄❌ reset ÉCHEC —', e?.response?.status, e?.response?.data ?? e?.message)
      throw e
    } finally {
      commit('SET_RESETTING', false)
    }
  },

  async loadReconciliations({ commit }, { spaceId }) {
    try {
      const data = await getReconciliations(spaceId)
      commit('SET_RECONCILIATIONS', Array.isArray(data) ? data : data?.data || [])
    } catch (e) {
      // 403 attendu pour les rôles sans front.fb.logisticReconcile — silencieux.
      if (e?.response?.status !== 403) {
        console.error('[logistics] 📋❌ loadReconciliations ÉCHEC —', e?.response?.status, e?.message)
      }
      commit('SET_RECONCILIATIONS', [])
    }
  },

  /** Market prices candidats pour le popup +/− d'une denrée (scopé, pas le catalogue complet). */
  async loadMarketPricesForItem(_ctx, { spaceId, itemKey }) {
    try {
      return await getMarketPricesForItem(spaceId, itemKey)
    } catch (e) {
      console.error('[logistics] 💰❌ loadMarketPricesForItem ÉCHEC —', e?.response?.status, e?.message)
      return []
    }
  },

  /**
   * QA — simule une vente Weezevent. NE recharge PAS le stock (le layer vue a
   * besoin de lire l'« avant » depuis le state courant avant de déclencher
   * `loadStock`, pour afficher le récap avant/après) — c'est à l'appelant de
   * dispatcher `loadStock` après coup.
   */
  async simulateSale(_ctx, { spaceId, elementId, lines, realMode, ensureLiveEvent }) {
    return simulateSale(spaceId, { elementId, lines, realMode, ensureLiveEvent })
  },

  /** QA — purge les ventes simulées d'un PDV puis recharge le stock. */
  async purgeSimulatedSales({ dispatch }, { spaceId, elementId }) {
    const res = await purgeSimulatedSales(spaceId, elementId)
    await dispatch('loadStock', { spaceId })
    return res
  },

  clear({ commit }) {
    _stockSeq += 1
    commit('CLEAR')
  },
}

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions,
}
