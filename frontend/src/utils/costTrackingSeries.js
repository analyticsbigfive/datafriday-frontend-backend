/**
 * costTrackingSeries : calculs purs de la page Cost tracking (aucun accès DOM, store ni API).
 *
 *  - construction des points en escalier (chaque valeur tient jusqu'au point suivant, le
 *    dernier est prolongé jusqu'à `to`)
 *  - échelles X / Y, ticks « ronds », ticks de mois
 *  - variation entre deux coûts, statistiques d'une ligne sur la période
 *  - visibilité des étiquettes d'events (supprimées si l'espacement est inférieur à 17 px)
 */

export const DAY_MS = 86400000
/** Espacement minimal (px) entre deux étiquettes d'events en diagonale. */
export const EVENT_LABEL_MIN_SPACING = 17
/** Seuil (en %) sous lequel une variation est considérée comme nulle. */
export const FLAT_THRESHOLD_PCT = 0.05

/** `YYYY-MM-DD` -> instant UTC (ms) du début du jour. NaN si invalide. */
export function dayToMs(day) {
  if (typeof day !== 'string') return NaN
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!m) return NaN
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Instant UTC (ms) -> `YYYY-MM-DD` (UTC). */
export function msToDay(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Bornes de l'axe du temps. `from` et `to` sont inclus côté backend : la borne droite est la
 * fin du jour `to` (début du jour suivant).
 * @returns {[number, number]} [t0, t1] en ms
 */
export function periodBounds(from, to) {
  const t0 = dayToMs(from)
  const t1 = dayToMs(to) + DAY_MS
  return [t0, t1]
}

/** Dates `from` / `to` (YYYY-MM-DD) pour un nombre de jours se terminant à `today` inclus. */
export function rangeForDays(days, today = new Date()) {
  const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const n = Math.max(1, Math.min(366, Math.floor(days)))
  return { from: msToDay(end - (n - 1) * DAY_MS), to: msToDay(end) }
}

/** Nombre de jours d'une période [from, to] bornes incluses. */
export function daysInRange(from, to) {
  const a = dayToMs(from)
  const b = dayToMs(to)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / DAY_MS) + 1
}

/**
 * Points d'une ligne -> points en escalier triés, prêts à tracer.
 * Ignore les points sans coût. Chaque point : { t, cost, price, articleCount, carried,
 * snapshotId, reason, totalCost, numberOfPieces }.
 */
export function buildStepPoints(line) {
  const raw = Array.isArray(line?.points) ? line.points : []
  return raw
    .map((p) => ({
      t: Date.parse(p.at),
      cost: typeof p.costPerPiece === 'number' ? p.costPerPiece : null,
      price: typeof p.price === 'number' ? p.price : null,
      articleCount: p.articleCount ?? 1,
      carried: !!p.carried,
      snapshotId: p.snapshotId ?? null,
      reason: p.reason ?? null,
      totalCost: p.totalCost ?? null,
      numberOfPieces: p.numberOfPieces ?? null,
    }))
    .filter((p) => !Number.isNaN(p.t) && p.cost !== null)
    .sort((a, b) => a.t - b.t)
}

/**
 * Série complète d'une ligne : points + point terminal prolongeant le dernier jusqu'à t1.
 * Les points au-delà de t1 sont écartés. `end` est null s'il n'y a aucun point.
 * @returns {{ key, name, points, end: {t, cost, price}|null, first, last }}
 */
export function buildLineSeries(line, t1) {
  const points = buildStepPoints(line).filter((p) => p.t <= t1)
  const last = points.length ? points[points.length - 1] : null
  return {
    key: line.key,
    name: line.name,
    kind: line.kind,
    points,
    first: points[0] || null,
    last,
    end: last ? { t: t1, cost: last.cost, price: last.price } : null,
  }
}

/** Valeur en vigueur à l'instant t (escalier) : dernier point dont t_point <= t, sinon null. */
export function valueAt(points, t) {
  let found = null
  for (const p of points) {
    if (p.t <= t) found = p
    else break
  }
  return found
}

