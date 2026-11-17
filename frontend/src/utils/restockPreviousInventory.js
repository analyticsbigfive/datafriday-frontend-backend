/**
 * Chargement de l'inventaire « précédent » du Réarmement (Commandes), partie pure et injectable.
 *
 * Trois lectures indépendantes partaient en série (stock Logistique, comptages du store
 * inventory, inventaire de l'événement précédent) : elles partent désormais en parallèle. Le
 * repli « dernier inventaire » reste après elles, car il dépend de leur résultat (comptages vides).
 * Le composant ne fait que le câblage : les écritures d'état et les appels réseau lui restent.
 */

/**
 * Clé de fusion des appels identiques en vol. Deux appels ne partagent la même clé que si toutes
 * les entrées qui pilotent les lectures sont identiques. Les identifiants de configuration sont
 * triés (ordre sans effet) ; les événements sélectionnés gardent leur ordre (le premier pilote
 * l'inventaire compté en mode Prévision).
 *
 * @param {Object} p
 * @param {string|null} p.spaceId
 * @param {Iterable<string>} [p.configIds] configurations d'objectif résolues
 * @param {string|null} [p.countsEventId]
 * @param {string|null} [p.sourceInventoryEventId]
 * @param {string|null} [p.objectiveSource]
 * @param {Array<string>} [p.selectedEventIds]
 * @param {string|null} [p.previousEventId]
 * @returns {string}
 */
export function buildPreviousInventoryKey({
  spaceId = null,
  configIds = [],
  countsEventId = null,
  sourceInventoryEventId = null,
  objectiveSource = null,
  selectedEventIds = [],
  previousEventId = null,
} = {}) {
  const text = (v) => (v == null ? null : String(v))
  return JSON.stringify([
    text(spaceId),
    Array.from(configIds || [], String).sort(),
    text(countsEventId),
    text(sourceInventoryEventId),
    text(objectiveSource),
    Array.from(selectedEventIds || [], String),
    text(previousEventId),
  ])
}

/** Lance `fn` tout de suite ; une exception synchrone devient un rejet de la promesse. */
async function start(fn) {
  return fn()
}

/** Lance `fn` tout de suite et avale son erreur (le store garde son repli localStorage). */
async function swallow(fn) {
  try {
    await fn()
  } catch (_) {
    /* volontairement ignoré */
  }
}

/** Lit un inventaire précédent : API puis repli local, jamais d'exception. */
async function readPreviousCounts({ previousEvent, useLocalOnly, fetchPrevious, readLocal, extractCounts }) {
  let counts = {}
  if (!previousEvent) return counts
  if (useLocalOnly) {
    counts = readLocal(previousEvent.id)
  } else {
    try {
      counts = extractCounts(await fetchPrevious(previousEvent.id))
    } catch (_) {
      counts = readLocal(previousEvent.id)
    }
  }
  if (!Object.keys(counts).length) counts = readLocal(previousEvent.id)
  return counts
}

/**
 * Inventaire précédent puis, si les comptages sont vides, repli « dernier inventaire ». Les deux
 * enchaînent entre eux (le repli dépend du résultat) mais PAS sur le stock Logistique : toute la
 * branche tourne en parallèle de lui.
 */
async function readPreviousWithLatestFallback({
  previousEvent, useLocalOnly, fetchPrevious, fetchLatest, readLocal, extractCounts, findEventById,
}) {
  let counts = {}
  try {
    counts = await readPreviousCounts({ previousEvent, useLocalOnly, fetchPrevious, readLocal, extractCounts })
  } catch (_) {
    counts = {}
  }
  let sourceEvent = previousEvent || null
  if (!Object.keys(counts).length && !useLocalOnly) {
    try {
      const latest = await fetchLatest()
      counts = extractCounts(latest)
      if (latest?.eventId) sourceEvent = findEventById(latest.eventId) || sourceEvent
    } catch (_) {
      counts = {}
    }
  }
  return { counts, sourceEvent }
}

/**
 * Lance en parallèle les trois lectures ; le repli « dernier inventaire » (seulement si les
 * comptages sont vides) enchaîne sur l'inventaire précédent, sans attendre le stock Logistique. Toutes les lectures vont au bout même si l'une échoue.
 *
 * Erreurs, comme avant le passage en parallèle : le chargement du store est avalé (le store garde
 * son repli localStorage), l'API de l'inventaire précédent retombe sur le stockage local, le
 * repli « dernier inventaire » donne des comptages vides. Seule une erreur de `readLogistic` est
 * relancée, une fois les autres lectures terminées.
 *
 * @param {Object} p
 * @param {() => Promise<any>} p.readLogistic restant Logistique (écrit son index lui-même)
 * @param {() => Promise<any>} p.readStoreCounts comptages du store inventory
 * @param {boolean} p.skipPrevious vrai = pas d'inventaire précédent à lire (aucun évènement)
 * @param {{id: string}|null} p.previousEvent événement dont on lit l'inventaire
 * @param {boolean} [p.useLocalOnly] mode mock : stockage local uniquement
 * @param {(eventId: string) => Promise<any>} p.fetchPrevious GET de l'inventaire de l'événement
 * @param {() => Promise<any>} p.fetchLatest GET du dernier inventaire
 * @param {(eventId: string) => Object} p.readLocal comptages du stockage local
 * @param {(payload: any) => Object} p.extractCounts payload API vers comptages
 * @param {(eventId: string) => ({id: string}|null)} p.findEventById
 * @param {(loading: boolean) => void} [p.setLoading] indicateur de chargement de l'inventaire précédent
 * @returns {Promise<{skipped: boolean, counts: Object, sourceEvent: Object|null}>}
 */
export async function readPreviousInventorySources({
  readLogistic,
  readStoreCounts,
  skipPrevious,
  previousEvent,
  useLocalOnly = false,
  fetchPrevious,
  fetchLatest,
  readLocal,
  extractCounts,
  findEventById,
  setLoading = () => {},
}) {
  if (!skipPrevious) setLoading(true)
  try {
    // Les trois lectures partent dans le même tour : aucune n'attend les autres. La troisième
    // porte aussi son repli « dernier inventaire », qui n'attend donc pas le stock Logistique.
    const [logistic, , previous] = await Promise.allSettled([
      start(readLogistic),
      swallow(readStoreCounts),
      skipPrevious
        ? Promise.resolve({ counts: {}, sourceEvent: null })
        : readPreviousWithLatestFallback({
            previousEvent, useLocalOnly, fetchPrevious, fetchLatest, readLocal, extractCounts, findEventById,
          }),
    ])
    if (logistic.status === 'rejected') throw logistic.reason
    if (skipPrevious) return { skipped: true, counts: {}, sourceEvent: null }
    const { counts, sourceEvent } =
      previous.status === 'fulfilled' ? previous.value : { counts: {}, sourceEvent: previousEvent || null }
    return { skipped: false, counts, sourceEvent }
  } finally {
    if (!skipPrevious) setLoading(false)
  }
}
