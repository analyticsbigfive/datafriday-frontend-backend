// Caisse POS invitée (phase `pos`, lot L7 du chantier pos_mvp).
//
// Le vendeur n'a pas de compte : sa session est celle de store/modules/guestPin.js (jeton invité
// posé sur l'instance Axios au login). Ce module porte l'état de la caisse : catalogue, ticket en
// cours (panier), pourboire choisi, dernière vente (bandeau d'annulation), historique, clôture et
// l'état d'envoi des ventes (file posOutbox, prête pour le hors ligne).
//
// Le module est produit par une fabrique pour pouvoir injecter une autre file d'envoi dans les tests.

import {
  getGuestPosCatalog,
  createGuestPosSale,
  cancelGuestPosSale,
  restoreGuestPosSale,
  listGuestPosSales,
  getGuestPosClosing,
} from '@/api/endpoints/guestPos.api'
import { POS_ERROR_CODES } from '@/api/endpoints/pos.contracts'
import { createPosOutbox } from '@/utils/posOutbox'
import { buildTicketLines, ticketTotals, cartCountsByCategory, buildSalePayload, buildSalePreview } from '@/utils/posTicket'
import { computeTipCents, attachTipToLastPayment, POS_TIP_NONE } from '@/utils/posTip'
import { POS_MAX_PAYMENTS } from '@/utils/posSplit'
import { createLocalPosError, isNetworkError } from '@/utils/posErrors'

/** Plafond de quantité par ligne (miroir du contrat serveur : 1 à 999). */
const MAX_LINE_QUANTITY = 999

const emptySales = () => ({ rows: [], nextCursor: null, totals: null, loaded: false, loading: false })

const initialState = () => ({
  catalog: null,
  loading: false,
  loadError: null,
  categoryId: null,
  cart: {},
  tip: POS_TIP_NONE,
  submitting: false,
  online: true,
  outboxEntries: [],
  nextTicketNumber: 1,
  lastSale: null,
  sales: emptySales(),
  closing: null,
})

