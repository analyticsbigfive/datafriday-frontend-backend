/**
 * useReportJ1Page2Data : charge les données de la page 2 du rapport J+1.
 *
 * Les slots sont regroupés par filtres figés. Pour chaque groupe, on instancie (en séquence)
 * un `useComparisonReport` sur l'event J+1 seul, on attend la fin de ses chargements, puis
 * `buildSlotData` produit les données de chaque slot. Rien n'est écrit dans le store du
 * principal ni dans la route : useComparisonReport ne lit que des sources et un cache local.
 *
 * Les composables s'appuient sur `useRoute()` / `useStore()` (inject) : on les exécute donc
 * dans `app.runWithContext` (l'app est capturée dans le setup de useReportJ1), à l'intérieur
 * d'un effectScope jetable arrêté dans un `finally`.
 */
import { ref, unref, watch, effectScope } from 'vue'
import { useComparisonReport } from '@/composables/useComparisonReport'
import { groupSlotsByFilters, buildGroupFilters } from '@/utils/reportJ1Page2Groups'
import { buildSlotData } from '@/utils/reportJ1Page2Build'

export const PAGE2_LOAD_TIMEOUT_MS = 60000

/**
 * Le rapport a fini de charger ? Statut hors idle/loading, dimensions article prêtes ou en
 * erreur, valorisation du stock résolue. Sans permission financière, dimensions et stock ne
 * se chargent jamais : on ne les attend pas.
 */
export function isReportSettled(report, { canView = true } = {}) {
  const status = unref(report?.status)
  if (status === 'idle' || status === 'loading' || status == null) return false
  if (!canView) return true
  const dims = unref(report?.dimensionsStatus)
  if (dims !== 'ready' && dims !== 'error') return false
  const stock = unref(report?.rendementCards)?.stockValue
  if (stock && stock.loading) return false
  return true
}

/**
 * Résout true dès que `getter()` est truthy, false si `timeoutMs` s'écoule avant.
 * @param {() => boolean} getter lu réactivement (refs / computed)
 */
export function waitUntil(getter, timeoutMs = PAGE2_LOAD_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let done = false
    let timer = null
    let stop = () => {}
    const finish = (value) => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      stop()
      resolve(value)
    }
    timer = setTimeout(() => finish(false), timeoutMs)
    stop = watch(getter, (v) => { if (v) finish(true) }, { immediate: true })
    if (done) stop()
  })
}

/** Sorties de useComparisonReport -> contexte de buildSlotData. */
export function toBuildContext(report, t) {
  return {
    metrics: report?.metrics || null,
    rendementRaw: unref(report?.rendementRaw) || null,
    chartRecords: unref(report?.chartRecords) || [],
    articleRecords: unref(report?.articleRecords) || [],
    itemRecords: unref(report?.itemLevelRecords) || [],
    events: unref(report?.events) || [],
    baskets: unref(report?.filteredBaskets) || [],
    dimensionsIndex: unref(report?.dimensionsIndex) || null,
    dimensionsStatus: unref(report?.dimensionsStatus) || 'idle',
    // Taux tx/min par PdV : calculé par useShopPerformance côté écran, absent ici (puce masquée).
    shopRates: [],
    t,
  }
}

const withStatus = (slots, status) => slots.map((slot) => ({ slot, status, data: null }))

async function loadGroup({ app, group, event, spaceId, canView, translate, timeoutMs }) {
  const scope = effectScope(true)
  try {
    const sid = ref(spaceId)
    const can = ref(!!canView)
    const report = app.runWithContext(() => scope.run(() => useComparisonReport({
      input: ref({ kind: 'event', eventIds: [event.id] }),
      mainFilters: ref(buildGroupFilters(group.filters, event.id)),
      spaceId: sid,
      canView: can,
      translate,
    })))
    const settled = await scope.run(() => waitUntil(() => isReportSettled(report, { canView: !!canView }), timeoutMs))
    if (!settled) return withStatus(group.slots, 'error')
    const status = unref(report.status)
    if (status === 'empty') return withStatus(group.slots, 'empty')
    if (status !== 'ready') return withStatus(group.slots, 'error')
    const ctx = toBuildContext(report, translate)
    return group.slots.map((slot) => {
      const { status: s, data } = buildSlotData(slot, ctx)
      return { slot, status: s, data }
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[useReportJ1Page2Data] groupe en échec', e)
    return withStatus(group.slots, 'error')
  } finally {
    scope.stop()
  }
}

/**
 * @param {Object} p
 * @param {import('vue').App} p.app          app Vue (contexte d'injection route / store)
 * @param {{ slots: Array }} p.layout        mise en page de la page 2
 * @param {object} p.event                   event J+1
 * @param {string} p.spaceId
 * @param {boolean} p.canView                permission stats.financial.view
 * @param {(key: string) => string} p.translate
 * @returns {Promise<Array<{ slot: object, status: 'ok'|'empty'|'error', data: object|null }>>}
 *   dans l'ordre des slots du layout
 */
export async function loadPage2({ app, layout, event, spaceId, canView, translate, timeoutMs = PAGE2_LOAD_TIMEOUT_MS }) {
  const slots = layout?.slots || []
  const groups = groupSlotsByFilters(slots)
  const byId = new Map()
  for (const group of groups) {
    const results = await loadGroup({ app, group, event, spaceId, canView, translate, timeoutMs })
    for (const r of results) byId.set(r.slot, r)
  }
  return slots.map((slot) => byId.get(slot))
}