/**
 * Variation entre deux valeurs.
 * @returns {{ abs: number, pct: number|null, direction: 'up'|'down'|'flat' }|null}
 *   null si une valeur est absente ; pct null si la base vaut 0.
 */
export function computeVariation(from, to) {
  if (typeof from !== 'number' || typeof to !== 'number') return null
  const abs = to - from
  const pct = from === 0 ? null : (abs / from) * 100
  let direction = 'flat'
  if (pct === null) direction = abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat'
  else if (Math.abs(pct) >= FLAT_THRESHOLD_PCT) direction = pct > 0 ? 'up' : 'down'
  return { abs, pct, direction }
}

/**
 * Marge en % du prix. Si `vatRate` est fourni (en %), le prix est ramené hors taxe.
 * @returns {number|null}
 */
export function marginPercent(cost, price, vatRate = 0) {
  if (typeof cost !== 'number' || typeof price !== 'number') return null
  const net = price / (1 + (vatRate || 0) / 100)
  if (!(net > 0)) return null
  return ((net - cost) / net) * 100
}

/**
 * Statistiques d'une ligne sur la période : coût de début, coût actuel, variation,
 * nombre de versions apparues dans la période (points non reportés).
 */
export function summarizeLine(line, t1) {
  const s = buildLineSeries(line, t1)
  return {
    key: s.key,
    name: s.name,
    startCost: s.first ? s.first.cost : null,
    currentCost: s.last ? s.last.cost : null,
    currentPrice: s.last ? s.last.price : null,
    variation: computeVariation(s.first?.cost, s.last?.cost),
    versions: s.points.filter((p) => !p.carried).length,
    hasData: s.points.length > 0,
  }
}

/** Agrégats de la page : hausses, baisses, variation moyenne, nombre de versions. */
export function summarizeLines(lines, t1) {
  const rows = (lines || []).map((l) => summarizeLine(l, t1)).filter((r) => r.hasData)
  const withVar = rows.filter((r) => r.variation)
  const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null)
  return {
    rows,
    count: rows.length,
    versions: rows.reduce((s, r) => s + r.versions, 0),
    averageCost: mean(rows.map((r) => r.currentCost)),
    averageVariationPct: mean(withVar.filter((r) => r.variation.pct !== null).map((r) => r.variation.pct)),
    increases: withVar.filter((r) => r.variation.direction === 'up').length,
    decreases: withVar.filter((r) => r.variation.direction === 'down').length,
  }
}

const NICE_MANTISSAS = [1, 2, 2.5, 5, 10]

/**
 * Ticks « ronds » couvrant [min, max], environ `count` intervalles.
 * Pas = 1, 2, 2.5, 5 x 10^n. Les bornes sont arrondies vers l'extérieur.
 */
export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  let lo = Math.min(min, max)
  let hi = Math.max(min, max)
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 0.1
    lo -= pad
    hi += pad
  }
  const raw = (hi - lo) / Math.max(1, count)
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = (NICE_MANTISSAS.find((m) => m * pow >= raw - 1e-12) || 10) * pow
  const start = Math.floor(lo / step + 1e-9) * step
  const end = Math.ceil(hi / step - 1e-9) * step
  const decimals = Math.max(0, 2 - Math.floor(Math.log10(step)))
  const out = []
  for (let v = start; v <= end + step / 2; v += step) {
    out.push(Number(v.toFixed(Math.min(10, decimals + 2))))
  }
  return out
}

/** Échelle linéaire domaine -> image. Domaine nul : renvoie le milieu de l'image. */
export function linearScale(d0, d1, r0, r1) {
  const span = d1 - d0
  return (v) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0))
}

/** Tick de mois (1er du mois UTC) dans [t0, t1], éclairci pour tenir dans `maxCount`. */
export function monthTicks(t0, t1, maxCount = 12) {
  const start = new Date(t0)
  let y = start.getUTCFullYear()
  let m = start.getUTCMonth()
  if (Date.UTC(y, m, 1) < t0) m += 1
  const all = []
  for (;;) {
    const t = Date.UTC(y, m, 1)
    if (t > t1) break
    all.push(t)
    m += 1
  }
  const skip = Math.max(1, Math.ceil(all.length / Math.max(1, maxCount)))
  return all.filter((_, i) => i % skip === 0)
}

