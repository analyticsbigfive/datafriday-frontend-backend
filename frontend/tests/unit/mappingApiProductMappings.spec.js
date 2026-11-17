/**
 * getProductMappings : mode « paires » opt-in (`pairsOnly`).
 *
 * Invariants couverts :
 *   - mode paires : UNE seule requête, avec `view=pairs`, quand le backend honore le mode ;
 *   - vieux backend (ignore `view`, répond paginé totalPages 3) : retombée sur la pagination
 *     et toutes les lignes sont rassemblées, sans ajouter `view` aux pages suivantes ;
 *   - `meta.truncated` (plafond backend atteint) : lecture complète refaite en mode normal ;
 *   - mode normal (sans option) : inchangé, jamais de `view`.
 */
jest.mock('@/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

import api from '@/api/client'
import { getProductMappings } from '@/api/endpoints/mapping.api'

const row = (i) => ({ id: `r${i}`, weezeventProductId: `p${i}`, menuItemId: `m${i}` })
const pageOf = (rows, meta) => ({ data: { data: rows, meta } })

/** Backend paginé par pages de 200 qui ignore `view` : sert `pages` pages de 1 ligne chacune. */
function mockLegacyPaginatedBackend(totalPages) {
  api.get.mockImplementation(async (url, { params }) => {
    return pageOf([row(params.page)], { page: params.page, limit: 200, total: totalPages, totalPages })
  })
}

describe('getProductMappings', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('mode paires : une seule requête avec view=pairs', async () => {
    const pairs = [
      { weezeventProductId: 'p1', menuItemId: 'm1' },
      { weezeventProductId: 'p2', menuItemId: 'm2' },
    ]
    api.get.mockResolvedValueOnce(pageOf(pairs, { page: 1, limit: 2, total: 2, totalPages: 1, truncated: false }))

    const result = await getProductMappings(undefined, { pairsOnly: true })

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get.mock.calls[0][0]).toBe('/mappings/product-menu')
    expect(api.get.mock.calls[0][1].params).toMatchObject({ page: 1, view: 'pairs' })
    expect(result).toEqual(pairs)
  })

  it('mode paires : transmet locationId et reste en une requête', async () => {
    api.get.mockResolvedValueOnce(pageOf([], { page: 1, limit: 0, total: 0, totalPages: 1, truncated: false }))

    await getProductMappings('loc-1', { pairsOnly: true })

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get.mock.calls[0][1].params).toMatchObject({ locationId: 'loc-1', view: 'pairs' })
  })

  it('vieux backend (totalPages 3, view ignoré) : retombe sur la pagination et rassemble tout', async () => {
    mockLegacyPaginatedBackend(3)

    const result = await getProductMappings(undefined, { pairsOnly: true })

    // Page 1 (déjà reçue, réutilisée) + pages 2 et 3 : 3 requêtes au total, pas de page 1 refaite.
    expect(api.get).toHaveBeenCalledTimes(3)
    const pagesAsked = api.get.mock.calls.map((c) => c[1].params.page).sort()
    expect(pagesAsked).toEqual([1, 2, 3])
    // `view` seulement sur la page 1 ; les pages suivantes sont des pages normales.
    const withView = api.get.mock.calls.filter((c) => c[1].params.view === 'pairs')
    expect(withView).toHaveLength(1)
    expect(withView[0][1].params.page).toBe(1)
    expect(result.map((r) => r.id)).toEqual(['r1', 'r2', 'r3'])
  })

  it('truncated : refait la lecture complète en mode normal, sans view', async () => {
    api.get.mockImplementation(async (url, { params }) => {
      if (params.view === 'pairs') {
        return pageOf([{ weezeventProductId: 'p1', menuItemId: 'm1' }], {
          page: 1, limit: 1, total: 1, totalPages: 1, truncated: true,
        })
      }
      return pageOf([row(params.page)], { page: params.page, limit: 200, total: 2, totalPages: 2 })
    })

    const result = await getProductMappings(undefined, { pairsOnly: true })

    // 1 requête paires + page 1 normale + page 2 normale.
    expect(api.get).toHaveBeenCalledTimes(3)
    const normalCalls = api.get.mock.calls.filter((c) => c[1].params.view === undefined)
    expect(normalCalls.map((c) => c[1].params.page).sort()).toEqual([1, 2])
    expect(result.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('mode normal : inchangé, aucun paramètre view et toutes les pages rassemblées', async () => {
    mockLegacyPaginatedBackend(3)

    const result = await getProductMappings()

    expect(api.get).toHaveBeenCalledTimes(3)
    for (const call of api.get.mock.calls) {
      expect(call[1].params.view).toBeUndefined()
      expect(call[1].params.limit).toBe(200)
    }
    expect(result.map((r) => r.id)).toEqual(['r1', 'r2', 'r3'])
  })

  it('mode normal : une seule page quand totalPages vaut 1', async () => {
    api.get.mockResolvedValueOnce(pageOf([row(1)], { page: 1, limit: 200, total: 1, totalPages: 1 }))

    const result = await getProductMappings('loc-2')

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get.mock.calls[0][1].params).toEqual({ page: 1, limit: 200, locationId: 'loc-2' })
    expect(result).toEqual([row(1)])
  })
})
