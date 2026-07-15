/**
 * Exécute `task(item)` sur chaque élément avec au plus `limit` tâches simultanées.
 * File consommée dans l'ordre fourni ; s'arrête de consommer si `signal` est aborté
 * (les tâches déjà lancées se terminent, la file restante est abandonnée).
 * Ne throw jamais pour une tâche : `task` doit gérer ses propres erreurs.
 *
 * @param {Array}    items
 * @param {number}   limit    concurrence max (>= 1)
 * @param {Function} task     async (item) => void
 * @param {AbortSignal} [signal]
 */
export async function runWithConcurrency(items, limit, task, signal = null) {
  const queue = [...(items || [])]
  const width = Math.max(1, Math.min(limit || 1, queue.length))
  if (!queue.length) return
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (queue.length) {
        if (signal?.aborted) return
        const item = queue.shift()
        await task(item)
      }
    }),
  )
}
