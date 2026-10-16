import { createStore } from 'vuex'

jest.mock('@/api/endpoints/guestPos.api', () => ({
  getGuestPosCatalog: jest.fn(),
  createGuestPosSale: jest.fn(),
  cancelGuestPosSale: jest.fn(),
  restoreGuestPosSale: jest.fn(),
  listGuestPosSales: jest.fn(),
  getGuestPosClosing: jest.fn(),
}))

const api = require('@/api/endpoints/guestPos.api')
const { createGuestPosModule } = require('@/store/modules/guestPos')
const { createPosOutbox } = require('@/utils/posOutbox')
const { tipPercent, tipAmount } = require('@/utils/posTip')

const networkError = () => new Error('Network Error')
const httpError = (status, code) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { code } } })

const CASH = { id: 'pm-cash', name: 'Cash', kind: 'cash', active: true, sortOrder: 1, isSystem: true }
const CARD = { id: 'pm-card', name: 'Card', kind: 'card', active: true, sortOrder: 2, isSystem: true }
const VOUCHER = { id: 'pm-voucher', name: 'Voucher', kind: 'voucher', active: true, sortOrder: 3, isSystem: false }

const item = (over) => ({
  menuItemId: 'x', name: 'X', categoryId: 'c1', unitPrice: 4, originalUnitPrice: null, promotionLabel: null,
  vatRate: 10, note: null, availability: 'available', remainingUnits: null, ...over,
})

const catalog = (over = {}) => ({
  pdv: { elementId: 'el-1', name: 'Buvette Nord' },
  event: { id: 'ev-1', name: 'Championnat J12' },
  vendorName: 'Awa',
  settings: { paymentMethodIds: [], promosEnabled: true, cancelEnabled: true, lowStockUnits: 5, tipsEnabled: true },
  paymentMethods: [CARD, CASH, VOUCHER],
  categories: [{ id: 'c1', label: 'Boissons' }, { id: 'c2', label: 'Consigne' }],
  items: [
    item({ menuItemId: 'beer', name: 'Bière', unitPrice: 4, vatRate: 20 }),
    item({ menuItemId: 'menu', name: 'Menu', unitPrice: 14, originalUnitPrice: 15, promotionLabel: 'Promo' }),
    item({ menuItemId: 'cider', name: 'Cidre', unitPrice: 5, availability: 'out' }),
    item({ menuItemId: 'cup', name: 'Consigne', categoryId: 'c2', unitPrice: 1, vatRate: 0 }),
    item({ menuItemId: 'refund', name: 'Déconsigne', categoryId: 'c2', unitPrice: -1, vatRate: 0 }),
  ],
  nextTicketNumber: 1043,
  ...over,
})

const sentSale = (body, number) => ({
  id: `sale-${number}`, ticketNumber: number, clientTicketId: body.clientTicketId, cancelled: false, syncStatus: 'synced',
  payments: [], lines: [], totalTtc: 0, vatTotal: 0, tipTotal: 0, createdAt: '2026-10-16T20:00:00Z', vendorName: 'Awa',
})

function setup(catalogOverride) {
  jest.clearAllMocks()
  api.getGuestPosCatalog.mockResolvedValue(catalog(catalogOverride))
  let counter = 1042
  api.createGuestPosSale.mockImplementation(async (body) => ({ sale: sentSale(body, ++counter), replayed: false }))
  const module = createGuestPosModule({
    outboxFactory: (onChange) => createPosOutbox({ send: api.createGuestPosSale, onChange }),
  })
  const store = createStore({ modules: { guestPos: module } })
  return store
}

const loaded = async (catalogOverride) => {
  const store = setup(catalogOverride)
  await store.dispatch('guestPos/loadCatalog')
  return store
}

