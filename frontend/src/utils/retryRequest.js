/**
 * Nouvel essai d'un appel GET idempotent (catalogues du réarmement / de l'Analyse).
 *
 * Pourquoi : un cold start Render ou un 5xx passager rendait un catalogue vide
 * (le `.catch(() => [])` d'avant avalait l'erreur sans rien retenter) et la page
 * Commandes s'affichait incomplète. On retente donc 2 fois, avec un délai
 * croissant, UNIQUEMENT sur erreur réseau / timeout / 5xx. Jamais sur un 4xx :
 * rejouer une requête refusée (401, 403, 404, 422...) ne sert à rien.
 *
 * Cumul avec src/api/client.js : l'intercepteur ne fait qu'UN retry sur timeout
 * (si /health répond) et un seul sur 429. Ici on borne à 2 essais en plus, donc le
 * pire cas reste raisonnable et chaque couche garde son rôle.
 */

export const DEFAULT_RETRY_DELAYS_MS = [1500, 4000]

/** Vrai pour une erreur transitoire : réseau coupé, timeout ou 5xx. */
export function isRetryableError(err) {
  if (!err) return false
  const status = err?.response?.status
  if (status != null) return status >= 500
  // Pas de réponse : réseau, DNS, timeout (ECONNABORTED / ETIMEDOUT / message axios).
  if (err?.code === 'ERR_CANCELED') return false
  return true
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * @param {() => Promise<any>} fn appel à (re)lancer, doit être idempotent (GET)
 * @param {{ delays?: number[], sleep?: (ms:number)=>Promise<void> }} [options]
 * @returns {Promise<any>} la valeur de fn, ou rejette avec la dernière erreur
 */
export async function retryRequest(fn, { delays = DEFAULT_RETRY_DELAYS_MS, sleep = wait } = {}) {
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= delays.length || !isRetryableError(err)) throw err
      await sleep(delays[attempt])
      attempt += 1
    }
  }
}

/**
 * Comme retryRequest mais ne rejette jamais : renvoie { value, error }.
 * `value` vaut `fallback` en cas d'échec définitif, `error` distingue l'échec
 * d'une vraie réponse vide (ne plus confondre « vide » et « échec »).
 */
export async function settleRequest(fn, { fallback = [], label = '', ...options } = {}) {
  try {
    return { value: await retryRequest(fn, options), error: null }
  } catch (err) {
    console.warn(`[retryRequest] ⚠️ ${label || 'requête'} en échec définitif:`, err?.response?.status, err?.message)
    return {
      value: fallback,
      error: { status: err?.response?.status ?? null, message: err?.message || String(err) },
    }
  }
}