const getters = {
  items: (state) => state.catalog?.items ?? [],
  categories: (state) => state.catalog?.categories ?? [],
  settings: (state) => state.catalog?.settings ?? { tipsEnabled: false, cancelEnabled: false, promosEnabled: true, lowStockUnits: 0, paymentMethodIds: [] },
  tipsEnabled: (state, g) => !!g.settings.tipsEnabled,
  cancelEnabled: (state, g) => !!g.settings.cancelEnabled,
  paymentMethods: (state) =>
    [...(state.catalog?.paymentMethods ?? [])].filter((m) => m.active !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  paymentMethodsById: (state, g) => Object.fromEntries(g.paymentMethods.map((m) => [m.id, m])),
  vendorName: (state) => state.catalog?.vendorName ?? '',
  pdv: (state) => state.catalog?.pdv ?? null,
  event: (state) => state.catalog?.event ?? null,

  activeCategoryId: (state, g) => state.categoryId ?? g.categories[0]?.id ?? null,
  cartCounts: (state, g) => cartCountsByCategory(state.cart, g.items),
  ticketLines: (state, g) => buildTicketLines(state.cart, g.items),
  ticketTotals: (state, g) => ticketTotals(g.ticketLines),
  cartIsEmpty: (state, g) => g.ticketLines.length === 0,
  tipCents: (state, g) => computeTipCents(g.ticketTotals.totalCents, state.tip, g.tipsEnabled),

  pendingEntries: (state) => state.outboxEntries.filter((entry) => entry.status === 'pending'),
  rejectedEntries: (state) => state.outboxEntries.filter((entry) => entry.status === 'rejected'),
  pendingCount: (_state, g) => g.pendingEntries.length,
  /** Numéro affiché pour le prochain ticket : dernier numéro serveur connu + tickets déjà en file. */
  provisionalTicketNumber: (state, g) => state.nextTicketNumber + g.pendingCount,
  /** 'live' (tout est parti), 'pending' (ventes en attente d'envoi), 'offline' (réseau coupé). */
  syncState: (state, g) => (!state.online ? 'offline' : g.pendingCount > 0 ? 'pending' : 'live'),
}

const mutations = {
  SET_CATALOG(state, catalog) {
    state.catalog = catalog
    if (catalog?.nextTicketNumber != null) state.nextTicketNumber = Math.max(state.nextTicketNumber, catalog.nextTicketNumber)
  },
  SET_LOADING(state, value) {
    state.loading = value
  },
  SET_LOAD_ERROR(state, error) {
    state.loadError = error
  },
  SET_CATEGORY(state, categoryId) {
    state.categoryId = categoryId
  },
  SET_QUANTITY(state, { menuItemId, quantity }) {
    const next = { ...state.cart }
    if (quantity <= 0) delete next[menuItemId]
    else next[menuItemId] = Math.min(quantity, MAX_LINE_QUANTITY)
    state.cart = next
  },
  SET_CART(state, cart) {
    state.cart = { ...cart }
  },
  SET_TIP(state, tip) {
    state.tip = tip || POS_TIP_NONE
  },
  SET_SUBMITTING(state, value) {
    state.submitting = value
  },
  SET_ONLINE(state, value) {
    state.online = !!value
  },
  SET_OUTBOX_ENTRIES(state, entries) {
    state.outboxEntries = entries
  },
  RAISE_NEXT_TICKET(state, number) {
    if (Number.isFinite(number)) state.nextTicketNumber = Math.max(state.nextTicketNumber, number)
  },
  SET_LAST_SALE(state, sale) {
    state.lastSale = sale
  },
  /** La vente du bandeau a été confirmée par le serveur (numéro définitif, identifiant de vente). */
  CONFIRM_LAST_SALE(state, { clientTicketId, saleId, ticketNumber }) {
    if (state.lastSale?.clientTicketId !== clientTicketId) return
    state.lastSale = { ...state.lastSale, saleId, ticketNumber, status: 'sent' }
  },
  SET_SALES_LOADING(state, value) {
    state.sales = { ...state.sales, loading: value }
  },
  SET_SALES(state, { rows, nextCursor, totals, append }) {
    state.sales = {
      rows: append ? [...state.sales.rows, ...rows.filter((row) => !state.sales.rows.some((known) => known.id === row.id))] : rows,
      nextCursor: nextCursor ?? null,
      totals: totals ?? state.sales.totals,
      loaded: true,
      loading: false,
    }
  },
  UPSERT_SALE(state, sale) {
    if (!state.sales.loaded) return
    const index = state.sales.rows.findIndex((row) => row.id === sale.id)
    const rows = [...state.sales.rows]
    if (index >= 0) rows[index] = sale
    else rows.unshift(sale)
    state.sales = { ...state.sales, rows }
  },
  SET_CLOSING(state, closing) {
    state.closing = closing
  },
  RESET(state) {
    Object.assign(state, initialState())
  },
}

/**
 * @param {Object} [deps]
 * @param {(commit:Function) => Object} [deps.outboxFactory]  fabrique de la file d'envoi (tests)
 */
export function createGuestPosModule({ outboxFactory } = {}) {
  // Une file par instance de module ; créée à la demande car elle publie ses changements dans le store.
  let outbox = null
  const outboxOf = (commit) => {
    if (!outbox) {
      const onChange = (entries) => commit('SET_OUTBOX_ENTRIES', entries)
      outbox = outboxFactory ? outboxFactory(onChange) : createPosOutbox({ send: createGuestPosSale, onChange })
    }
    return outbox
  }

  const markNetwork = (commit, error) => {
    if (isNetworkError(error)) commit('SET_ONLINE', false)
  }

  /** Une vente confirmée par le serveur : bandeau, historique, numéro suivant, réseau rétabli. */
  const applyConfirmedSale = (commit, entry, sale) => {
    commit('SET_ONLINE', true)
    commit('RAISE_NEXT_TICKET', sale.ticketNumber + 1)
    commit('UPSERT_SALE', sale)
    commit('CONFIRM_LAST_SALE', { clientTicketId: entry.clientTicketId, saleId: sale.id, ticketNumber: sale.ticketNumber })
  }

  const actions = {
    /** Charge le catalogue. `silent` : rafraîchissement de la disponibilité sans écran de chargement. */
    async loadCatalog({ commit }, { silent = false } = {}) {
      if (!silent) {
        commit('SET_LOADING', true)
        commit('SET_LOAD_ERROR', null)
      }
      try {
        const catalog = await getGuestPosCatalog()
        commit('SET_CATALOG', catalog)
        commit('SET_ONLINE', true)
        return catalog
      } catch (error) {
        markNetwork(commit, error)
        if (!silent) commit('SET_LOAD_ERROR', error)
        if (silent) return null
        throw error
      } finally {
        if (!silent) commit('SET_LOADING', false)
      }
    },

    /** Reprend les ventes encore en file (hors ligne futur : rechargées depuis le stockage). */
    async hydrateOutbox({ commit }) {
      return outboxOf(commit).hydrate()
    },

    selectCategory({ commit }, categoryId) {
      commit('SET_CATEGORY', categoryId)
    },

    /** Fixe la quantité d'un article au panier. Un article épuisé ne peut plus être ajouté. */
    setQuantity({ commit, state, getters }, { menuItemId, quantity }) {
      const item = getters.items.find((candidate) => candidate.menuItemId === menuItemId)
      if (!item) return
      const current = state.cart[menuItemId] || 0
      if (item.availability === 'out' && quantity > current) return
      commit('SET_QUANTITY', { menuItemId, quantity })
    },

    increment({ dispatch, state }, menuItemId) {
      return dispatch('setQuantity', { menuItemId, quantity: (state.cart[menuItemId] || 0) + 1 })
    },

    decrement({ dispatch, state }, menuItemId) {
      return dispatch('setQuantity', { menuItemId, quantity: (state.cart[menuItemId] || 0) - 1 })
    },

    clearCart({ commit }) {
      commit('SET_CART', {})
      commit('SET_TIP', POS_TIP_NONE)
    },

    setTip({ commit }, tip) {
      commit('SET_TIP', tip)
    },

    /**
     * Encaisse le ticket en cours. `payments` : `[{ paymentMethodId, amountCents }]`, 1 à 10, dont la
     * somme doit être égale au total. Le pourboire choisi est reporté sur le dernier paiement.
     * Renvoie `{ outcome: 'sent' | 'queued', sale }` ; un refus métier lève (le ticket reste en cours).
     */
    async checkout({ commit, state, getters, dispatch }, { payments }) {
      if (state.submitting) throw createLocalPosError(POS_ERROR_CODES.TICKET_CONFLICT)
      const lines = getters.ticketLines
      if (lines.length === 0) throw createLocalPosError(POS_ERROR_CODES.EMPTY_TICKET)
      if (!Array.isArray(payments) || payments.length === 0 || payments.length > POS_MAX_PAYMENTS) {
        throw createLocalPosError(POS_ERROR_CODES.PAYMENT_MISMATCH)
      }
      const { totalCents, vatCents } = getters.ticketTotals
      const paid = payments.reduce((sum, payment) => sum + payment.amountCents, 0)
      if (paid !== totalCents) throw createLocalPosError(POS_ERROR_CODES.PAYMENT_MISMATCH)
      if (payments.some((payment) => !getters.paymentMethodsById[payment.paymentMethodId])) {
        throw createLocalPosError(POS_ERROR_CODES.PAYMENT_METHOD_DISABLED)
      }

      const tipCents = getters.tipCents
      const withTip = attachTipToLastPayment(payments, tipCents)
      const provisionalNumber = getters.provisionalTicketNumber
      const cartSnapshot = { ...state.cart }
      const methodsById = getters.paymentMethodsById

      commit('SET_SUBMITTING', true)
      try {
        const box = outboxOf(commit)
        const payload = buildSalePayload({ lines, payments: withTip })
        const createdAt = new Date().toISOString()
        // Aperçu construit avant l'envoi : l'identifiant du ticket est généré par la file, on le
        // lui laisse et on complète l'aperçu juste après via `preview`.
        const preview = buildSalePreview({
          clientTicketId: null,
          ticketNumber: provisionalNumber,
          vendorName: getters.vendorName,
          pdvName: getters.pdv?.name,
          lines,
          payments: withTip,
          methodsById,
          totalCents,
          vatCents,
          createdAt,
        })
        const result = await box.submit({ ...payload, preview })

        if (result.outcome === 'rejected') {
          await box.dismissRejected(result.entry.clientTicketId)
          throw result.error
        }

        const summary = {
          clientTicketId: result.entry.clientTicketId,
          saleId: null,
          ticketNumber: provisionalNumber,
          totalCents,
          tipCents,
          paymentNames: withTip.map((payment) => methodsById[payment.paymentMethodId]?.name || ''),
          status: result.outcome === 'sent' ? 'sent' : 'queued',
          cartSnapshot,
        }
        commit('SET_LAST_SALE', summary)
        commit('SET_CART', {})
        commit('SET_TIP', POS_TIP_NONE)

        if (result.outcome === 'sent') {
          applyConfirmedSale(commit, result.entry, result.result.sale)
          // La disponibilité des articles bouge après chaque vente du PdV.
          dispatch('loadCatalog', { silent: true })
          return { outcome: 'sent', sale: result.result.sale }
        }
        markNetwork(commit, result.error)
        return { outcome: 'queued', sale: null }
      } finally {
        commit('SET_SUBMITTING', false)
      }
    },

    /** Renvoie les ventes en file (retour du réseau, relance périodique). */
    async flushOutbox({ commit, dispatch }) {
      const outcomes = await outboxOf(commit).flush()
      let anySent = false
      for (const item of outcomes) {
        if (item.outcome === 'sent') {
          anySent = true
          applyConfirmedSale(commit, item.entry, item.result.sale)
        } else if (item.outcome === 'queued') {
          markNetwork(commit, item.error)
        }
      }
      if (anySent) dispatch('loadCatalog', { silent: true })
      return outcomes
    },

    dismissRejected({ commit }, clientTicketId) {
      return outboxOf(commit).dismissRejected(clientTicketId)
    },

    dismissLastSale({ commit }) {
      commit('SET_LAST_SALE', null)
    },

    /**
     * « Annuler la vente » du bandeau : annule le dernier ticket (retiré de la file s'il n'est pas
     * encore parti, sinon marqué annulé côté serveur) et remet son contenu au panier.
     */
    async cancelLastSale({ commit, state, getters }) {
      const sale = state.lastSale
      if (!sale) return false
      if (sale.status === 'queued') {
        const removed = await outboxOf(commit).remove(sale.clientTicketId)
        // Déjà en cours d'envoi : on ne sait pas encore si le serveur l'a pris, l'annulation passera par l'historique.
        if (!removed) throw createLocalPosError(POS_ERROR_CODES.TICKET_CONFLICT)
      } else {
        if (!getters.cancelEnabled) throw createLocalPosError(POS_ERROR_CODES.CANCEL_DISABLED)
        try {
          const cancelled = await cancelGuestPosSale(sale.saleId)
          commit('UPSERT_SALE', cancelled)
        } catch (error) {
          markNetwork(commit, error)
          throw error
        }
      }
      commit('SET_CART', sale.cartSnapshot)
      commit('SET_LAST_SALE', null)
      return true
    },

    /** Historique du PdV. `append` : page suivante (curseur). Le filtrage se fait côté interface sur les lignes chargées. */
    async loadSales({ commit, state }, { append = false } = {}) {
      commit('SET_SALES_LOADING', true)
      try {
        const params = { limit: 200 }
        if (append && state.sales.nextCursor) params.cursor = state.sales.nextCursor
        const page = await listGuestPosSales(params)
        commit('SET_SALES', { rows: page.rows, nextCursor: page.nextCursor, totals: page.totals, append })
        return page
      } catch (error) {
        commit('SET_SALES_LOADING', false)
        markNetwork(commit, error)
        throw error
      }
    },

    /** Annule (`cancelled: true`) ou rétablit un ticket de l'historique. */
    async setSaleCancelled({ commit, state }, { saleId, cancelled }) {
      try {
        const sale = cancelled ? await cancelGuestPosSale(saleId) : await restoreGuestPosSale(saleId)
        commit('UPSERT_SALE', sale)
        // Le ticket du bandeau vient d'être annulé depuis l'historique : le bandeau n'a plus lieu d'être.
        if (cancelled && state.lastSale?.saleId === saleId) commit('SET_LAST_SALE', null)
        return sale
      } catch (error) {
        markNetwork(commit, error)
        throw error
      }
    },

    async loadClosing({ commit }) {
      try {
        const closing = await getGuestPosClosing()
        commit('SET_CLOSING', closing)
        return closing
      } catch (error) {
        markNetwork(commit, error)
        throw error
      }
    },

    setOnline({ commit }, value) {
      commit('SET_ONLINE', value)
    },

    reset({ commit }) {
      outbox = null
      commit('RESET')
    },
  }

  return { namespaced: true, state: initialState, getters, mutations, actions }
}

export default createGuestPosModule()
