// Exécute `run` au plus une fois toutes les `minIntervalMs`, quelle que soit la fréquence des
// demandes : les demandes reçues pendant l'attente ou pendant une exécution sont fusionnées en
// UNE exécution suivante (jamais perdue). Sert à l'écran Live, où chaque agrégation envoie un
// signal SSE (souvent plusieurs par minute pendant un match).
export function createThrottledRunner(run, minIntervalMs) {
  let lastRunAt = -Infinity
  let timer = null
  let running = false
  let pending = false

  async function exec() {
    timer = null
    running = true
    lastRunAt = Date.now()
    try {
      await run()
    } catch {
      // l'appelant gère ses erreurs ; le limiteur continue de fonctionner
    } finally {
      running = false
      if (pending) {
        pending = false
        request()
      }
    }
  }

  function request() {
    if (running) { pending = true; return }
    if (timer) return
    timer = setTimeout(exec, Math.max(0, lastRunAt + minIntervalMs - Date.now()))
  }

  function cancel() {
    if (timer) clearTimeout(timer)
    timer = null
    pending = false
  }

  return { request, cancel }
}
