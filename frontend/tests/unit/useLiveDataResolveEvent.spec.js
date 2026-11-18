/**
 * useLiveData : la liste des events de l'espace est lancée en même temps que live-status au
 * premier chargement (avant : un aller-retour de plus, live-status puis events puis timeline).
 * Le résultat (event résolu, id, lignes) doit rester identique.
 */
jest.mock('@/api/endpoints/space.api', () => ({
  getSpaceLiveStatus: jest.fn(),
  getSpaceEventTimelineBatch: jest.fn(),
  getSpaceTransactionBasketsBatch: jest.fn(),
}))
jest.mock('@/api/endpoints/event.api', () => ({ getEvents: jest.fn() }))
jest.mock('@/api/endpoints/liveDelta.api', () => ({ getLiveDelta: jest.fn() }))
jest.mock('@/composables/useLiveStream', () => ({
  useLiveStream: () => ({ connect: jest.fn(), disconnect: jest.fn(), connected: { value: true } }),
}))

import { getSpaceLiveStatus, getSpaceEventTimelineBatch, getSpaceTransactionBasketsBatch } from '@/api/endpoints/space.api'
import { getEvents } from '@/api/endpoints/event.api'
import { useLiveData } from '@/composables/useLiveData'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  jest.clearAllMocks()
  getSpaceEventTimelineBatch.mockResolvedValue(new Map([['e1', [{ shopId: 's1' }]]]))
  getSpaceTransactionBasketsBatch.mockResolvedValue(new Map([['e1', []]]))
})

describe('useLiveData, résolution de l\'event au premier chargement', () => {
  it('demande la liste des events sans attendre la réponse de live-status', async () => {
    const status = deferred()
    getSpaceLiveStatus.mockReturnValue(status.promise)
    getEvents.mockResolvedValue({ data: [{ id: 'e1', name: 'Match' }] })

    const live = useLiveData('sp-1')
    const done = live.refresh()

    // live-status n'a pas répondu, la liste des events est déjà partie.
    expect(getEvents).toHaveBeenCalledTimes(1)
    expect(getEvents).toHaveBeenCalledWith({ spaceId: 'sp-1', limit: 200, excludeSimulated: false })

    status.resolve({ isLive: true, eventId: 'e1', since: '2026-11-18T18:00:00' })
    await done

    expect(live.eventId.value).toBe('e1')
    expect(live.event.value).toEqual({ id: 'e1', name: 'Match' })
    expect(live.isLive.value).toBe(true)
    expect(getEvents).toHaveBeenCalledTimes(1)
    expect(getSpaceEventTimelineBatch).toHaveBeenCalledTimes(1)
  })

  it('sans event live, retient le premier event du jour de la liste (même résultat)', async () => {
    getSpaceLiveStatus.mockResolvedValue({ isLive: false, eventId: null })
    const now = new Date()
    getEvents.mockResolvedValue({
      data: [{ id: 'e1', name: 'Aujourd hui', eventDate: now.toISOString(), eventStartDate: now.toISOString() }],
    })

    const live = useLiveData('sp-1')
    await live.refresh()

    expect(live.eventId.value).toBe('e1')
    expect(live.event.value.name).toBe('Aujourd hui')
    expect(live.isLive.value).toBe(false)
  })

  it('si live-status échoue, l\'erreur est exposée comme avant et rien ne reste non géré', async () => {
    getSpaceLiveStatus.mockRejectedValue(new Error('live-status KO'))
    getEvents.mockRejectedValue(new Error('events KO'))

    const live = useLiveData('sp-1')
    await live.refresh()
    // laisse passer les microtâches : un rejet non géré ferait échouer jest
    await new Promise((r) => setTimeout(r, 0))

    expect(live.error.value).toBe('live-status KO')
    expect(live.eventId.value).toBeNull()
  })

  it('si la liste des events échoue après un live-status réussi, l\'erreur remonte', async () => {
    getSpaceLiveStatus.mockResolvedValue({ isLive: true, eventId: 'e1' })
    getEvents.mockRejectedValue(new Error('events KO'))

    const live = useLiveData('sp-1')
    await live.refresh()

    expect(live.error.value).toBe('events KO')
  })
})
