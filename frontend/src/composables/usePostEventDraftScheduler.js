// src/composables/usePostEventDraftScheduler.js
//
// Régénération de LA feuille post-event en brouillon (demande Bertrand 2026-09-29,
// « même système que le pre-event ») : déclenchée quand un point de vente devient
// complet (staff ou manager PIN, vu par le rafraîchissement de fond). Plusieurs PDV
// peuvent se compléter en rafale : on attend un court délai et on n'exécute jamais
// deux régénérations en parallèle (la dernière demande pendant un calcul est rejouée
// une fois à la fin). Aucune logique métier ici, seulement le rythme.

const DEFAULT_DELAY_MS = 3000

/**
 * @param {() => Promise<unknown>} run  régénération (construit les lignes et les envoie)
 * @param {{ delayMs?: number }} [options]
 */
export function usePostEventDraftScheduler(run, options = {}) {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS
  let timer = null
  let running = false
  let pending = false

  async function execute() {
    if (running) {
      pending = true
      return
    }
    running = true
    try {
      await run()
    } catch (e) {
      // Brouillon best-effort : la feuille finale (« Générer la réconciliation ») reste
      // la référence, un échec ici ne doit jamais interrompre le comptage.
      console.warn('[PostEventDraft] régénération du brouillon KO :', e?.message)
    } finally {
      running = false
      if (pending) {
        pending = false
        schedule()
      }
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      execute()
    }, delayMs)
  }

  function cancel() {
    if (timer) clearTimeout(timer)
    timer = null
    pending = false
  }

  return { schedule, cancel }
}

/**
 * PDV devenus complets entre deux états (ids triés joints par ','). `previous` null =
 * premier chargement de l'écran : rien n'est « nouveau », aucune régénération.
 * @returns {string[]}
 */
export function newlyCompletedElements(previous, current) {
  if (previous == null || !current) return []
  const before = new Set(previous ? previous.split(',') : [])
  return current.split(',').filter((id) => id && !before.has(id))
}
