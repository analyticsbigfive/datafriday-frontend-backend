import {
  getPosEvents,
  getPosEventDetail,
  startPosPdv,
  stopPosPdv,
  resetPosPdvPin,
  startAllPosPdv,
  stopAllPosPdv,
  updatePosPdvResponsible,
  updatePosEventSettings,
  getPosSales,
  exportPosSalesCsv,
} from '@/api/endpoints/pos.api'

const TTL = 15 * 60 * 1000 // 15 minutes, gabarit standard du projet

/**
 * Statut d'une caisse après ▶ / ■, aligné sur la règle du serveur (pos-events.service.ts) :
 * arrêtée = inactive, démarrée sans ticket = ready, démarrée avec au moins un ticket = selling.
 * Le nombre de tickets ne change pas sur un ▶ / ■ : une caisse déjà « selling » le reste.
 * Le détail relu depuis le serveur reste la référence.
 */
export function statusFromAccess(open, previousStatus) {
  if (!open) return 'inactive'
  return previousStatus === 'selling' ? 'selling' : 'ready'
}

/** Applique un PosAccessStatus (réponse de start, stop, reset-pin) sur la ligne PdV concernée. */
export function mergeAccessIntoPdvs(pdvs, access, eventStatus) {
  return pdvs.map((row) => {
    if (row.elementId !== access.elementId) return row
    return {
      ...row,
      status: statusFromAccess(access.open, row.status),
      // Sans front.fb.posManage le serveur renvoie pin: null : on garde l'affichage actuel.
      pin: access.pin ?? row.pin ?? null,
    }
  })
}

function applyBulk(pdvs, result, eventStatus) {
  return (result?.results || []).reduce((rows, access) => mergeAccessIntoPdvs(rows, access, eventStatus), pdvs)
}

/**
 * Store de l'outil POS (staff). `list` = évènements en cours et à venir de l'espace (gabarit
 * standard list/cachedAt/fetching), `detail` = PdV, réglages et KPI de l'évènement affiché,
 * `sales` = pages chargées de l'historique.
 */
