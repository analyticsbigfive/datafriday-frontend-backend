/**
 * Démarrage anticipé de la lecture du stock Logistique de la page Commandes.
 *
 * Constat (mesure prod) : `GET /logistics/:spaceId/stock` dure ~1,3 s mais ne part qu'à t = 2,6 s.
 * Il n'attend aucune donnée de la vague catalogues, seulement les ids de configuration des
 * évènements objectif, que `loadAll` ne connaît avec certitude qu'après une chaîne en série :
 * `analyse/loadSpace` (phase 1), `predict-versions/summary`, les versions BDD des matchs prédits,
 * puis la sélection par défaut et le watcher `selectedEventIds`.
 *
 * Approche : MÉMORISER les ids de configuration réellement lus par la vue à la dernière visite de
 * l'espace (ce sont ceux de `resolvedObjectiveConfigIds`, y compris la config synthétique
 * `synthetic-restock` reconstruite par la vue), puis les REJOUER dès la fin de la phase 1 via le
 * MÊME partage d'appels que `loadLogisticRemaining` (`recentReads`, même clé) :
 *  - mémoire juste : le flux normal arrive avec la même clé et réutilise l'appel en vol (ou le
 *    résultat récent), un seul appel au total ;
 *  - mémoire absente ou fausse : le flux normal relance son propre appel, résultat identique à
 *    avant, au prix d'un appel en trop au pire.
 * Le démarrage anticipé n'écrit JAMAIS `logisticRemainingIndex` : seul `loadLogisticRemaining`
 * l'écrit, avec son garde de séquence.
 *
 * Tout est pur ou injecté (stockage, partage d'appels, lecture) : aucun global. La mémoire ne lève
 * jamais : le localStorage peut être plein ou indisponible (incident de déconnexion au rechargement
 * causé par un quota plein), et une mémoire ratée ne doit jamais gêner la page.
 */

/** Configuration synthétique reconstruite par la vue : n'existe pas en base. */
const SYNTHETIC_CONFIG_ID = 'synthetic-restock'

/** Au plus ce nombre d'ids mémorisés par espace (garde contre une valeur démesurée). */
const MAX_REMEMBERED_IDS = 20

const storageKey = (spaceId) => `restock:logistic-config-ids:${spaceId}`

/**
 * Clé de partage d'appels de la lecture du stock Logistique. UTILISÉE par la vue ET par le
 * démarrage anticipé : c'est ce qui garantit que les deux tombent sur la même lecture.
 *
 * @param {string} spaceId
 * @param {Iterable<string|number>} configIds
 * @returns {string}
 */
export function logisticReadKey(spaceId, configIds) {
  const ids = Array.from(new Set(Array.from(configIds || [], String))).sort()
  return `logistic:${spaceId}:${ids.join(',')}`
}

/** Ids texte, sans doublon ni valeur vide, dans l'ordre d'arrivée. */
function cleanIds(configIds) {
  const out = []
  Array.from(configIds || []).forEach((id) => {
    if (id == null || id === '') return
    const text = String(id)
    if (text && !out.includes(text)) out.push(text)
  })
  return out
}

/**
 * Mémorise les ids de config lus pour cet espace. Rien n'est écrit si la liste est vide. Ne lève
 * jamais (stockage plein, absent, refusé).
 *
 * @param {{setItem: Function}|null|undefined} storage  `window.localStorage` injecté
 * @param {string} spaceId
 * @param {Iterable<string|number>} configIds
 * @returns {boolean} true si quelque chose a été écrit
 */
export function rememberLogisticConfigIds(storage, spaceId, configIds) {
  try {
    if (!storage || !spaceId) return false
    const ids = cleanIds(configIds).slice(0, MAX_REMEMBERED_IDS)
    if (!ids.length) return false
    storage.setItem(storageKey(spaceId), JSON.stringify(ids))
    return true
  } catch (_) {
    return false
  }
}

/**
 * Relit les ids mémorisés pour cet espace. Valeur absente, illisible ou d'une autre forme qu'un
 * tableau de chaînes : liste vide. Ne lève jamais.
 *
 * @param {{getItem: Function}|null|undefined} storage
 * @param {string} spaceId
 * @returns {string[]}
 */
export function recallLogisticConfigIds(storage, spaceId) {
  try {
    if (!storage || !spaceId) return []
    const raw = storage.getItem(storageKey(spaceId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    if (!parsed.every((id) => typeof id === 'string' && id)) return []
    return cleanIds(parsed).slice(0, MAX_REMEMBERED_IDS)
  } catch (_) {
    return []
  }
}

/**
 * Lance la lecture du stock Logistique sans l'attendre, via le partage d'appels de la vue.
 * Rien n'est lancé sans espace, sans id, si un id n'est ni la config synthétique ni une config
 * encore existante (`validConfigIds`, une config supprimée depuis la dernière visite rend la
 * mémoire fausse), ni sans partage d'appels ou fonction de lecture.
 * Le rejet éventuel est avalé ici : l'appel normal, lui, le verra et réessaiera (un échec n'est
 * jamais gardé par `recentReads`).
 *
 * @param {Object} p
 * @param {string} p.spaceId
 * @param {Iterable<string>} p.configIds  ids mémorisés (`recallLogisticConfigIds`)
 * @param {Iterable<string|number>} [p.validConfigIds]  ids des configs existantes de l'espace
 * @param {{run: Function}} p.recentReads  instance de `createRecentFlight` de la vue
 * @param {(args: {spaceId: string, configIds: string[]}) => Promise<any>} p.loadIndex  `loadLogisticRemainingIndex`
 * @returns {Promise<void>|null} promesse qui ne rejette jamais, ou null si rien n'a été lancé
 */
export function startEarlyLogisticRead({ spaceId, configIds, validConfigIds, recentReads, loadIndex } = {}) {
  try {
    if (!spaceId || !recentReads || typeof recentReads.run !== 'function') return null
    if (typeof loadIndex !== 'function') return null
    const ids = cleanIds(configIds)
    if (!ids.length) return null
    const valid = new Set(Array.from(validConfigIds || [], String))
    if (ids.some((id) => id !== SYNTHETIC_CONFIG_ID && !valid.has(id))) return null
    return Promise.resolve(recentReads.run(logisticReadKey(spaceId, ids), () => loadIndex({ spaceId, configIds: ids }))).then(
      () => {},
      () => {},
    )
  } catch (_) {
    return null
  }
}