describe('guestPos store : catalogue et panier', () => {
  it('charge le catalogue, trie les moyens de paiement et pose le numéro de ticket', async () => {
    const store = await loaded()
    expect(store.getters['guestPos/paymentMethods'].map((m) => m.id)).toEqual(['pm-cash', 'pm-card', 'pm-voucher'])
    expect(store.getters['guestPos/vendorName']).toBe('Awa')
    expect(store.getters['guestPos/provisionalTicketNumber']).toBe(1043)
    expect(store.getters['guestPos/activeCategoryId']).toBe('c1')
  })

  it('ajoute, retire et vide, mais refuse d ajouter un article épuisé', async () => {
    const store = await loaded()
    await store.dispatch('guestPos/increment', 'beer')
    await store.dispatch('guestPos/increment', 'beer')
    await store.dispatch('guestPos/increment', 'cider')
    expect(store.state.guestPos.cart).toEqual({ beer: 2 })
    await store.dispatch('guestPos/decrement', 'beer')
    await store.dispatch('guestPos/decrement', 'beer')
    expect(store.state.guestPos.cart).toEqual({})
    await store.dispatch('guestPos/increment', 'menu')
    await store.dispatch('guestPos/clearCart')
    expect(store.getters['guestPos/cartIsEmpty']).toBe(true)
  })

  it('total, TVA et ligne négative de déconsigne', async () => {
    const store = await loaded()
    for (const id of ['beer', 'cup', 'cup', 'refund']) await store.dispatch('guestPos/increment', id)
    expect(store.getters['guestPos/ticketTotals']).toEqual({ totalCents: 400 + 100, vatCents: 67 })
    expect(store.getters['guestPos/cartCounts']).toEqual({ c1: 1, c2: 3 })
  })

  it('le pourboire est nul quand les pourboires sont désactivés', async () => {
    const store = await loaded({ settings: { ...catalog().settings, tipsEnabled: false } })
    await store.dispatch('guestPos/increment', 'menu')
    await store.dispatch('guestPos/setTip', tipPercent(10))
    expect(store.getters['guestPos/tipCents']).toBe(0)
  })
})

describe('guestPos store : encaissement', () => {
  it('paiement en un geste : envoie la vente, vide le ticket, remplit le bandeau', async () => {
    const store = await loaded()
    await store.dispatch('guestPos/increment', 'menu')
    await store.dispatch('guestPos/increment', 'beer')
    const result = await store.dispatch('guestPos/checkout', { payments: [{ paymentMethodId: 'pm-card', amountCents: 1800 }] })
    expect(result.outcome).toBe('sent')
    const body = api.createGuestPosSale.mock.calls[0][0]
    expect(body.clientTicketId).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.lines).toEqual([{ menuItemId: 'beer', quantity: 1 }, { menuItemId: 'menu', quantity: 1 }])
    expect(body.payments).toEqual([{ paymentMethodId: 'pm-card', amountTtc: 18 }])
    expect(store.getters['guestPos/cartIsEmpty']).toBe(true)
    expect(store.state.guestPos.lastSale).toMatchObject({ status: 'sent', ticketNumber: 1043, saleId: 'sale-1043', totalCents: 1800 })
    expect(store.state.guestPos.nextTicketNumber).toBe(1044)
    expect(store.getters['guestPos/syncState']).toBe('live')
  })

  it('refuse un paiement dont la somme n égale pas le total, sans rien envoyer', async () => {
    const store = await loaded()
    await store.dispatch('guestPos/increment', 'menu')
    await expect(store.dispatch('guestPos/checkout', { payments: [{ paymentMethodId: 'pm-card', amountCents: 1000 }] })).rejects.toMatchObject({
      response: { data: { code: 'POS_PAYMENT_MISMATCH' } },
    })
    expect(api.createGuestPosSale).not.toHaveBeenCalled()
    expect(store.getters['guestPos/cartIsEmpty']).toBe(false)
  })

  it('refuse un moyen de paiement absent du catalogue et un ticket vide', async () => {
    const store = await loaded()
    await expect(store.dispatch('guestPos/checkout', { payments: [{ paymentMethodId: 'pm-card', amountCents: 0 }] })).rejects.toMatchObject({ response: { data: { code: 'POS_EMPTY_TICKET' } } })
    await store.dispatch('guestPos/increment', 'beer')
    await expect(store.dispatch('guestPos/checkout', { payments: [{ paymentMethodId: 'ghost', amountCents: 400 }] })).rejects.toMatchObject({
      response: { data: { code: 'POS_PAYMENT_METHOD_DISABLED' } },
    })
  })

  it('addition partagée : 34 € en 3 paiements, moyens mélangés, UN ticket, pourboire sur le dernier paiement', async () => {
    const store = await loaded({ items: [item({ menuItemId: 'big', name: 'Gros', unitPrice: 34 })] })
    await store.dispatch('guestPos/increment', 'big')
    await store.dispatch('guestPos/setTip', tipAmount(200))
    await store.dispatch('guestPos/checkout', {
      payments: [
        { paymentMethodId: 'pm-cash', amountCents: 1133 },
        { paymentMethodId: 'pm-card', amountCents: 1133 },
        { paymentMethodId: 'pm-card', amountCents: 1134 },
      ],
    })
    expect(api.createGuestPosSale).toHaveBeenCalledTimes(1)
    const { payments } = api.createGuestPosSale.mock.calls[0][0]
    expect(payments.map((p) => p.amountTtc)).toEqual([11.33, 11.33, 11.34])
    expect(payments.map((p) => p.tipTtc)).toEqual([undefined, undefined, 2])
    expect(payments.reduce((sum, p) => sum + p.amountTtc, 0)).toBeCloseTo(34, 2)
    expect(store.state.guestPos.tip).toEqual({ kind: 'none' })
  })

  it('un refus métier laisse le ticket en cours et ne laisse rien en file', async () => {
    const store = await loaded()
    await store.dispatch('guestPos/increment', 'beer')
    api.createGuestPosSale.mockRejectedValueOnce(httpError(403, 'POS_PDV_STOPPED'))
    await expect(store.dispatch('guestPos/checkout', { payments: [{ paymentMethodId: 'pm-cash', amountCents: 400 }] })).rejects.toMatchObject({
      response: { data: { code: 'POS_PDV_STOPPED' } },
    })
    expect(store.getters['guestPos/cartIsEmpty']).toBe(false)
    expect(store.getters['guestPos/pendingCount']).toBe(0)
    expect(store.getters['guestPos/rejectedEntries']).toHaveLength(0)
    expect(store.state.guestPos.submitting).toBe(false)
  })
})

