/**
 * comparisonTrend : ligne de tendance du principal sur le graphe « CA événement par shop »
 * du drawer Comparaison (décision 5 du SPEC). La courbe est alignée PAR RANG : le 1er event
 * du principal face à la 1re barre du drawer, dans l'ordre du tri courant du graphe.
 */
import { formatDateShort } from '@/utils/dateFr'

/**
 * Convertit la série par event du principal (comparisonEventSeries.buildEventRevenueSeries,
 * ordre chronologique) en points de tendance { value, label, name, date }.
 * @param {Array<{ name: string, date: string, revenue: number }>} series
 */
export function trendFromEventSeries(series) {
  return (series || []).map((p) => {
    const date = formatDateShort(p.date) || p.date || ''
    const label = [p.name, date].filter(Boolean).join(' ')
    return { value: Number(p.revenue) || 0, label, name: p.name || '', date: p.date || '' }
  })
}

/**
 * Aligne la tendance sur les barres affichées.
 * @param {Array<{ value: number, label: string }>} trend  points du principal, ordre chronologique
 * @param {'date'|'revenue'} sortMode  tri courant du graphe (date = ordre reçu, revenue = CA décroissant)
 * @param {number} barCount  nombre de barres affichées
 * @returns {Array<{ value: number, label: string }|null>} un point (ou null) par barre, par rang
 */
export function alignTrendByRank(trend, sortMode, barCount) {
  const points = Array.isArray(trend) ? [...trend] : []
  if (sortMode === 'revenue') points.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
  const out = []
  for (let i = 0; i < barCount; i++) out.push(points[i] || null)
  return out
}
