/**
 * Wrapper d'appel API — mode démo retiré.
 *
 * Historiquement, en cas d'erreur réseau / timeout / 5xx / 404, ce wrapper se
 * rabattait silencieusement sur un payload mock taggé `_fromMock: true`. Ce
 * fallback est SUPPRIMÉ : on appelle toujours l'API réelle et on laisse remonter
 * les erreurs pour que l'UI affiche un vrai état (loading / error / empty), sans
 * jamais masquer un échec par des données factices.
 *
 * La signature reste inchangée (mockFactory ignoré) pour ne pas casser les
 * appelants existants.
 *
 * Usage :
 *   const data = await apiOrMock(() => api.get('/analyse/dashboard'))
 */

const FROM_MOCK_FLAG = '_fromMock'

function tagMock(payload) {
  if (payload == null) return payload
  if (Array.isArray(payload)) {
    // Arrays cannot carry the flag → wrap result with an enumerable, non-
    // breaking property when possible (kept as-is so callers can still iterate).
    Object.defineProperty(payload, FROM_MOCK_FLAG, {
      value: true,
      enumerable: false,
      configurable: true,
    })
    return payload
  }
  if (typeof payload === 'object') {
    return { ...payload, [FROM_MOCK_FLAG]: true }
  }
  return payload
}

function shouldFallback(err) {
  const status = err?.response?.status
  if (status === 401 || status === 403) return false
  if (!err?.response) return true                  // network error
  if (err?.code === 'ECONNABORTED') return true    // timeout
  if (status === 404) return true
  if (status >= 500) return true
  return false
}

export async function apiOrMock(apiCall /*, mockFactory, opts */) {
  // Plus de fallback mock : appel API réel, erreurs propagées telles quelles.
  return apiCall()
}

export { FROM_MOCK_FLAG, tagMock, shouldFallback }
