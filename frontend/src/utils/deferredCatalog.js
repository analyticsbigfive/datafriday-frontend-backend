/**
 * Coordination « catalogue en retard » d'Event Predict.
 *
 * Le catalogue complet du tenant (`GET /menu-items`, plusieurs pages) est lent. Il ne gate plus
 * le chargement de la page : l'état est appliqué une première fois SANS lui (repli sur le
 * store), puis une seconde fois à son arrivée. Ce module ne contient que la coordination
 * (promesse, jeton de génération, drapeau « en attente »), pas la règle d'application, que
 * l'appelant fournit (cf. utils/eventPredictCatalogState.js).
 *
 * Règles :
 *  - la seconde application n'a lieu qu'APRÈS l'application initiale, jamais avant ;
 *  - elle est ignorée si un `start()` plus récent a eu lieu (loadAll relancé) ou si `dispose()`
 *    a été appelé (composant détruit) : jeton de génération ;
 *  - si le catalogue est déjà arrivé à l'application initiale, il est appliqué tout de suite,
 *    en une seule fois, et rien n'est différé ;
 *  - `whenSettled()` résout quand la dernière application différée est faite (ou ignorée),
 *    pour les consommateurs qui prennent un instantané unique (timeline d'un event passé) ;
 *  - rien ne rejette : la source en échec vaut catalogue vide.
 *
 * @returns {{
 *   start: (source: Promise<any[]>|any[]) => {
 *     applyInitial: (
 *       apply: (items: any[], ctx: {late: boolean}) => void,
 *       opts?: {onPending?: (pending: boolean) => void},
 *     ) => void,
 *     abandon: () => void,
 *     settled: Promise<void>,
 *   },
 *   whenSettled: () => Promise<void>,
 *   dispose: () => void,
 * }}
 */
export function createDeferredCatalog() {
  let generation = 0
  let disposed = false
  let latest = null

  function start(source) {
    const gen = ++generation
    const isCurrent = () => !disposed && gen === generation

    const state = { arrived: false, items: [], lateApply: null, onPending: null }
    let releaseInitial
    const initialDone = new Promise((resolve) => {
      releaseInitial = resolve
    })

    const arrival = Promise.resolve(source).then(
      (items) => {
        state.arrived = true
        state.items = Array.isArray(items) ? items : []
        return state.items
      },
      () => {
        state.arrived = true
        state.items = []
        return state.items
      },
    )

    // Résolu quand le catalogue est arrivé ET que l'application initiale est passée : c'est
    // ce qui garantit l'ordre « initiale puis tardive ».
    const settled = Promise.all([arrival, initialDone])
      .then(([items]) => {
        try {
          if (state.lateApply && isCurrent()) state.lateApply(items, { late: true })
        } finally {
          if (state.onPending && isCurrent()) state.onPending(false)
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[deferredCatalog] application tardive du catalogue impossible:', err?.message)
      })

    const handle = {
      applyInitial(apply, { onPending } = {}) {
        try {
          if (state.arrived) {
            apply(state.items, { late: false })
            if (isCurrent() && onPending) onPending(false)
          } else {
            apply([], { late: false })
            state.lateApply = apply
            state.onPending = onPending || null
            if (isCurrent() && onPending) onPending(true)
          }
        } finally {
          releaseInitial()
        }
      },
      // Pas d'application initiale (chargement interrompu) : libère les consommateurs de
      // `settled` sans rien appliquer. Sans effet si l'application initiale a eu lieu.
      abandon() {
        releaseInitial()
      },
      settled,
    }
    latest = handle
    return handle
  }

  return {
    start,
    whenSettled: () => (latest ? latest.settled : Promise.resolve()),
    dispose() {
      disposed = true
    },
  }
}
