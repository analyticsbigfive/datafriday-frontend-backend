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
 * @param {object} deps
 * @param {() => Promise<any>} deps.fetchPreferences lecture des préférences du compte
 * @param {(preset: string) => void} deps.applyPreset applique la période (commit du store)
 * @param {string[]} deps.validPresets valeurs de période acceptées (garde-fou inchangé)
 * @param {number} [deps.timeoutMs] plafond d'attente de `ready`
 * @param {(message: string) => void} [deps.warn] journal d'un échec de lecture
 * @returns {Promise<'applied'|'unchanged'|'failed'|'timeout'>} `ready`, JAMAIS rejetée, qui
 *   se résout au premier de : préférence lue et appliquée, aucune préférence valide, échec
 *   de lecture, plafond atteint. Après un plafond, une lecture qui aboutit applique
 *   quand même la préférence (application tardive).
 */
export function startDefaultRangePreference({
  fetchPreferences,
  applyPreset,
  validPresets,
  timeoutMs = PREFERENCES_READY_TIMEOUT_MS,
  warn = () => {},
} = {}) {
  let settled = false
  let timer = null
  let resolveReady = () => {}

  const ready = new Promise((resolve) => { resolveReady = resolve })
  const settle = (outcome) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    resolveReady(outcome)
  }

  timer = setTimeout(() => settle('timeout'), timeoutMs)

  const onFailure = (e) => {
    warn(`préférences indisponibles, période par défaut appliquée: ${e?.message}`)
    settle('failed')
  }
  const onPreferences = (prefs) => {
    const preset = prefs?.defaultDateRangePreset
    if (!preset || !(validPresets || []).includes(preset)) {
      settle('unchanged')
      return
    }
    try {
      applyPreset(preset)
    } catch (e) {
      onFailure(e)
      return
    }
    // Appliquée AVANT la résolution de `ready` : fetchSpaceData ne rend la phase 1
    // qu'après, donc le périmètre est le bon dès le premier commit.
    settle('applied')
  }

  let reading
  try {
    reading = Promise.resolve(fetchPreferences())
  } catch (e) {
    reading = Promise.reject(e)
  }
  reading.then(onPreferences, onFailure)

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
