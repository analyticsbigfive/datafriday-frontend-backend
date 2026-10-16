/**
 * Store paymentMethods : gabarit standard (list / cachedAt / fetching, cache 15 min, invalidate),
 * tri par ordre, création, mise à jour et suppression. L'API est simulée.
 */
jest.mock('@/api/endpoints/paymentMethods.api', () => ({
  getPaymentMethods: jest.fn(),
  createPaymentMethod: jest.fn(),
  updatePaymentMethod: jest.fn(),
  deletePaymentMethod: jest.fn(),
}))

import { createStore } from 'vuex'
import * as api from '@/api/endpoints/paymentMethods.api'
import paymentMethods from '@/store/modules/paymentMethods'
import { paymentKindKey } from '@/composables/usePaymentMethods'

const cash = { id: 'm1', name: 'Espèces', kind: 'cash', active: true, sortOrder: 0, isSystem: true }
const card = { id: 'm2', name: 'Carte', kind: 'card', active: true, sortOrder: 1, isSystem: true }

function makeStore() {
  return createStore({ modules: { paymentMethods: { ...paymentMethods, state: paymentMethods.state() } } })
}

beforeEach(() => jest.clearAllMocks())

describe('store paymentMethods', () => {
  it('fetchList trie par ordre, met en cache et force le rechargement sur demande', async () => {
    const store = makeStore()
    api.getPaymentMethods.mockResolvedValue([card, cash])
    await store.dispatch('paymentMethods/fetchList')
    expect(store.getters['paymentMethods/paymentMethods'].map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(store.getters['paymentMethods/isCacheValid']).toBe(true)
    await store.dispatch('paymentMethods/fetchList')
    expect(api.getPaymentMethods).toHaveBeenCalledTimes(1)
    await store.dispatch('paymentMethods/fetchList', { force: true })
    expect(api.getPaymentMethods).toHaveBeenCalledTimes(2)
    store.dispatch('paymentMethods/invalidate')
    expect(store.getters['paymentMethods/isCacheValid']).toBe(false)
  })

  it('create ajoute en respectant l ordre, update fusionne, remove retire', async () => {
    const store = makeStore()
    api.getPaymentMethods.mockResolvedValue([cash, card])
    await store.dispatch('paymentMethods/fetchList')

    api.createPaymentMethod.mockResolvedValue({ id: 'm3', name: 'Ticket resto', kind: 'voucher', active: true, sortOrder: 2, isSystem: false })
    await store.dispatch('paymentMethods/create', { name: 'Ticket resto', kind: 'voucher' })
    expect(store.getters['paymentMethods/paymentMethods'].map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])

    api.updatePaymentMethod.mockResolvedValue({ active: false })
    await store.dispatch('paymentMethods/update', { id: 'm1', payload: { active: false } })
    expect(api.updatePaymentMethod).toHaveBeenCalledWith('m1', { active: false })
    expect(store.getters['paymentMethods/paymentMethods'][0]).toMatchObject({ name: 'Espèces', active: false })
    expect(store.getters['paymentMethods/activePaymentMethods'].map((m) => m.id)).toEqual(['m2', 'm3'])

    api.deletePaymentMethod.mockResolvedValue({})
    await store.dispatch('paymentMethods/remove', 'm3')
    expect(store.getters['paymentMethods/paymentMethods'].map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('une erreur serveur ne modifie pas la liste', async () => {
    const store = makeStore()
    api.getPaymentMethods.mockResolvedValue([cash, card])
    await store.dispatch('paymentMethods/fetchList')
    api.deletePaymentMethod.mockRejectedValue(new Error('system'))
    await expect(store.dispatch('paymentMethods/remove', 'm1')).rejects.toThrow('system')
    expect(store.getters['paymentMethods/paymentMethods']).toHaveLength(2)
  })

  it('la clé de traduction d une catégorie suit sa valeur', () => {
    expect(paymentKindKey('cash')).toBe('paymentMethodKindCash')
    expect(paymentKindKey('giftcard')).toBe('paymentMethodKindGiftcard')
  })
})
