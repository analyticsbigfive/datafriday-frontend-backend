// Récupération des ventes d'un event de référence (Règle 3).
//
// Stratégie "both + fallback" (décision produit verrouillée) :
//   1. getSalesForSpace -> edge function /functions/v1/sales (lignes détaillées
//      avec quantité par menu item / shop) — source primaire.
//   2. fallback getSalesSummaryForSpace -> make-server/sales/summary (revenu par
//      location, SANS quantité par item) — mode dégradé (degraded = true).
//   3. en dernier ressort, l'appelant peut retomber sur la prévision.

import { ref } from 'vue'
import * as api from '@/utils/api'

/**
 * Récupère toutes les pages de ventes d'un space sur une plage de dates.
 * Pagine via has_more / next_cursor.
 */
async function fetchAllSalesPages(spaceId, { fromDate, toDate, limit = 1000, maxPages = 50 } = {}) {
  const all = []
  let cursorDate
  let cursorId
  let pages = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await api.getSalesForSpace(spaceId, {
      fromDate,
      toDate,
      cursorDate,
      cursorId,
      limit,
    })
    const pageRows = page?.rows || []
    all.push(...pageRows)
    pages += 1
    const next = page?.next_cursor
    if (page?.has_more && next && pages < maxPages) {
      cursorDate = next.cursor_date || next.cursorDate
      cursorId = next.cursor_id || next.cursorId
      if (!cursorDate) break
    } else {
      break
    }
  }
  return all
}

/**
 * Fonction plate (utilisable hors composable, ex. vues Options API).
 * @returns {Promise<{rows: Array, degraded: boolean, summary?: Object, error?: string}>}
 */
export async function fetchReferenceSales(spaceId, { fromDate, toDate } = {}) {
  if (!spaceId) return { rows: [], degraded: false }
  try {
    const rows = await fetchAllSalesPages(spaceId, { fromDate, toDate })
    return { rows, degraded: false }
  } catch (primaryErr) {
    console.warn(
      '[useReferenceSales] sales edge function failed, trying summary fallback:',
      primaryErr?.message,
    )
    try {
      const summary = await api.getSalesSummaryForSpace(spaceId, { fromDate, toDate })
      return { rows: [], degraded: true, summary, error: 'sales-detail-unavailable' }
    } catch (fallbackErr) {
      return {
        rows: [],
        degraded: true,
        error: fallbackErr?.message || primaryErr?.message || 'sales-unavailable',
      }
    }
  }
}

/**
 * Composable réactif autour de fetchReferenceSales.
 */
export function useReferenceSales() {
  const rows = ref([])
  const summary = ref(null)
  const loading = ref(false)
  const degraded = ref(false)
  const error = ref(null)

  async function load(spaceId, range = {}) {
    loading.value = true
    error.value = null
    degraded.value = false
    rows.value = []
    summary.value = null
    try {
      const res = await fetchReferenceSales(spaceId, range)
      rows.value = res.rows
      summary.value = res.summary || null
      degraded.value = !!res.degraded
      error.value = res.error || null
      return res
    } finally {
      loading.value = false
    }
  }

  return { rows, summary, loading, degraded, error, load }
}
