/**
 * Store pos : statut déduit de l'accès, fusion des réponses ▶ / ■ dans les PdV, actions groupées,
 * responsable, réglages et pagination de l'historique. L'API est simulée.
 */
jest.mock('@/api/endpoints/pos.api', () => ({
  getPosEvents: jest.fn(),
  getPosEventDetail: jest.fn(),
  startPosPdv: jest.fn(),
  stopPosPdv: jest.fn(),
  resetPosPdvPin: jest.fn(),
  startAllPosPdv: jest.fn(),
  stopAllPosPdv: jest.fn(),
  updatePosPdvResponsible: jest.fn(),
  updatePosEventSettings: jest.fn(),
  getPosSales: jest.fn(),
  exportPosSalesCsv: jest.fn(),
}))

import { createStore } from 'vuex'
import * as api from '@/api/endpoints/pos.api'
import pos, { statusFromAccess, mergeAccessIntoPdvs } from '@/store/modules/pos'

const pdv = (over = {}) => ({
  elementId: 'p1', name: 'Buvette Nord', status: 'inactive', pin: null, qrSlug: 's1',
  responsibleHrPersonId: null, responsibleName: null, otherSources: [], sales: { tickets: 0, revenueTtc: 0 }, ...over,
})
const detail = (status = 'upcoming') => ({
  event: { id: 'e1', name: 'Match', status },
  pdvs: [pdv(), pdv({ elementId: 'p2', name: 'Kiosque', status: 'ready', pin: '111111' })],
  settings: { paymentMethodIds: [], promosEnabled: true, cancelEnabled: true, lowStockUnits: 5, tipsEnabled: false },
  kpis: { activePdv: 0, totalPdv: 2, tickets: 3, revenueTtc: 30, averageBasketTtc: 10 },
})

function makeStore() {
  return createStore({ modules: { pos: { ...pos, state: pos.state() } } })
}

beforeEach(() => jest.clearAllMocks())

describe('statusFromAccess / mergeAccessIntoPdvs', () => {
  it('arrêtée = inactive, démarrée = ready, une caisse qui a déjà vendu reste selling', () => {
    expect(statusFromAccess(false, 'selling')).toBe('inactive')
    expect(statusFromAccess(true, 'inactive')).toBe('ready')
    expect(statusFromAccess(true, 'ready')).toBe('ready')
    expect(statusFromAccess(true, 'selling')).toBe('selling')
  })

  it('met à jour la seule ligne concernée et garde le PIN affiché si le serveur ne le renvoie pas', () => {
    const rows = [pdv({ pin: '123456', status: 'selling' }), pdv({ elementId: 'p2' })]
    const next = mergeAccessIntoPdvs(rows, { elementId: 'p1', open: true, pin: null }, 'live')
    expect(next[0]).toMatchObject({ status: 'selling', pin: '123456' })
    expect(next[1]).toBe(rows[1])
  })
})

