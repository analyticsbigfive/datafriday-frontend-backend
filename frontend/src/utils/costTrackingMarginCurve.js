/**
 * Courbe de marge (axe de droite) : marge en % du prix hors taxe, en escalier, pour au plus 10 lignes.
 * Fonction pure : réutilise l'échelle X du modèle du graphique.
 */
import { linearScale, marginPercent, netPrice, niceTicks, stepPath } from '@/utils/costTrackingSeries'

export const MAX_MARGIN_LINES = 10

/**
 * @param {Array} seriesList lignes visibles (sorties de buildLineSeries + colorIndex)
 * @param {{ x: Function, margin: {t:number}, innerHeight: number, t1: number }} frame
 * @returns {{ ticks: Array<{value, y}>, paths: Array<{key, colorIndex, d}> }}
 */
export function buildMarginCurves(seriesList, { x, margin, innerHeight, t1 }) {
  const withMargin = (seriesList || []).map((s) => ({
    key: s.key,
    colorIndex: s.colorIndex,
    points: s.points
      .map((p) => ({ t: p.t, cost: marginPercent(p.cost, netPrice(p)) }))
      .filter((p) => p.cost !== null),
  }))
  let lo = Infinity
  let hi = -Infinity
  for (const s of withMargin) {
    for (const p of s.points) {
      lo = Math.min(lo, p.cost)
      hi = Math.max(hi, p.cost)
    }
  }
  if (!Number.isFinite(lo)) return { ticks: [], paths: [] }
  const values = niceTicks(lo - 2, hi + 2, 5)
  const y = linearScale(values[0], values[values.length - 1], margin.t + innerHeight, margin.t)
  return {
    ticks: values.map((value) => ({ value, y: y(value) })),
    paths: withMargin.map((s) => ({ key: s.key, colorIndex: s.colorIndex, d: stepPath(s.points, x, y, t1) })),
  }
}
