// Quota du localStorage (~5 Mo par origine) et session Supabase.
//
// L'application met en cache dans le localStorage des données reconstructibles depuis
// le serveur (prévisions Event Predict, miroir des versions, catalogue market prices).
// Quand ces caches remplissent le quota, l'écriture de la session Supabase après la
// connexion échoue en silence : la session ne vit qu'en mémoire et l'utilisateur est
// déconnecté au rechargement suivant (constaté 2026-09-25 : 5 reconnexions Google en
// 7 minutes, sessions valides côté serveur). La session est prioritaire : on purge
// ces caches, par paliers, puis on réessaie. Fonctions PURES sur un `Storage` injecté.

// Paliers de purge, du plus sûr au moins sûr. Tous sont des CACHES : la donnée de
// référence est en base et se recharge à la prochaine ouverture de l'écran.
export const EVICTION_TIERS = [
  // Pont Event Predict → Restock (Restock relit `predictedRecords` en base) et
  // catalogue market prices (cache SWR, rechargé au prochain appel).
  ['datafriday:predicted-records:', 'analyse:market-prices-cache'],
  // Miroir local des versions Event Predict (la table EventPredictVersion fait foi).
  ['analyse:event-predict-versions:'],
]

// Au-delà de ce volume (en caractères, clés comprises), le palier 1 est purgé au
// démarrage, avant que la session n'ait besoin d'être écrite.
export const PRUNE_THRESHOLD_CHARS = 4 * 1024 * 1024

export function isQuotaError(error) {
  if (!error) return false
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  )
}

function listKeys(storage) {
  const keys = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k != null) keys.push(k)
  }
  return keys
}

/** Volume occupé (caractères de clés + valeurs). */
export function storageUsageChars(storage) {
  let total = 0
  for (const k of listKeys(storage)) total += k.length + (storage.getItem(k) || '').length
  return total
}

/** Supprime les clés des préfixes d'un palier. @returns {number} clés supprimées */
export function evictTier(storage, prefixes) {
  let removed = 0
  for (const k of listKeys(storage)) {
    if (prefixes.some((p) => k.startsWith(p))) {
      storage.removeItem(k)
      removed += 1
    }
  }
  return removed
}

/** Purge le palier 1 si le stockage approche du quota. @returns {number} clés supprimées */
export function pruneIfNearQuota(storage, threshold = PRUNE_THRESHOLD_CHARS) {
  try {
    if (!storage || storageUsageChars(storage) < threshold) return 0
    return evictTier(storage, EVICTION_TIERS[0])
  } catch (_) {
    return 0
  }
}

/**
 * Adaptateur `storage` pour supabase-js : identique au localStorage, sauf qu'une
 * écriture refusée pour quota purge les caches (palier par palier) et réessaie.
 */
export function createQuotaSafeStorage(storage) {
  return {
    getItem: (key) => storage.getItem(key),
    removeItem: (key) => storage.removeItem(key),
    setItem: (key, value) => {
      try {
        storage.setItem(key, value)
        return
      } catch (error) {
        if (!isQuotaError(error)) throw error
        for (const tier of EVICTION_TIERS) {
          evictTier(storage, tier)
          try {
            storage.setItem(key, value)
            // eslint-disable-next-line no-console
            console.warn('[auth] stockage plein : caches purgés pour enregistrer la session')
            return
          } catch (retryError) {
            if (!isQuotaError(retryError)) throw retryError
          }
        }
        throw error
      }
    },
  }
}