describe('store pos', () => {
  it('fetchList charge les évènements et respecte le cache pour le même espace', async () => {
    const store = makeStore()
    api.getPosEvents.mockResolvedValue([{ id: 'e1', status: 'live' }])
    await store.dispatch('pos/fetchList', { spaceId: 's1' })
    await store.dispatch('pos/fetchList', { spaceId: 's1' })
    expect(api.getPosEvents).toHaveBeenCalledTimes(1)
    expect(store.getters['pos/events']).toHaveLength(1)
    await store.dispatch('pos/fetchList', { spaceId: 's2' })
    expect(api.getPosEvents).toHaveBeenCalledTimes(2)
    await store.dispatch('pos/fetchList', { spaceId: 's2', force: true })
    expect(api.getPosEvents).toHaveBeenCalledTimes(3)
  })

  it('startPdv fusionne la réponse et le getter kpis recompte les caisses actives', async () => {
    const store = makeStore()
    api.getPosEventDetail.mockResolvedValue(detail('live'))
    api.startPosPdv.mockResolvedValue({ elementId: 'p1', open: true, pin: '482913' })
    await store.dispatch('pos/fetchDetail', { spaceId: 's1', eventId: 'e1' })
    expect(store.getters['pos/kpis'].activePdv).toBe(1)
    await store.dispatch('pos/startPdv', { spaceId: 's1', eventId: 'e1', elementId: 'p1' })
    expect(api.startPosPdv).toHaveBeenCalledWith('s1', 'e1', 'p1')
    expect(store.getters['pos/pdvs'][0]).toMatchObject({ status: 'ready', pin: '482913' })
    expect(store.getters['pos/kpis']).toMatchObject({ activePdv: 2, totalPdv: 2, tickets: 3 })
  })

  it('stopAll applique les succès et renvoie les échecs', async () => {
    const store = makeStore()
    api.getPosEventDetail.mockResolvedValue(detail('upcoming'))
    api.stopAllPosPdv.mockResolvedValue({
      results: [{ elementId: 'p2', open: false, pin: '111111' }],
      failures: [{ elementId: 'p1', code: 'X', message: 'boom' }],
    })
    await store.dispatch('pos/fetchDetail', { spaceId: 's1', eventId: 'e1' })
    const result = await store.dispatch('pos/stopAll', { spaceId: 's1', eventId: 'e1' })
    expect(result.failures).toHaveLength(1)
    expect(store.getters['pos/pdvs'][1].status).toBe('inactive')
  })

  it('setResponsible envoie null pour retirer le responsable', async () => {
    const store = makeStore()
    api.getPosEventDetail.mockResolvedValue(detail())
    api.updatePosPdvResponsible.mockResolvedValue({ responsibleHrPersonId: 'h1' })
    await store.dispatch('pos/fetchDetail', { spaceId: 's1', eventId: 'e1' })
    await store.dispatch('pos/setResponsible', { spaceId: 's1', eventId: 'e1', elementId: 'p1', hrPersonId: 'h1', hrPersonName: 'Awa Koné' })
    expect(store.getters['pos/pdvs'][0]).toMatchObject({ responsibleHrPersonId: 'h1', responsibleName: 'Awa Koné' })
    await store.dispatch('pos/setResponsible', { spaceId: 's1', eventId: 'e1', elementId: 'p1', hrPersonId: null })
    expect(api.updatePosPdvResponsible).toHaveBeenLastCalledWith('s1', 'e1', 'p1', null)
    expect(store.getters['pos/pdvs'][0].responsibleName).toBeNull()
  })

  it('saveSettings ne modifie pas le store si le serveur refuse', async () => {
    const store = makeStore()
    api.getPosEventDetail.mockResolvedValue(detail())
    await store.dispatch('pos/fetchDetail', { spaceId: 's1', eventId: 'e1' })
    api.updatePosEventSettings.mockRejectedValue(new Error('403'))
    await expect(
      store.dispatch('pos/saveSettings', { spaceId: 's1', eventId: 'e1', settings: { tipsEnabled: true } })
    ).rejects.toThrow('403')
    expect(store.getters['pos/settings'].tipsEnabled).toBe(false)
    api.updatePosEventSettings.mockResolvedValue({})
    await store.dispatch('pos/saveSettings', { spaceId: 's1', eventId: 'e1', settings: { ...detail().settings, tipsEnabled: true } })
    expect(store.getters['pos/settings'].tipsEnabled).toBe(true)
  })

  it('fetchSales remplace puis ajoute les pages par curseur', async () => {
    const store = makeStore()
    api.getPosSales
      .mockResolvedValueOnce({ rows: [{ id: 'a' }], nextCursor: 'c1', totals: { tickets: 2 } })
      .mockResolvedValueOnce({ rows: [{ id: 'b' }], nextCursor: null, totals: { tickets: 2 } })
    await store.dispatch('pos/fetchSales', { spaceId: 's1', eventId: 'e1', query: { limit: 1 } })
    await store.dispatch('pos/fetchSales', { spaceId: 's1', eventId: 'e1', query: { cursor: 'c1' }, append: true })
    expect(store.state.pos.sales.rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(store.state.pos.sales.nextCursor).toBeNull()
  })
})
