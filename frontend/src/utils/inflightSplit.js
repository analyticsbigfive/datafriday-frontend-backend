/**
 * Tri d'une liste d'ids en trois groupes : déjà en cache, déjà en vol, à aller chercher.
 *
 * Utilisé par les appels de lot (event-timeline, transaction-baskets). Avant ce helper, la
 * boucle de tri faisait `await` sur chaque promesse en vol AVANT de trier les ids suivants :
 * un appel qui mélangeait des events déjà en vol et des events neufs attendait la fin des
 * premiers pour seulement lancer le fetch des seconds (deux requêtes /event-timeline qui
 * s'enchaînaient alors que rien ne les liait). Ici le tri est SYNCHRONE : aucun `await`,
 * donc les ids neufs partent tout de suite, et les promesses en vol s'attendent ensuite
 * en parallèle avec `awaitInflightInto`.
 */

/**
 * @template V
 * @param {string[]} ids ids déjà dédoublonnés, dans l'ordre voulu
 * @param {{
 *   keyOf: (id: string) => string,
 *   getCached: (key: string) => V|undefined,
 *   getInflight: (key: string) => Promise<V>|undefined,
 *   bypassCache?: boolean,
 * }} opts
 *   getCached doit rafraîchir la récence du cache LRU (appeler `_lruGet`) et renvoyer
 *   `undefined` quand la clé est absente (les caches ne stockent jamais `undefined`).
 *   bypassCache : tous les ids vont dans `missing`, sans lire cache ni registre en vol.
 * @returns {{
 *   cached: Map<string, V>,
 *   inflight: Array<{eventId: string, promise: Promise<V>}>,
 *   missing: string[],
 * }}
 */
export function splitCachedInflightMissing(ids, { keyOf, getCached, getInflight, bypassCache = false }) {
  const cached = new Map()
  const inflight = []
  const missing = []
  for (const eventId of ids) {
    if (bypassCache) {
      missing.push(eventId)
      continue
    }
    const key = keyOf(eventId)
    const hit = getCached(key)
    if (hit !== undefined) {
      cached.set(eventId, hit)
      continue
    }
    const promise = getInflight(key)
    if (promise !== undefined) inflight.push({ eventId, promise })
    else missing.push(eventId)
  }
  return { cached, inflight, missing }
}

/**
 * Attend toutes les promesses en vol en parallèle puis range chaque valeur dans `result`.
 * Un rejet rejette l'ensemble (comme le `await` en série d'avant). Les valeurs ne sont
 * écrites dans `result` qu'une fois TOUTES les promesses tenues.
 *
 * @template V
 * @param {Map<string, V>} result
 * @param {Array<{eventId: string, promise: Promise<V>}>} inflight
 * @returns {Promise<Map<string, V>>} `result`
 */
export async function awaitInflightInto(result, inflight) {
  const values = await Promise.all(inflight.map((entry) => entry.promise))
  inflight.forEach((entry, i) => result.set(entry.eventId, values[i]))
  return result
}
