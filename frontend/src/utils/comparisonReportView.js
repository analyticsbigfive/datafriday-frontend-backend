/**
 * comparisonReportView : view-models purs du rapport de comparaison (drawer).
 * Aucune dépendance au DOM ni au store : les formateurs et `t` arrivent en paramètres.
 */

// Les 8 puces du haut, dans l'ordre et avec les couleurs de la bande du principal (headerKpis).
export const KPI_CHIP_DEFS = [
  { key: 'revenue', labelKey: 'anHeaderKpiRevenue', color: '#10B981', format: 'currency' },
  { key: 'avgRevenuePerEvent', labelKey: 'anHeaderKpiAvgPerEvent', color: '#F97316', format: 'currency' },
  { key: 'cost', labelKey: 'anHeaderKpiCost', color: '#ff3131', format: 'currencyDetailed' },
  { key: 'transactions', labelKey: 'anHeaderKpiTransactions', color: '#3B82F6', format: 'number' },
  { key: 'avgTransaction', labelKey: 'anHeaderKpiBasket', color: '#A855F7', format: 'currencyDetailed' },
  { key: 'attendees', labelKey: 'anHeaderKpiAttendees', color: '#0EA5E9', format: 'number' },
  { key: 'transferRate', labelKey: 'anHeaderKpiTransformation', color: '#14B8A6', format: 'percent' },
  { key: 'perCapita', labelKey: 'anHeaderKpiPerCap', color: '#EC4899', format: 'currencyDetailed' },
]

const NO_VALUE = '—'

/**
 * @param {object|null} chips  report.chips (nombres|null par clé)
 * @param {object|null} chipDeltas  deltas.chips (un Delta par clé) ou null
 * @param {{ t: Function, fmt: { currency, currencyDetailed, number, percent } }} ctx
 * @returns {Array<{ key, label, value, color, delta }>}
 */
export function buildKpiChips(chips, chipDeltas, { t, fmt }) {
  return KPI_CHIP_DEFS.map((def) => {
    const raw = chips ? chips[def.key] : null
    const value = raw == null || !Number.isFinite(raw) ? NO_VALUE : fmt[def.format](raw)
    return {
      key: def.key,
      label: t(def.labelKey),
      value,
      color: def.color,
      delta: chipDeltas ? chipDeltas[def.key] || null : null,
    }
  })
}

/**
 * Libellé court de la comparaison (bandeau rouge) selon le modèle appliqué.
 * @param {object|null} model  modèle appliqué (kind, eventIds, eventTypes...)
 * @param {Array<{ key: string, label: string }>} appliedFilters  filtres appliqués du moteur
 * @param {Function} t
 * @param {Array<{ id: string, name?: string }>} [events]  events du rapport (nom de l'event unique)
 */
export function comparisonSummaryLabel(model, appliedFilters, t, events = []) {
  if (!model) return ''
  if (model.kind === 'predict') return t('anCmpSummaryPredict')
  if (model.kind === 'event' && (model.eventIds || []).length === 1) {
    // Un seul event : son nom plutôt que « 1 événement(s) » (repli sur le compte si introuvable).
    const ev = (events || []).find((e) => e.id === model.eventIds[0])
    const name = ev?.name || ev?.eventName
    if (name) return name
  }
  if (model.kind === 'event') return t('anCmpSummaryEvents').replace('{n}', String((model.eventIds || []).length))
  if (model.kind === 'category') {
    const parts = [
      ...(model.eventTypes || []), ...(model.categories || []), ...(model.subcategories || []),
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : t('anCmpSummaryAllTypes')
  }
  const range = (appliedFilters || []).find((f) => f.key === 'timeRange')
  return range?.label || t('anCmpSummaryPeriod')
}

/** Texte des noms d'events exclus : les 3 premiers puis une ellipse (pas d'em-dash). */
export function excludedNamesText(excluded, max = 3) {
  const list = excluded || []
  const names = list.slice(0, max).map((e) => e.name || e.id).filter(Boolean)
  return names.join(', ') + (list.length > max ? '…' : '')
}
