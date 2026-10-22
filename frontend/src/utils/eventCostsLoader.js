/**
 * Chargement par lots des coûts figés par event (lot 4b). Aucune dépendance au store
 * ni à axios : le fetcher est injecté, ce qui garde le module testable.
 */
import { normalizeEventCosts } from '@/utils/eventCostLookup'

const BATCH_SIZE = 100

/**
 * @param {string} spaceId
 * @param {string[]} eventIds
 * @param {(spaceId:string, ids:string[]) => Promise<object>} fetcher  getEventCosts
 * @returns {Promise<Object<string, Object<string, number>>>} carte normalisée ; un lot en
 *   échec est ignoré (warn), ses events restent absents donc en repli sur le coût actuel.
 */
export async function loadEventCostsInBatches(spaceId, eventIds, fetcher) {
  const ids = [...new Set((eventIds || []).filter(Boolean))]
  const merged = {}
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE)
    try {
      Object.assign(merged, normalizeEventCosts(await fetcher(spaceId, chunk)))
    } catch (err) {
      console.warn('[analyse] coûts par event indisponibles, repli sur le coût actuel:', err?.message)
    }
  }
  return merged
}
