/**
 * Préférences de démarrage de l'Analyse (période par défaut du compte), lues EN PARALLÈLE
 * du chargement de l'espace au lieu d'être attendues avant lui.
 *
 * Avant : `await getUserPreferences()` (500 à 780 ms mesurés) puis `loadSpace`, ce qui
 * retardait aussi shop-details, l'appel le plus lent (2,9 s), lancé à t=0 dans
 * fetchSpaceData. Maintenant : la lecture part en premier, `loadSpace` démarre sans
 * l'attendre, et fetchSpaceData attend la promesse `ready` juste avant de rendre la
 * phase 1 (donc après le lancement de shop-details et avant celui de la vague 2).
 *
 * Fonctions pures aux dépendances injectées (aucun réseau ici, ni store).
 */

/**
 * Plafond d'attente de la phase 1. 1500 ms vaut environ 2 fois le pire cas mesuré
 * (780 ms) : au-delà, attendre coûte plus cher qu'un refiltrage unique quand la
 * préférence arrive tard. Après le plafond, la préférence est quand même appliquée à son
 * arrivée (SET_DEFAULT_TIME_RANGE fait suivre la période si elle est encore au défaut).
 */
export const PREFERENCES_READY_TIMEOUT_MS = 1500

/**
 * Lance la lecture de la préférence « période par défaut » IMMÉDIATEMENT.
 *
 * Cache optionnel (stale-while-revalidate, `readCached` / `writeCached`) : si une ancienne
 * valeur valide est mémorisée, elle est appliquée tout de suite et `ready` se résout sans
 * attendre le réseau. La lecture distante continue en arrière-plan : à son arrivée (même
 * après `ready` ou le plafond), elle met le cache à jour et corrige la période si elle
 * diffère de celle appliquée. Un échec distant conserve le cache tel quel.
 *
 * @param {object} deps
 * @param {() => Promise<any>} deps.fetchPreferences lecture des préférences du compte
 * @param {(preset: (string|null)) => void} deps.applyPreset applique la période (commit du
 *   store), `null` pour revenir au défaut
 * @param {string[]} deps.validPresets valeurs de période acceptées (garde-fou, cache compris)
 * @param {number} [deps.timeoutMs] plafond d'attente de `ready`
 * @param {(message: string) => void} [deps.warn] journal d'un échec de lecture
 * @param {() => (string|null|undefined)} [deps.readCached] dernière période connue du compte
 * @param {(preset: (string|null)) => void} [deps.writeCached] mémorise la période du compte
 *   (`null` : le compte n'a pas de préférence)
 * @returns {Promise<'cached'|'applied'|'unchanged'|'failed'|'timeout'>} `ready`, JAMAIS
 *   rejetée, qui se résout au premier de : cache valide appliqué, préférence lue et appliquée,
 *   aucune préférence valide, échec de lecture, plafond atteint. Après un plafond, une lecture
 *   qui aboutit applique quand même la préférence (application tardive).
 */
export function startDefaultRangePreference({
  fetchPreferences,
  applyPreset,
  validPresets,
  timeoutMs = PREFERENCES_READY_TIMEOUT_MS,
  warn = () => {},
  readCached,
  writeCached,
} = {}) {
  let settled = false
  let timer = null
  let resolveReady = () => {}
  let appliedFromCache = null

  const ready = new Promise((resolve) => { resolveReady = resolve })
  const settle = (outcome) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    resolveReady(outcome)
  }

  timer = setTimeout(() => settle('timeout'), timeoutMs)

  const isValid = (preset) => !!preset && (validPresets || []).includes(preset)

  const onFailure = (e) => {
    warn(`préférences indisponibles, période par défaut appliquée: ${e?.message}`)
    settle('failed')
  }
  // Applique une période ; en cas d'erreur du commit : même traitement qu'un échec de lecture.
  const tryApply = (preset) => {
    try {
      applyPreset(preset)
      return true
    } catch (e) {
      onFailure(e)
      return false
    }
  }
  const saveCached = (preset) => {
    if (!writeCached) return
    try { writeCached(preset) } catch (_) { /* le cache est un bonus, jamais bloquant */ }
  }
  const loadCached = () => {
    if (!readCached) return null
    try {
      const cached = readCached()
      return isValid(cached) ? cached : null
    } catch (_) {
      return null
    }
  }

  const onPreferences = (prefs) => {
    const preset = prefs?.defaultDateRangePreset
    if (!isValid(preset)) {
      // Compte sans préférence : on oublie le cache et, s'il avait été appliqué, on revient
      // au défaut (la mutation du store fait suivre la période si elle n'a pas été touchée).
      saveCached(null)
      if (appliedFromCache && !tryApply(null)) return
      settle('unchanged')
      return
    }
    saveCached(preset)
    // Appliquée AVANT la résolution de `ready` : fetchSpaceData ne rend la phase 1
    // qu'après, donc le périmètre est le bon dès le premier commit. Si le cache portait
    // déjà cette valeur, rien à refaire.
    if (preset !== appliedFromCache && !tryApply(preset)) return
    settle('applied')
  }

  let reading
  try {
    reading = Promise.resolve(fetchPreferences())
  } catch (e) {
    reading = Promise.reject(e)
  }
  reading.then(onPreferences, onFailure)

  // Après le départ de la lecture distante : la dernière période connue est appliquée sans
  // attendre. Une erreur du commit passe par onFailure (warn, 'failed') sans rien bloquer.
  const cached = loadCached()
  if (cached && tryApply(cached)) {
    appliedFromCache = cached
    settle('cached')
  }

  return ready
}

/**
 * Attend une promesse `ready` optionnelle sans jamais lever (absente, null, ou rejetée :
 * le chargement de l'espace ne doit jamais dépendre des préférences).
 *
 * @param {Promise<any>|null|undefined} ready
 * @returns {Promise<any>} la valeur de `ready`, ou undefined
 */
export async function waitForPreferencesReady(ready) {
  if (!ready) return undefined
  try {
    return await ready
  } catch (_) {
    return undefined
  }
}
