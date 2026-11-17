/**
 * Lecture de l'état Réarmement (GET restock-state) lancée tôt, consommée plus tard.
 *
 * L'appel ne dépend que de l'espace : on le démarre dès le montage de la page, en parallèle du
 * reste, au lieu de l'attendre en série à la fin du chargement (~400 ms gagnés). L'état n'est
 * appliqué qu'à la restauration, dans le même ordre qu'avant.
 *
 * Partie pure et injectable : les accès réseau, le mode démo et le drapeau « API tombée » sont
 * fournis par l'appelant. La promesse préchargée ne rejette jamais (l'erreur est gardée dans son
 * résultat), donc aucune « unhandled rejection » si elle n'est consommée que plus tard.
 */

/** Exécute `fetchState` tout de suite et rend toujours un résultat, jamais un rejet. */
async function settle(fetchState, spaceId) {
  try {
    return { error: null, value: await fetchState(spaceId) }
  } catch (error) {
    return { error, value: null }
  }
}

/**
 * Démarre la lecture. Mêmes conditions que la lecture directe : pas d'espace, mode démo ou API
 * tombée => rien n'est lancé.
 *
 * @param {string} spaceId
 * @param {Object} io
 * @param {() => boolean} io.isDemo
 * @param {() => boolean} io.isApiDown
 * @param {(spaceId: string) => Promise<object|null>} io.fetchState
 * @returns {{spaceId: string, settled: Promise<{error: any, value: object|null}>}|null}
 */
export function startRestockStatePrefetch(spaceId, { isDemo, isApiDown, fetchState }) {
  if (!spaceId || isDemo() || isApiDown()) return null
  return { spaceId: String(spaceId), settled: settle(fetchState, spaceId) }
}

/**
 * Lit l'état de l'API pour la restauration. Réutilise la lecture préchargée si elle existe pour
 * le même espace, sinon fait l'appel direct d'avant. Les conditions sont réévaluées ici (l'API
 * a pu tomber entre-temps). Une erreur passe par `onError` (qui peut marquer l'API tombée) et
 * rend null, comme l'ancien try/catch.
 *
 * @param {Object} p
 * @param {string} p.spaceId
 * @param {{spaceId: string, settled: Promise}|null} [p.prefetch]
 * @param {() => boolean} p.isDemo
 * @param {() => boolean} p.isApiDown
 * @param {(spaceId: string) => Promise<object|null>} p.fetchState
 * @param {(err: any) => void} p.onError
 * @returns {Promise<object|null>} le snapshot, ou null (aucun état, erreur, démo, API tombée)
 */
export async function readRestockState({ spaceId, prefetch = null, isDemo, isApiDown, fetchState, onError }) {
  if (!spaceId || isDemo() || isApiDown()) return null
  const reusable = prefetch && prefetch.spaceId === String(spaceId) ? prefetch.settled : null
  const outcome = await (reusable || settle(fetchState, spaceId))
  if (outcome.error) {
    onError(outcome.error)
    return null
  }
  return outcome.value ?? null
}
