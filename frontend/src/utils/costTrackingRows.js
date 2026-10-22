/**
 * Cost tracking : lignes du tableau, classements, derniers changements et infobulle.
 * Fonctions pures (sans Vue ni DOM), testables en Jest.
 */
import { buildLineSeries, computeVariation, marginPercent, valueAt } from '@/utils/costTrackingSeries'

/**
 * Une ligne de tableau par ligne de courbe ayant des données :
 * coût début / actuel, variation, prix, marge début / actuelle, nombre de versions.
 */
export function buildRows(lines, t1) {
  const rows = []
  for (const line of lines || []) {
    const s = buildLineSeries(line, t1)
    if (!s.first || !s.last) continue
    const marginStart = marginPercent(s.first.cost, s.first.price)
    const marginEnd = marginPercent(s.last.cost, s.last.price)
    rows.push({
      key: line.key,
      id: line.id,
      kind: line.kind,
      name: line.name,
      typeName: line.typeName || null,
      categoryName: line.categoryName || null,
      lineKind: line.lineKind || null,
      articleCount: line.articleCount ?? 1,
      revenueHt: typeof line.revenueHt === 'number' ? line.revenueHt : null,
      startCost: s.first.cost,
      currentCost: s.last.cost,
      currentPrice: s.last.price,
      variation: computeVariation(s.first.cost, s.last.cost),
      marginStart,
      marginEnd,
      marginDelta: marginStart !== null && marginEnd !== null ? marginEnd - marginStart : null,
      versions: s.points.filter((p) => !p.carried).length,
    })
  }
  return rows
}

/** Plus fortes hausses ou baisses (pct non nul), triées par amplitude décroissante. */
export function rankVariations(rows, direction, limit = 5) {
  return (rows || [])
    .filter((r) => r.variation && r.variation.direction === direction && r.variation.pct !== null)
    .sort((a, b) => Math.abs(b.variation.pct) - Math.abs(a.variation.pct))
    .slice(0, limit)
}

/**
 * Derniers changements : points non reportés (vraies versions) tous articles confondus,
 * du plus récent au plus ancien. `pct` = variation du coût par rapport au point précédent.
 */
export function recentChanges(lines, limit = 6) {
  const out = []
  for (const line of lines || []) {
    const pts = buildLineSeries(line, Infinity).points
    pts.forEach((p, i) => {
      if (p.carried || i === 0) return
      const prev = pts[i - 1]
      const v = computeVariation(prev.cost, p.cost)
      out.push({
        key: `${line.key}@${p.t}`,
        lineKey: line.key,
        id: line.id,
        kind: line.kind,
        name: line.name,
        t: p.t,
        reason: p.reason,
        from: prev.cost,
        to: p.cost,
        pct: v ? v.pct : null,
        direction: v ? v.direction : 'flat',
      })
    })
  }
  return out.sort((a, b) => b.t - a.t).slice(0, limit)
}

/**
 * Lignes de l'infobulle à l'instant `when` : valeur en vigueur de chaque série visible,
 * triées par coût décroissant. `since` = début de la version en vigueur.
 */
export function tooltipRows(seriesList, when) {
  return (seriesList || [])
    .map((s) => {
      const p = valueAt(s.points, when)
      return p ? { key: s.key, name: s.name, colorIndex: s.colorIndex, cost: p.cost, since: p.t } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.cost - a.cost)
}

/** Événement le plus proche de la position x (px), à moins de `radius` px, sinon null. */
export function nearestEvent(events, px, radius = 10) {
  let best = null
  let bestD = Infinity
  for (const e of events || []) {
    const d = Math.abs(e.x - px)
    if (d < radius && d < bestD) {
      best = e
      bestD = d
    }
  }
  return best
}
