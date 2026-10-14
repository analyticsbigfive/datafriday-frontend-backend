/**
 * analyseDeltas : écarts génériques pour l'interface de comparaison
 * (valeur, ton, texte). Règles de la maquette (pill / dPct / dPts).
 */

/** Seuil (valeur absolue) sous lequel un écart est neutre. */
export const NEUTRAL_THRESHOLD = 0.5

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** Écart en % de value par rapport à ref ; null si l'un manque ou si ref est nulle. */
export function pctDelta(value, ref) {
  if (!isNum(value) || !isNum(ref) || !ref) return null
  return ((value - ref) / ref) * 100
}

/** Écart en points (value - ref), pour les taux ; null si l'un manque. */
export function ptsDelta(value, ref) {
  if (!isNum(value) || !isNum(ref)) return null
  return value - ref
}

/**
 * Ton d'un écart : 'good' | 'bad' | 'neutral'.
 * Neutre si l'écart est absent ou sous 0,5 en valeur absolue. Avec invert
 * (coûts), une hausse est 'bad'.
 */
export function deltaTone(delta, { invert = false } = {}) {
  if (!isNum(delta) || Math.abs(delta) < NEUTRAL_THRESHOLD) return 'neutral'
  const good = invert ? delta < 0 : delta > 0
  return good ? 'good' : 'bad'
}

/**
 * Texte français d'un écart : « ▲ 4,2 % », « ▼ 1,0 pts », la valeur « sans donnée » si absent.
 * @param {number|null} delta
 * @param {string} [unit]  '%' (défaut) ou 'pts'
 */
export function formatDelta(delta, unit = '%') {
  if (!isNum(delta)) return '—'
  const arrow = delta > 0 ? '▲' : '▼'
  const text = Math.abs(delta).toFixed(1).replace('.', ',')
  return `${arrow} ${text} ${unit}`
}
