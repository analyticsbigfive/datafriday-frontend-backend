/**
 * getSpaceEventTimelineBatch — nettoyage du registre in-flight sur ÉCHEC.
 *
 * Bug corrigé (2026-07-18) : les entrées `_eventTimelineInflight` posées pour les
 * events manquants n'étaient supprimées que sur le chemin succès. Un rejet de la
 * requête batch laissait en Map des promesses rejetées permanentes : tout appel
 * ultérieur pour ces events re-levait la même erreur jusqu'au reload de la page.
 */
jest.mock('@/utils/demoMode', () => ({ isDemoMode: () => false }))
jest.mock('@/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

import api from '@/api/client'
import { getSpaceEventTimelineBatch, getSpaceTransactionBasketsBatch } from '@/api/endpoints/space.api'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('getSpaceEventTimelineBatch — in-flight cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('un échec batch ne poisonne pas les appels suivants (retry possible)', async () => {
    // 1er appel : le backend rejette.
    api.get.mockRejectedValueOnce(new Error('network down'))
    await expect(getSpaceEventTimelineBatch('space-1', ['evt-a', 'evt-b'])).rejects.toThrow('network down')

    // 2e appel : le backend répond — AVANT le fix, les entrées in-flight rejetées
    // restaient en Map et ce retry re-levait « network down » sans requête réseau.
    api.get.mockResolvedValueOnce({
      data: { 'evt-a': [{ minute: '19:00', quantity: 2 }], 'evt-b': [] },
    })
    const result = await getSpaceEventTimelineBatch('space-1', ['evt-a', 'evt-b'])

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(result.get('evt-a')).toEqual([{ minute: '19:00', quantity: 2 }])
    expect(result.get('evt-b')).toEqual([])
  })

  it('sert les events depuis le cache après un batch réussi (pas de re-fetch)', async () => {
    api.get.mockResolvedValueOnce({
      data: { 'evt-c': [{ minute: '20:00', quantity: 1 }] },
    })
    await getSpaceEventTimelineBatch('space-2', ['evt-c'])

    const again = await getSpaceEventTimelineBatch('space-2', ['evt-c'])
    // Réponse non vide figée en cache session → un seul GET réseau au total.
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(again.get('evt-c')).toEqual([{ minute: '20:00', quantity: 1 }])
  })
})

describe('lots : events déjà en vol + events neufs dans le même appel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('timeline : l event neuf part SANS attendre la fin de l event en vol', async () => {
    let resolveA
    api.get.mockImplementationOnce(() => new Promise((r) => { resolveA = r }))
    const first = getSpaceEventTimelineBatch('space-mix-1', ['evt-a'])
    await tick()
    expect(api.get).toHaveBeenCalledTimes(1)

    api.get.mockResolvedValueOnce({ data: { 'evt-b': [{ minute: '21:00', quantity: 3 }] } })
    const second = getSpaceEventTimelineBatch('space-mix-1', ['evt-a', 'evt-b'])
    await tick()
    // L event A n est PAS encore répondu, et pourtant le GET de B est déjà parti.
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get.mock.calls[1][1].params.eventIds).toBe('evt-b')

    resolveA({ data: { 'evt-a': [{ minute: '20:00', quantity: 1 }] } })
    const [r1, r2] = await Promise.all([first, second])
    expect(r1.get('evt-a')).toEqual([{ minute: '20:00', quantity: 1 }])
    expect(r2.get('evt-a')).toEqual([{ minute: '20:00', quantity: 1 }])
    expect(r2.get('evt-b')).toEqual([{ minute: '21:00', quantity: 3 }])
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('timeline : onEvent ne se déclenche que pour les events fetchés par CET appel', async () => {
    let resolveA
    api.get.mockImplementationOnce(() => new Promise((r) => { resolveA = r }))
    const first = getSpaceEventTimelineBatch('space-mix-2', ['evt-a'])
    await tick()

    api.get.mockResolvedValueOnce({ data: { 'evt-b': [{ minute: '21:00', quantity: 3 }] } })
    const onEvent = jest.fn()
    const second = getSpaceEventTimelineBatch('space-mix-2', ['evt-a', 'evt-b'], { onEvent })
    resolveA({ data: { 'evt-a': [{ minute: '20:00', quantity: 1 }] } })
    await Promise.all([first, second])
    expect(onEvent.mock.calls.map((c) => c[0])).toEqual(['evt-b'])
  })

  it('timeline : un event en vol qui échoue fait rejeter l appel mixte, et l event neuf est quand même fetché puis nettoyé', async () => {
    let rejectA
    api.get.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectA = reject }))
    const first = getSpaceEventTimelineBatch('space-mix-3', ['evt-a'])
    first.catch(() => {})
    await tick()

    api.get.mockResolvedValueOnce({ data: { 'evt-b': [{ minute: '21:00', quantity: 3 }] } })
    const second = getSpaceEventTimelineBatch('space-mix-3', ['evt-a', 'evt-b'])
    second.catch(() => {})
    await tick()
    rejectA(new Error('network down'))
    await expect(first).rejects.toThrow('network down')
    await expect(second).rejects.toThrow('network down')

    // B a bien été fetché et mis en cache : un nouvel appel ne retourne pas au réseau pour B.
    api.get.mockResolvedValueOnce({ data: { 'evt-a': [{ minute: '20:00', quantity: 1 }] } })
    const retry = await getSpaceEventTimelineBatch('space-mix-3', ['evt-a', 'evt-b'])
    expect(api.get).toHaveBeenCalledTimes(3)
    expect(api.get.mock.calls[2][1].params.eventIds).toBe('evt-a')
    expect(retry.get('evt-b')).toEqual([{ minute: '21:00', quantity: 3 }])
  })

  it('timeline : tout est en vol, aucun nouveau GET, résultat complet', async () => {
    let resolveA
    api.get.mockImplementationOnce(() => new Promise((r) => { resolveA = r }))
    const first = getSpaceEventTimelineBatch('space-mix-4', ['evt-a'])
    await tick()
    const second = getSpaceEventTimelineBatch('space-mix-4', ['evt-a'])
    await tick()
    resolveA({ data: { 'evt-a': [{ minute: '20:00', quantity: 1 }] } })
    const [r1, r2] = await Promise.all([first, second])
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(r2.get('evt-a')).toEqual(r1.get('evt-a'))
  })

  it('paniers : l event neuf part SANS attendre la fin de l event en vol', async () => {
    let resolveA
    api.get.mockImplementationOnce(() => new Promise((r) => { resolveA = r }))
    const first = getSpaceTransactionBasketsBatch('space-mix-5', ['evt-a'])
    await tick()
    expect(api.get).toHaveBeenCalledTimes(1)

    api.get.mockResolvedValueOnce({ data: { 'evt-b': [{ combo: 'x' }] } })
    const second = getSpaceTransactionBasketsBatch('space-mix-5', ['evt-a', 'evt-b'])
    await tick()
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get.mock.calls[1][1].params.eventIds).toBe('evt-b')

    resolveA({ data: { 'evt-a': [{ combo: 'y' }] } })
    const [r1, r2] = await Promise.all([first, second])
    expect(r1.get('evt-a')).toEqual([{ combo: 'y' }])
    expect(r2.get('evt-a')).toEqual([{ combo: 'y' }])
    expect(r2.get('evt-b')).toEqual([{ combo: 'x' }])
  })
})