export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
    listSpaceId: null,
    detail: null,
    detailFetching: false,
    sales: { rows: [], nextCursor: null, totals: null },
    salesFetching: false,
  }),

  getters: {
    events: (state) => state.list,
    isCacheValid: (state) => state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
    pdvs: (state) => state.detail?.pdvs || [],
    settings: (state) => state.detail?.settings || null,
    event: (state) => state.detail?.event || null,
    /** PdV dont la caisse est démarrée (ready ou selling). */
    activePdvs: (state, getters) => getters.pdvs.filter((p) => p.status !== 'inactive'),
    kpis: (state, getters) => {
      const base = state.detail?.kpis || { activePdv: 0, totalPdv: 0, tickets: 0, revenueTtc: 0, averageBasketTtc: 0 }
      return { ...base, activePdv: getters.activePdvs.length, totalPdv: getters.pdvs.length || base.totalPdv }
    },
  },

  mutations: {
    SET_LIST(state, { spaceId, events }) {
      state.list = events
      state.listSpaceId = spaceId
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    SET_DETAIL(state, detail) {
      state.detail = detail
    },
    SET_DETAIL_FETCHING(state, val) {
      state.detailFetching = val
    },
    SET_PDVS(state, pdvs) {
      if (state.detail) state.detail = { ...state.detail, pdvs }
    },
    SET_SETTINGS(state, settings) {
      if (state.detail) state.detail = { ...state.detail, settings }
    },
    SET_SALES(state, sales) {
      state.sales = sales
    },
    APPEND_SALES(state, page) {
      state.sales = {
        rows: [...state.sales.rows, ...(page.rows || [])],
        nextCursor: page.nextCursor ?? null,
        totals: page.totals ?? state.sales.totals,
      }
    },
    SET_SALES_FETCHING(state, val) {
      state.salesFetching = val
    },
    RESET(state) {
      state.list = []
      state.cachedAt = null
      state.listSpaceId = null
      state.detail = null
      state.sales = { rows: [], nextCursor: null, totals: null }
    },
  },

  actions: {
    async fetchList({ state, commit, getters }, { spaceId, force = false } = {}) {
      if (!spaceId) return []
      if (state.fetching) return state.list
      if (!force && getters.isCacheValid && state.listSpaceId === spaceId) return state.list
      commit('SET_FETCHING', true)
      try {
        const events = await getPosEvents(spaceId)
        commit('SET_LIST', { spaceId, events: Array.isArray(events) ? events : [] })
        return state.list
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    reset({ commit }) {
      commit('RESET')
    },

    /** `silent` : relecture périodique sans passer par l'état de chargement. */
    async fetchDetail({ commit }, { spaceId, eventId, silent = false }) {
      if (!silent) commit('SET_DETAIL_FETCHING', true)
      try {
        const detail = await getPosEventDetail(spaceId, eventId)
        commit('SET_DETAIL', detail)
        return detail
      } finally {
        if (!silent) commit('SET_DETAIL_FETCHING', false)
      }
    },

    async startPdv({ commit, getters }, { spaceId, eventId, elementId }) {
      const access = await startPosPdv(spaceId, eventId, elementId)
      commit('SET_PDVS', mergeAccessIntoPdvs(getters.pdvs, access, getters.event?.status))
      return access
    },

    async stopPdv({ commit, getters }, { spaceId, eventId, elementId }) {
      const access = await stopPosPdv(spaceId, eventId, elementId)
      commit('SET_PDVS', mergeAccessIntoPdvs(getters.pdvs, access, getters.event?.status))
      return access
    },

    async resetPin({ commit, getters }, { spaceId, eventId, elementId }) {
      const access = await resetPosPdvPin(spaceId, eventId, elementId)
      commit('SET_PDVS', mergeAccessIntoPdvs(getters.pdvs, access, getters.event?.status))
      return access
    },

    /** Démarrage groupé : applique les succès, renvoie le résultat complet (dont les échecs). */
    async startAll({ commit, getters }, { spaceId, eventId }) {
      const result = await startAllPosPdv(spaceId, eventId)
      commit('SET_PDVS', applyBulk(getters.pdvs, result, getters.event?.status))
      return result
    },

    async stopAll({ commit, getters }, { spaceId, eventId }) {
      const result = await stopAllPosPdv(spaceId, eventId)
      commit('SET_PDVS', applyBulk(getters.pdvs, result, getters.event?.status))
      return result
    },

    async setResponsible({ commit, getters }, { spaceId, eventId, elementId, hrPersonId, hrPersonName }) {
      await updatePosPdvResponsible(spaceId, eventId, elementId, hrPersonId || null)
      commit(
        'SET_PDVS',
        getters.pdvs.map((row) =>
          row.elementId === elementId
            ? {
                ...row,
                responsibleHrPersonId: hrPersonId || null,
                responsibleName: hrPersonId ? (hrPersonName || row.responsibleName) : null,
              }
            : row
        )
      )
    },

    /** Enregistre les réglages complets ; en cas d'erreur l'état du store reste inchangé. */
    async saveSettings({ commit }, { spaceId, eventId, settings }) {
      const saved = await updatePosEventSettings(spaceId, eventId, settings)
      commit('SET_SETTINGS', { ...settings, ...(saved || {}) })
      return saved
    },

    async fetchSales({ commit }, { spaceId, eventId, query = {}, append = false }) {
      commit('SET_SALES_FETCHING', true)
      try {
        const page = await getPosSales(spaceId, eventId, query)
        if (append) commit('APPEND_SALES', page)
        else commit('SET_SALES', { rows: page.rows || [], nextCursor: page.nextCursor ?? null, totals: page.totals ?? null })
        return page
      } finally {
        commit('SET_SALES_FETCHING', false)
      }
    },

    exportSales(_ctx, { spaceId, eventId, query = {} }) {
      return exportPosSalesCsv(spaceId, eventId, query)
    },
  },
}
