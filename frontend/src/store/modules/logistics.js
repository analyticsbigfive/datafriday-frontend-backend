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
  confirmTransfer as confirmTransferApi,
  getPendingTransfers,
  getElementHistory,
  resetLogisticsInventory,
  getReconciliations,
  getLossesSummary,
  getLosses,
  archiveLosses as archiveLossesApi,
  getMarketPricesForItem,
  simulateSale,
  purgeSimulatedSales,
  startSimulationRun,
  stopSimulationRun,
  getActiveSimulationRun,
  getSimulationRuns,
  getSimulatedSalesHistory,
  purgeSimulatedSalesByIds,
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
  resolvedConfigId: null, // id de config, ou 'all' = vue agrégée toutes configs (chantier 341)
  // Event le plus proche dans le futur pour cet espace, résolu côté serveur — calibre le
  // "besoin prédit" par défaut (feuille de réarmement) sans ?event= explicite dans l'URL.
  nextEventId: null,
  // [{ id, name, type, items: [...], configIds?: string[] }] — configIds uniquement peuplé
  // quand resolvedConfigId === 'all' (chantier 341) : ids des configs où l'élément a au
  // moins un MenuAssignment actif, pour le tag "Plan Max, Plan Réduit" sur les lignes PDV.
  elements: [],
  levels: {}, // { `${elementId}::${itemKey}`: StockLevel }
  consumption: {}, // { `${elementId}::${itemKey}`: quantity (unités loose vendues) }
  anchor: null, // { at, reconciliationId } | null
  reconciliations: [],
  // BUG-259-02 : transferts PENDING par élément, dans les deux sens :
  // { [elementId]: { incoming: [...], outgoing: [...] } }. incoming = émis vers cet
  // élément (à confirmer ici) ; outgoing = émis par cet élément, encore en attente
  // côté destinataire (garde une trace visible côté source jusqu'à validation).
  pendingTransfers: {},
  // BUG-259-02 : section "Pertes" (distincte de Réconciliation), résumé (count +
  // quantités) et liste paginée (cursor), actives par défaut.
  lossesSummary: { count: 0, totalLostPacked: 0, totalLostLoose: 0 },
  losses: [],
  lossesNextCursor: null,
  lossesLoading: false,
  // QA — run d'auto-simulation serveur actif pour l'espace courant (11_LIVE.md,
  // LiveSaleSimulatorWidget.vue), s'il y en a un. Survit au reload — cf. loadActiveSimulationRun.
  activeRun: null,
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
  /** BUG-259-02 : transferts entrants (à confirmer ici) pour un élément, filtrés par denrée. */
  pendingTransfersFor: (state) => (elementId, itemKey) => {
    const all = state.pendingTransfers[elementId]?.incoming || []
    if (!itemKey) return all
    const key = String(itemKey).trim().toLowerCase()
    return all.filter((t) => String(t.itemKey ?? '').trim().toLowerCase() === key)
  },
  /** BUG-259-02 : transferts sortants (émis par cet élément, en attente ailleurs), filtrés par denrée. */
  outgoingPendingTransfersFor: (state) => (elementId, itemKey) => {
    const all = state.pendingTransfers[elementId]?.outgoing || []
    if (!itemKey) return all
    const key = String(itemKey).trim().toLowerCase()
    return all.filter((t) => String(t.itemKey ?? '').trim().toLowerCase() === key)
  },
  /**
   * Item du référentiel (unit/packagingType/unitsPerPack) résolu par nom, pour
   * les écrans qui n'ont que l'itemKey (Pertes) et pas l'objet item complet
   * (contrairement à LogisticItemCard, qui le reçoit déjà en prop). Le référentiel
   * est le même pour tous les éléments : on s'arrête au premier match.
   */
  itemByKey: (state) => (itemKey) => {
    const key = String(itemKey ?? '').trim().toLowerCase()
    if (!key) return null
    for (const el of state.elements) {
      const found = (el.items || []).find((it) => String(it.name ?? '').trim().toLowerCase() === key)
      if (found) return found
    }
    return null
  },
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
  SET_STOCK(state, { spaceId, space, configurations, resolvedConfigId, nextEventId, elements, levels, consumption, anchor }) {
    state.spaceId = spaceId || null
    state.space = space || null
    state.configurations = Array.isArray(configurations) ? configurations : []
    state.resolvedConfigId = resolvedConfigId || null
    state.nextEventId = nextEventId || null
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
  SET_ACTIVE_RUN(state, v) { state.activeRun = v || null },
  SET_PENDING_TRANSFERS(state, { elementId, incoming, outgoing }) {
    state.pendingTransfers = {
      ...state.pendingTransfers,
      [elementId]: { incoming: Array.isArray(incoming) ? incoming : [], outgoing: Array.isArray(outgoing) ? outgoing : [] },
    }
  },
  REMOVE_PENDING_TRANSFER(state, { elementId, movementId }) {
    const current = state.pendingTransfers[elementId] || { incoming: [], outgoing: [] }
    state.pendingTransfers = {
      ...state.pendingTransfers,
      [elementId]: {
        incoming: current.incoming.filter((t) => t.movementId !== movementId),
        outgoing: current.outgoing.filter((t) => t.movementId !== movementId),
      },
    }
  },
  SET_LOSSES_SUMMARY(state, v) {
    state.lossesSummary = v || { count: 0, totalLostPacked: 0, totalLostLoose: 0 }
  },
  SET_LOSSES(state, { losses, nextCursor, append }) {
    state.losses = append ? [...state.losses, ...(losses || [])] : (losses || [])
    state.lossesNextCursor = nextCursor || null
  },
  SET_LOSSES_LOADING(state, v) { state.lossesLoading = !!v },
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
    state.activeRun = null
    state.pendingTransfers = {}
    state.lossesSummary = { count: 0, totalLostPacked: 0, totalLostLoose: 0 }
    state.losses = []
    state.lossesNextCursor = null
    state.lossesLoading = false
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
        nextEventId: data?.nextEventId || null,
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
  async createMovement({ commit, dispatch }, movement) {
    commit('SET_SAVING', true)
    try {
      const res = await createStockMovement(movement)
      // Invalide tout loadStock parti AVANT le mouvement : sa réponse (snapshot
      // pré-mouvement) écraserait les niveaux qu'on merge à l'instant.
      _stockSeq += 1
      commit('UPSERT_LEVEL', res?.level)
      commit('UPSERT_LEVEL', res?.counterpartyLevel)
      // BUG-259-02 : un transfert émis doit apparaître dans "Envoyés, en attente de
      // confirmation" côté source sans avoir à recharger la page : recharge les
      // transferts en attente de l'élément source juste après l'émission.
      const isTransfer = movement.reason === 'TRANSFER_SHOP' || movement.reason === 'TRANSFER_STORAGE'
      if (isTransfer && movement.elementId) {
        dispatch('loadPendingTransfers', { elementId: movement.elementId })
      }
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

  /** BUG-259-02 : transferts en attente de confirmation ciblant cet élément. */
  async loadPendingTransfers({ commit }, { elementId }) {
    try {
      const data = await getPendingTransfers(elementId)
      commit('SET_PENDING_TRANSFERS', { elementId, incoming: data?.incoming, outgoing: data?.outgoing })
    } catch (e) {
      console.error('[logistics] 🚚❌ loadPendingTransfers ÉCHEC —', e?.response?.status, e?.message)
      commit('SET_PENDING_TRANSFERS', { elementId, incoming: [], outgoing: [] })
    }
  },

  /**
   * BUG-259-02 : confirme un transfert (quantités déclarées par défaut, ou
   * modifiées). Retire le transfert de la liste en attente et recharge le stock
   * de l'espace (niveaux source + contrepartie ont changé) et les réconciliations
   * (une perte a pu être journalisée en cas d'écart).
   */
  async confirmTransfer({ commit, dispatch, state }, { movementId, elementId, packed, loose }) {
    commit('SET_SAVING', true)
    try {
      const payload = {}
      if (packed != null) payload.packed = packed
      if (loose != null) payload.loose = loose
      const res = await confirmTransferApi(movementId, payload)
      commit('REMOVE_PENDING_TRANSFER', { elementId, movementId })
      if (state.spaceId) {
        await Promise.all([
          dispatch('loadStock', { spaceId: state.spaceId }),
          dispatch('loadLossesSummary', { spaceId: state.spaceId }),
        ])
      }
      return res
    } catch (e) {
      console.error('[logistics] ✅❌ confirmTransfer ÉCHEC —', e?.response?.status, e?.response?.data ?? e?.message)
      throw e
    } finally {
      commit('SET_SAVING', false)
    }
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

  /** BUG-259-02 : résumé "Pertes" (count + quantités), section distincte de Réconciliation. */
  async loadLossesSummary({ commit }, { spaceId }) {
    try {
      const data = await getLossesSummary(spaceId)
      commit('SET_LOSSES_SUMMARY', data)
    } catch (e) {
      if (e?.response?.status !== 403) {
        console.error('[logistics] 💸❌ loadLossesSummary ÉCHEC —', e?.response?.status, e?.message)
      }
      commit('SET_LOSSES_SUMMARY', { count: 0, totalLostPacked: 0, totalLostLoose: 0 })
    }
  },

  /** BUG-259-02 : première page (ou page suivante si `cursor`) de la liste des pertes. */
  async loadLosses({ commit }, { spaceId, cursor, includeArchived } = {}) {
    commit('SET_LOSSES_LOADING', true)
    try {
      const data = await getLosses(spaceId, { cursor, includeArchived })
      commit('SET_LOSSES', { losses: data?.losses, nextCursor: data?.nextCursor, append: !!cursor })
    } catch (e) {
      console.error('[logistics] 💸❌ loadLosses ÉCHEC —', e?.response?.status, e?.message)
      if (!cursor) commit('SET_LOSSES', { losses: [], nextCursor: null, append: false })
    } finally {
      commit('SET_LOSSES_LOADING', false)
    }
  },

  /** BUG-259-02 : archive ("vide") les pertes actives, puis recharge résumé + liste. */
  async archiveLosses({ commit, dispatch }, { spaceId }) {
    const res = await archiveLossesApi(spaceId)
    await Promise.all([
      dispatch('loadLossesSummary', { spaceId }),
      dispatch('loadLosses', { spaceId }),
    ])
    return res
  },

  /** Market prices candidats pour le popup +/− d'une denrée (scopé, pas le catalogue complet). */
  async loadMarketPricesForItem(_ctx, { spaceId, itemKey, currentMarketPriceId }) {
    try {
      return await getMarketPricesForItem(spaceId, itemKey, currentMarketPriceId)
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

  /** QA — démarre un run d'auto-simulation serveur (survit au reload/fermeture d'onglet). */
  async startSimulationRun({ commit }, { spaceId, intervalMs, realMode, configId }) {
    const run = await startSimulationRun(spaceId, { intervalMs, realMode, configId })
    commit('SET_ACTIVE_RUN', run)
    return run
  },

  /** QA — arrête le run d'auto-simulation actif. */
  async stopSimulationRun({ commit }, { spaceId, runId }) {
    const run = await stopSimulationRun(spaceId, runId)
    commit('SET_ACTIVE_RUN', null)
    return run
  },

  /** QA — reprend/rafraîchit le run actif (appelé au montage du widget et par le poll de statut). */
  async loadActiveSimulationRun({ commit }, { spaceId }) {
    const run = await getActiveSimulationRun(spaceId)
    commit('SET_ACTIVE_RUN', run || null)
    return run
  },

  /** QA — historique des runs (non mis en cache : dialog ponctuel). */
  async loadSimulationRuns(_ctx, { spaceId, limit }) {
    return getSimulationRuns(spaceId, limit)
  },

  /** QA — historique des ventes simulées (non mis en cache : dialog ponctuel). */
  async loadSimulatedSalesHistory(_ctx, { spaceId, limit, cursor }) {
    return getSimulatedSalesHistory(spaceId, { limit, cursor })
  },

  /** QA — purge sélective par ids de transaction, puis recharge le stock. */
  async purgeSimulatedSalesByIds({ dispatch }, { spaceId, transactionIds }) {
    const res = await purgeSimulatedSalesByIds(spaceId, transactionIds)
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
