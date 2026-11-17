/**
 * « Une lecture récente est réutilisée ».
 *
 * Pour une clé donnée :
 *  - si une exécution est en vol, tout nouvel appel reçoit la MÊME promesse ;
 *  - si une exécution a réussi il y a moins de `ttlMs`, son résultat est rendu tel quel, sans
 *    relancer le travail ;
 *  - sinon la tâche est lancée.
 *
 * Différence avec `singleFlight.js` : le résultat terminé est gardé un court instant. C'est fait
 * pour les écrans qui relancent la même lecture réseau plusieurs fois de suite pendant leur
 * chargement (watchers qui se déclenchent l'un après l'autre) : en production, chaque relecture
 * coûte un aller-retour complet.
 *
 * Règles de sûreté :
 *  - un échec n'est jamais gardé : l'appel suivant relance la tâche ;
 *  - `fresh: true` ignore le résultat gardé ET l'exécution en vol, lance une lecture neuve, et
 *    c'est elle que les appels suivants réutilisent (à utiliser quand l'utilisateur déclenche
 *    une action qui exige des données à jour) ;
 *  - une exécution plus ancienne qui se termine après une plus récente n'écrase pas son résultat.
 *
 * La fabrique est générique : elle ne connaît ni l'API ni le store. Chaque appelant crée sa
 * propre instance (la portée du partage est celle de l'instance).
 *
 * @param {{ttlMs?: number, now?: () => number}} [options]
 * @returns {{
 *   run: <T>(key: string, task: () => Promise<T>|T, opts?: {fresh?: boolean}) => Promise<T>,
 *   clear: (key?: string) => void,
 *   size: () => number,
 * }}
 */
export function createRecentFlight({ ttlMs = 15000, now = () => Date.now() } = {}) {
  /** @type {Map<string, {promise: Promise<any>, seq: number}>} */
  const inFlight = new Map()
  /** @type {Map<string, {at: number, value: any, seq: number}>} */
  const finished = new Map()
  let counter = 0

  function run(key, task, { fresh = false } = {}) {
    const id = String(key)

    if (!fresh) {
      const kept = finished.get(id)
      if (kept) {
        if (now() - kept.at < ttlMs) return Promise.resolve(kept.value)
        finished.delete(id)
      }
      const flying = inFlight.get(id)
      if (flying) return flying.promise
    }

    counter += 1
    const seq = counter
    let started
    try {
      started = Promise.resolve(task())
    } catch (err) {
      started = Promise.reject(err)
    }

    const tracked = started.then(
      (value) => {
        const current = inFlight.get(id)
        if (current && current.seq === seq) inFlight.delete(id)
        // Un résultat plus ancien ne remplace jamais un résultat plus récent.
        const previous = finished.get(id)
        if (!previous || previous.seq < seq) finished.set(id, { at: now(), value, seq })
        return value
      },
      (err) => {
        const current = inFlight.get(id)
        if (current && current.seq === seq) inFlight.delete(id)
        throw err
      },
    )
    inFlight.set(id, { promise: tracked, seq })
    return tracked
  }

  function clear(key) {
    if (key === undefined) {
      inFlight.clear()
      finished.clear()
      return
    }
    const id = String(key)
    inFlight.delete(id)
    finished.delete(id)
  }

  return {
    run,
    clear,
    size: () => inFlight.size + finished.size,
  }
}