describe('guestPos store : hors ligne et rejeu', () => {
  it('réseau coupé : la vente est mise en file, « en attente d envoi », puis rejouée sans doublon', async () => {
    const store = await loaded()
    await store.dispatch('guestPos/increment', 'beer')
    api.createGuestPosSale.mockRejectedValueOnce(networkError())

    const result = await store.dispatch('guestPos/checkout', { payments: [{ paymentMethodId: 'pm-cash', amountCents: 400 }] })
    expect(result.outcome).toBe('queued')
    expect(store.getters['guestPos/pendingCount']).toBe(1)
    expect(store.getters['guestPos/syncState']).toBe('offline')
    expect(store.state.guestPos.lastSale).toMatchObject({ status: 'queued', saleId: null, ticketNumber: 1043 })
    expect(store.getters['guestPos/cartIsEmpty']).toBe(true)
    // Le ticket suivant porte un numéro provisoire qui tient compte de la vente en file.
    expect(store.getters['guestPos/provisionalTicketNumber']).toBe(1044)

    const firstId = api.createGuestPosSale.mock.calls[0][0].clientTicketId
    await store.dispatch('guestPos/flushOutbox')
    expect(api.createGuestPosSale).toHaveBeenCalledTimes(2)
    expect(api.createGuestPosSale.mock.calls[1][0].clientTicketId).toBe(firstId)
    expect(store.getters['guestPos/pendingCount']).toBe(0)
    expect(store.getters['guestPos/syncState']).toBe('live')
    expect(store.state.guestPos.lastSale).toMatchObject({ status: 'sent', saleId: 'sale-1043', ticketNumber: 1043 })
  })

  it('un rejeu reconnu par le serveur (replayed=true) confirme la vente sans en créer une autre', async () => {
    const store = await loaded()
    await store.dispatch('guestPos/increment', 'beer')
    api.createGuestPosSale.mockRejectedValueOnce(networkError())
    await store.dispatch('guestPos/checkout', { payments: [{ paymentMethodId: 'pm-cash', amountCents: 400 }] })
    api.createGuestPosSale.mockImplementationOnce(async (body) => ({ sale: sentSale(body, 1043), replayed: true }))
    await store.dispatch('guestPos/flushOutbox')
    expect(store.getters['guestPos/pendingCount']).toBe(0)
    expect(store.state.guestPos.lastSale.status).toBe('sent')
  })

  it('la vente en file apparaît en tête de l historique avec son aperçu', async () => {
    const store = await loaded()
    await store.dispatch('guestPos/increment', 'beer')
    api.createGuestPosSale.mockRejectedValueOnce(networkError())
    await store.dispatch('guestPos/checkout', { payments: [{ paymentMethodId: 'pm-cash', amountCents: 400 }] })
    const [entry] = store.getters['guestPos/pendingEntries']
    expect(entry.preview).toMatchObject({ ticketNumber: 1043, totalTtc: 4, syncStatus: 'pending', vendorName: 'Awa' })
    expect(entry.preview.payments[0]).toMatchObject({ name: 'Cash', kind: 'cash', amountTtc: 4 })
  })
})