/**
 * Étiquettes d'events : une étiquette est affichée si elle est à au moins `minSpacing` px
 * de la dernière étiquette affichée (les events sont supposés triés par x croissant).
 * @param {number[]} xs positions en px
 * @returns {boolean[]} true = étiquette visible (le losange reste toujours tracé)
 */
export function eventLabelVisibility(xs, minSpacing = EVENT_LABEL_MIN_SPACING) {
  let lastX = -Infinity
  return (xs || []).map((x) => {
    if (x - lastX >= minSpacing) {
      lastX = x
      return true
    }
    return false
  })
}

/**
 * Events dans l'axe : position x et visibilité de l'étiquette.
 * @param {Array<{id, name, referenceAt}>} events
 * @returns {Array<{ id, name, t, x, labelVisible }>}
 */
export function layoutEvents(events, xScale, t0, t1, minSpacing = EVENT_LABEL_MIN_SPACING) {
  const inRange = (events || [])
    .map((e) => ({ ...e, t: Date.parse(e.referenceAt) }))
    .filter((e) => !Number.isNaN(e.t) && e.t >= t0 && e.t <= t1)
    .sort((a, b) => a.t - b.t)
  const xs = inRange.map((e) => xScale(e.t))
  const vis = eventLabelVisibility(xs, minSpacing)
  return inRange.map((e, i) => ({ id: e.id, name: e.name, t: e.t, x: xs[i], labelVisible: vis[i] }))
}

/** Chemin SVG en escalier : horizontal jusqu'au prochain t, puis vertical. Prolongé jusqu'à tEnd. */
export function stepPath(points, xScale, yScale, tEnd) {
  if (!points.length) return ''
  let d = ''
  points.forEach((p, i) => {
    d += i === 0 ? `M${xScale(p.t)},${yScale(p.cost)}` : `H${xScale(p.t)}V${yScale(p.cost)}`
  })
  if (tEnd != null) d += `H${xScale(tEnd)}`
  return d
}

/**
 * Modèle complet du graphique : échelles, ticks et chemins.
 * @param {Array} seriesList sorties de buildLineSeries (lignes visibles)
 * @param {{ t0, t1, width, height, margin?: {l,r,t,b}, tickCount?: number }} o
 */
export function buildChartModel(seriesList, { t0, t1, width, height, margin, tickCount = 5 }) {
  const M = { l: 56, r: 16, t: 14, b: 32, ...(margin || {}) }
  const iw = Math.max(1, width - M.l - M.r)
  const ih = Math.max(1, height - M.t - M.b)
  let lo = Infinity
  let hi = -Infinity
  for (const s of seriesList) {
    for (const p of s.points) {
      lo = Math.min(lo, p.cost)
      hi = Math.max(hi, p.cost)
    }
  }
  const hasData = Number.isFinite(lo)
  if (!hasData) {
    lo = 0
    hi = 1
  }
  const pad = (hi - lo) * 0.12 || hi * 0.1 || 0.1
  const yTicks = niceTicks(Math.max(0, lo - pad), hi + pad, tickCount)
  const y0 = yTicks[0]
  const y1 = yTicks[yTicks.length - 1]
  const x = linearScale(t0, t1, M.l, M.l + iw)
  const y = linearScale(y0, y1, M.t + ih, M.t)
  return {
    hasData,
    margin: M,
    innerWidth: iw,
    innerHeight: ih,
    x,
    y,
    yTicks: yTicks.map((v) => ({ value: v, y: y(v) })),
    xTicks: monthTicks(t0, t1, Math.max(1, Math.floor(iw / 70))).map((t) => ({ t, x: x(t) })),
    paths: seriesList.map((s) => ({
      key: s.key,
      d: stepPath(s.points, x, y, t1),
      // Points intermédiaires (changements de valeur), hors point reporté et dernier.
      dots: s.points.slice(1, -1).map((p) => ({ x: x(p.t), y: y(p.cost), point: p })),
      endDot: s.end ? { x: x(t1), y: y(s.end.cost) } : null,
    })),
  }
}
