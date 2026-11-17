/**
 * « Une seule exécution en vol par clé ».
 *
 * Tant qu'une exécution d'une clé n'est pas terminée, tout nouvel appel avec la même clé reçoit
 * la MÊME promesse au lieu de relancer le travail. La clé est libérée à la fin de l'exécution,
 * succès comme échec : on ne garde jamais un résultat terminé (pas un cache), seulement ce qui
 * est en cours. Un appel fait après la fin déclenche donc une nouvelle exécution.
 *
 * La fabrique est générique : elle ne connaît ni l'API ni le store. Chaque appelant crée sa
 * propre instance (la portée de la fusion est celle de l'instance).
 *
 * @returns {{
 *   run: <T>(key: string, task: () => Promise<T>|T, opts?: {force?: boolean}) => Promise<T>,
 *   has: (key: string) => boolean,
 *   size: () => number,
 * }}
 */
export function createSingleFlight() {
  /** @type {Map<string, Promise<any>>} */
  const inFlight = new Map()

  /**
   * @param {string} key
   * @param {() => Promise<any>|any} task lancée seulement si la clé n'est pas déjà en vol
   * @param {{force?: boolean}} [opts] force : ignore l'exécution en vol et en lance une neuve,
   *   que les appels suivants rejoindront à leur tour.
   */
  function run(key, task, { force = false } = {}) {
    const id = String(key)
    if (!force && inFlight.has(id)) return inFlight.get(id)

    let started
    try {
      started = Promise.resolve(task())
    } catch (err) {
      started = Promise.reject(err)
    }
    // La clé est libérée avant que les appelants reprennent la main (succès ou échec), et
    // seulement si elle désigne encore CETTE exécution (un `force` a pu la remplacer).
    const tracked = started.finally(() => {
      if (inFlight.get(id) === tracked) inFlight.delete(id)
    })
    inFlight.set(id, tracked)
    return tracked
  }

  return {
    run,
    has: (key) => inFlight.has(String(key)),
    size: () => inFlight.size,
  }
}