describe('guestPos store : annulation depuis le bandeau', () => {
  it('annule une vente envoyée (appel cancel) et remet le ticket au panier', async () => {
    const store = await loaded()
    await store.dispatch('guestPos/increment', 'beer')
    await store.dispatch('guestPos/increment', 'beer')
    await store.dispatch('guestPos/checkout', { payments: [{ paymentMethodId: 'pm-cash', amountCents: 800 }] })
    api.cancelGuestPosSale.mockResolvedValue({ ...sentSale({ clientTicketId: 'x' }, 1043), cancelled: true })

    expect(await store.dispatch('guestPos/cancelLastSale')).toBe(true)
    expect(api.cancelGuestPosSale).toHaveBeenCalledWith('sale-1043')
    expect(store.state.guestPos.cart).toEqual({ beer: 2 })
    expect(store.state.guestPos.lastSale).toBeNull()
  })

  it('annule une vente encore en file sans appeler le serveur', async () => {
    const store = await loaded()
    await store.dispatch('guestPos/increment', 'beer')
    api.createGuestPosSale.mockRejectedValueOnce(networkError())
    await store.dispatch('guestPos/checkout', { payments: [{ paymentMethodId: 'pm-cash', amountCents: 400 }] })
    await store.dispatch('guestPos/cancelLastSale')
    expect(api.cancelGuestPosSale).not.toHaveBeenCalled()
    expect(store.getters['guestPos/pendingCount']).toBe(0)
    expect(store.state.guestPos.cart).toEqual({ beer: 1 })
  })

  it('refuse l annulation d une vente envoyée quand l évènement la désactive', async () => {
    const store = await loaded({ settings: { ...catalog().settings, cancelEnabled: false } })
    await store.dispatch('guestPos/increment', 'beer')
    await store.dispatch('guestPos/checkout', { payments: [{ paymentMethodId: 'pm-cash', amountCents: 400 }] })
    await expect(store.dispatch('guestPos/cancelLastSale')).rejects.toMatchObject({ response: { data: { code: 'POS_CANCEL_DISABLED' } } })
    expect(api.cancelGuestPosSale).not.toHaveBeenCalled()
  })
})

describe('guestPos store : historique et clôture', () => {
  it('charge l historique puis annule et rétablit un ticket', async () => {
    const store = await loaded()
    const row = { ...sentSale({ clientTicketId: 'c1' }, 1040), cancelled: false }
    api.listGuestPosSales.mockResolvedValue({ rows: [row], nextCursor: null, totals: { tickets: 1, cancelled: 0, revenueTtc: 0, tipsTtc: 0 } })
    await store.dispatch('guestPos/loadSales')
    expect(store.state.guestPos.sales.rows).toHaveLength(1)

    api.cancelGuestPosSale.mockResolvedValue({ ...row, cancelled: true })
    await store.dispatch('guestPos/setSaleCancelled', { saleId: row.id, cancelled: true })
    expect(store.state.guestPos.sales.rows[0].cancelled).toBe(true)

    api.restoreGuestPosSale.mockResolvedValue({ ...row, cancelled: false })
    await store.dispatch('guestPos/setSaleCancelled', { saleId: row.id, cancelled: false })
    expect(store.state.guestPos.sales.rows[0].cancelled).toBe(false)
  })

  it('charge la clôture', async () => {
    const store = await loaded()
    const closing = { tickets: 3, cancelled: 0, byPaymentMethod: [], tips: { totalTtc: 2, byVendor: [{ vendorName: 'Awa', tipTtc: 2, tickets: 1 }] }, vatTotal: 1, revenueTtc: 9 }
    api.getGuestPosClosing.mockResolvedValue(closing)
    await store.dispatch('guestPos/loadClosing')
    expect(store.state.guestPos.closing).toEqual(closing)
  })

  it('une erreur réseau sur le catalogue est exposée à l écran de chargement', async () => {
    const store = setup()
    api.getGuestPosCatalog.mockRejectedValue(networkError())
    await expect(store.dispatch('guestPos/loadCatalog')).rejects.toThrow('Network Error')
    expect(store.state.guestPos.loadError).toBeTruthy()
    expect(store.state.guestPos.online).toBe(false)
  })

  it('tipPercent est bien porté par le total du ticket', async () => {
    const store = await loaded()
    await store.dispatch('guestPos/increment', 'menu')
    await store.dispatch('guestPos/setTip', tipPercent(10))
    expect(store.getters['guestPos/tipCents']).toBe(140)
  })
})
