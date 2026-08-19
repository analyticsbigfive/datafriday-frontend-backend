// Charge TOUTES les pages d'un endpoint paginé { data, meta: { total } } —
// le backend plafonne chaque appel (ingrédients: 100, market prices: 200,
// composants: 100) et tronquait silencieusement les catalogues des tenants
// au-delà du plafond : tout article après la coupure alphabétique perdait sa
// résolution de conditionnement (« Tsingtao », « X1 » — fiche 345-01).
//
// Même stratégie que fetchAllMenuComponents (useSpaceData, BUG-054/105) :
// page 1 séquentielle pour lire meta.total, pages restantes en parallèle
// borné (asyncPool), ordre des lignes préservé (concat par index de page).

import { runWithConcurrency } from '@/utils/asyncPool'

const extractRows = (res) =>
  Array.isArray(res)
    ? res
    : Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res?.items)
        ? res.items
        : []

/**
 * @param {(params: {page: number, limit: number}) => Promise<any>} fetchPage
 * @param {{ limit?: number, concurrency?: number }} [options]
 * @returns {Promise<Array>} toutes les lignes, ordre des pages préservé
 */
export async function fetchAllPaginated(fetchPage, { limit = 100, concurrency = 4 } = {}) {
  const first = await fetchPage({ page: 1, limit })
  const firstRows = extractRows(first)
  const total = first?.meta?.total ?? first?.data?.meta?.total
  // Pas de meta.total exploitable, page incomplète ou total atteint → une page suffit.
  if (!total || firstRows.length < limit || firstRows.length >= total) return firstRows

  const pageCount = Math.ceil(total / limit)
  const remainingPages = Array.from({ length: pageCount - 1 }, (_, i) => i + 2)
  const byPage = new Map()
  await runWithConcurrency(remainingPages, concurrency, async (page) => {
    const res = await fetchPage({ page, limit })
    byPage.set(page, extractRows(res))
  })
  let rows = firstRows
  for (const page of remainingPages) rows = rows.concat(byPage.get(page) || [])
  return rows
}
