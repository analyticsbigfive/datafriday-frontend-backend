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
import { getSpaceEventTimelineBatch } from '@/api/endpoints/space.api'

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
