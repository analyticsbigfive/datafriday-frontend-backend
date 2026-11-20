/**
 * Modèle des modifications « what-if » de l'outil Forecast (Analyse).
 *
 * Module PUR : aucune dépendance Vue / store / I/O. Il décrit les 6 types de
 * modification, leur validation, leur clé de cible (une seule modification active par
 * cible, la dernière ajoutée remplace) et les leviers globaux (volume, panier).
 *
 * Forme d'une modification : { id, type, target, value, mode }
 *  - itemPrice       target = menuItemId, value = nouveau prix TTC en euros (>= 0)
 *  - categoryPct     target = nom de catégorie, value = % de variation du prix
 *  - typePct         target = nom de type, value = % de variation du prix
 *  - transformation  value = % sur le taux de transformation (volume)
 *  - percap          mode = 'transformation' (volume) ou 'basket' (panier), value = %
 *  - basket          value = % sur le panier moyen (CA seul)
 */

export const FORECAST_MODIFICATION_TYPES = Object.freeze({
  ITEM_PRICE: 'itemPrice',
  CATEGORY_PCT: 'categoryPct',
  TYPE_PCT: 'typePct',
  TRANSFORMATION: 'transformation',
  PERCAP: 'percap',
  BASKET: 'basket',
})

export const PERCAP_MODES = Object.freeze({
  TRANSFORMATION: 'transformation',
  BASKET: 'basket',
})

export const PCT_MIN = -100
export const PCT_MAX = 100

const T = FORECAST_MODIFICATION_TYPES
const TYPE_VALUES = Object.values(T)
const MODE_VALUES = Object.values(PERCAP_MODES)

/** Types dont l'effet porte sur le prix d'un article (et non sur les volumes). */
export const PRICE_MODIFICATION_TYPES = Object.freeze([T.ITEM_PRICE, T.CATEGORY_PCT, T.TYPE_PCT])

/** Types qui ont une cible nommée (identifiant d'article, catégorie ou type). */
const TARGETED_TYPES = PRICE_MODIFICATION_TYPES

let idCounter = 0

function nextId() {
  idCounter += 1
  const rand = Math.random().toString(36).slice(2, 8)
  return `fm_${Date.now().toString(36)}_${idCounter}_${rand}`
}

function toFiniteNumber(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Borne une valeur de pourcentage entre PCT_MIN et PCT_MAX (non numérique : 0). */
export function clampPercent(v) {
  const n = toFiniteNumber(v)
  if (n == null) return 0
  return Math.min(PCT_MAX, Math.max(PCT_MIN, n))
}

/** Crée une modification avec un identifiant unique. Ne valide pas (cf. validateModification). */
export function createModification(type, fields = {}) {
  const hasTarget = TARGETED_TYPES.includes(type)
  return {
    id: nextId(),
    type,
    target: hasTarget && fields.target != null ? String(fields.target) : null,
    value: toFiniteNumber(fields.value) ?? fields.value ?? null,
    mode: type === T.PERCAP ? fields.mode ?? null : null,
  }
}

/**
 * Valide une modification. `reason` est un code stable (traduisible côté UI) :
 * 'invalid' | 'invalid-type' | 'missing-target' | 'invalid-mode' | 'invalid-value' | 'out-of-range'.
 *
 * @returns {{ valid: boolean, reason: string|null }}
 */
export function validateModification(m) {
  if (!m || typeof m !== 'object') return { valid: false, reason: 'invalid' }
  if (!TYPE_VALUES.includes(m.type)) return { valid: false, reason: 'invalid-type' }
  if (TARGETED_TYPES.includes(m.type) && !String(m.target ?? '').trim()) {
    return { valid: false, reason: 'missing-target' }
  }
  if (m.type === T.PERCAP && !MODE_VALUES.includes(m.mode)) {
    return { valid: false, reason: 'invalid-mode' }
  }
  const value = toFiniteNumber(m.value)
  if (value == null) return { valid: false, reason: 'invalid-value' }
  if (m.type === T.ITEM_PRICE) {
    return value >= 0 ? { valid: true, reason: null } : { valid: false, reason: 'out-of-range' }
  }
  if (value < PCT_MIN || value > PCT_MAX) return { valid: false, reason: 'out-of-range' }
  return { valid: true, reason: null }
}

/** Clé de cible : deux modifications de même clé ne coexistent pas (null si type inconnu). */
export function modificationKey(m) {
  if (!m || typeof m !== 'object') return null
  switch (m.type) {
    case T.ITEM_PRICE:
    case T.CATEGORY_PCT:
    case T.TYPE_PCT:
      return `${m.type}:${m.target}`
    case T.PERCAP:
      return `percap:${m.mode}`
    case T.TRANSFORMATION:
    case T.BASKET:
      return m.type
    default:
      return null
  }
}

/** Ajoute en FIN de liste, après avoir retiré toute modification de même clé. Nouvelle liste. */
export function addModification(list, m) {
  const key = modificationKey(m)
  const kept = (Array.isArray(list) ? list : []).filter(
    (x) => key == null || modificationKey(x) !== key,
  )
  return [...kept, m]
}

/** Retire la modification d'identifiant donné. Nouvelle liste. */
export function removeModification(list, id) {
  return (Array.isArray(list) ? list : []).filter((m) => m?.id !== id)
}

/**
 * Modifications réellement actives : valides, une seule par clé (la dernière de la liste
 * l'emporte), dans l'ordre de la liste. Rend le moteur robuste à une liste construite
 * sans passer par addModification.
 */
export function effectiveModifications(list) {
  if (!Array.isArray(list)) return []
  const valid = list.filter((m) => validateModification(m).valid)
  const lastIndexByKey = new Map()
  valid.forEach((m, i) => lastIndexByKey.set(modificationKey(m), i))
  return valid.filter((m, i) => lastIndexByKey.get(modificationKey(m)) === i)
}

/** Vrai si au moins une modification de la liste est valide. */
export function canApplyModifications(list) {
  return Array.isArray(list) && list.some((m) => validateModification(m).valid)
}

function factorOf(active, predicate) {
  const m = active.find(predicate)
  return m ? 1 + Number(m.value) / 100 : 1
}

/**
 * Leviers globaux. volume = (1 + transformation) x (1 + percap en mode transformation),
 * basket = (1 + basket) x (1 + percap en mode panier). Les types différents se multiplient.
 *
 * @returns {{ volume: number, basket: number }}
 */
export function leverFactors(list) {
  const active = effectiveModifications(list)
  const percapOf = (mode) => (m) => m.type === T.PERCAP && m.mode === mode
  return {
    volume:
      factorOf(active, (m) => m.type === T.TRANSFORMATION) *
      factorOf(active, percapOf(PERCAP_MODES.TRANSFORMATION)),
    basket:
      factorOf(active, (m) => m.type === T.BASKET) *
      factorOf(active, percapOf(PERCAP_MODES.BASKET)),
  }
}
