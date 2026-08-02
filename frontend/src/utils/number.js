/**
 * Parsing et arrondi des nombres saisis/affichés.
 *
 * Convention : les valeurs circulent en `number` JS (point décimal) — la
 * virgule n'existe qu'à l'affichage (locale fr) et dans les saisies clavier.
 * L'API backend n'accepte que le point (JSON) : toute conversion se fait ici.
 */

/**
 * Parse une saisie utilisateur en nombre, quel que soit le séparateur décimal
 * (virgule fr, point en) en tolérant les séparateurs de milliers — espace,
 * espaces insécables U+00A0/U+202F produits par Intl — et les symboles € $ %.
 *
 * "1 234,56" → 1234.56 ; "1,234.56" → 1234.56 ; "2,5" → 2.5 ; "2.5" → 2.5
 * Retourne null si la saisie n'est pas un nombre.
 */
export function parseLocaleNumber(raw) {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let s = String(raw)
    .replace(/[\s  ]/g, '')
    .replace(/[€$%]/g, '')
  if (s === '' || s === '-' || s === '+') return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    // Les deux séparateurs présents : le dernier est le décimal, l'autre les milliers.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    // Plusieurs virgules ("1,234,567") = milliers ; une seule = décimale.
    s = s.indexOf(',') !== lastComma ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (lastDot !== -1 && s.indexOf('.') !== lastDot) {
    // Plusieurs points ("1.234.567") = milliers.
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Arrondi à `decimals` décimales, compensé contre l'erreur flottante IEEE 754. */
export function roundTo(value, decimals = 2) {
  const f = 10 ** decimals
  return Math.round((Number(value) + Number.EPSILON) * f) / f
}

/**
 * Incrémente/décrémente `value` de `delta` en préservant les décimales déjà
 * saisies : stepBy(2.55, 1, 2) → 3.55 ; stepBy(2.55, -0.01, 2) → 2.54.
 */
export function stepBy(value, delta, decimals = 2) {
  return roundTo((Number(value) || 0) + delta, decimals)
}

/** Clamp dans [min, max] ; min/max à null = borne absente. */
export function clampNumber(value, min = null, max = null) {
  let v = Number(value)
  if (min != null && v < min) v = min
  if (max != null && v > max) v = max
  return v
}
