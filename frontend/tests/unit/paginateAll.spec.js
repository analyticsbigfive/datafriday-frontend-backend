/**
 * fetchAllPaginated — fiche 345-01 : les catalogues paginés (ingrédients 100,
 * market prices 200) étaient tronqués à la page 1, silencieusement — tout
 * article après la coupure alphabétique (« Tsingtao », « X1 ») perdait sa
 * résolution de conditionnement au Réarmement. La propriété qu'on fige :
 * toutes les pages sont chargées, ordre préservé, et les shapes de réponse
 * réelles ({data, meta} / tableau nu) sont toutes acceptées.
 */
import { fetchAllPaginated } from '@/utils/paginateAll'

const makeBackend = (rows, limit) => {
  const calls = []
  const fetchPage = jest.fn(async ({ page, limit: l }) => {
    calls.push(page)
    const start = (page - 1) * l
    return { data: rows.slice(start, start + l), meta: { total: rows.length, page, limit: l } }
  })
  return { fetchPage, calls }
}

describe('fetchAllPaginated', () => {
  it('une seule page quand total ≤ limit (aucun appel superflu)', async () => {
    const { fetchPage } = makeBackend(['a', 'b', 'c'], 100)
    const rows = await fetchAllPaginated(fetchPage, { limit: 100 })
    expect(rows).toEqual(['a', 'b', 'c'])
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('charge TOUTES les pages et préserve l’ordre (le bug : rester à la page 1)', async () => {
    const all = Array.from({ length: 250 }, (_, i) => `item-${String(i).padStart(3, '0')}`)
    const { fetchPage } = makeBackend(all, 100)
    const rows = await fetchAllPaginated(fetchPage, { limit: 100 })
    expect(rows).toHaveLength(250)
    expect(rows).toEqual(all) // ordre des pages préservé malgré le parallèle
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('réponse tableau nu sans meta : renvoyée telle quelle (pas de boucle infinie)', async () => {
    const fetchPage = jest.fn(async () => ['x', 'y'])
    const rows = await fetchAllPaginated(fetchPage, { limit: 100 })
    expect(rows).toEqual(['x', 'y'])
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('page 1 pleine mais total atteint : pas de page 2 fantôme', async () => {
    const { fetchPage } = makeBackend(Array.from({ length: 100 }, (_, i) => i), 100)
    const rows = await fetchAllPaginated(fetchPage, { limit: 100 })
    expect(rows).toHaveLength(100)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})
