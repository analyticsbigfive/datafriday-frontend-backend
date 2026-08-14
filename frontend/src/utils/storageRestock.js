/**
 * Logique pure de l'onglet « Espaces de stockage » du réarmement
 * (SpaceRestockView) : application des pourcentages d'ajustement et détection
 * des alertes de seuils min/max. Extrait en module pur (pattern
 * stockPlanning.js / restockPlanSnapshot.js) pour être testable sans monter le
 * SFC monolithe.
 *
 * Convention % : 100 = nécessaire par défaut (tampon − restant, plancher 0),
 * plage utile 0–200 alignée sur le curseur PDV (SpaceRestockView, min 0 /
 * max 200 / pas 5).
 */

export const STORAGE_PERCENT_MIN = 0
export const STORAGE_PERCENT_MAX = 200
export const STORAGE_PERCENT_DEFAULT = 100

/**
 * Coerce une valeur arbitraire (slider, state persisté, plan rechargé) en
 * pourcentage entier borné 0–200. Tout ce qui n'est pas un nombre fini
 * retombe sur 100 (= aucun ajustement).
 */
export function normalizeStoragePercent(raw) {
  // Number(null) et Number('') valent 0 — un « pas de valeur » doit retomber
  // sur 100 (aucun ajustement), pas sur 0 (tout à zéro).
  if (raw == null || raw === '') return STORAGE_PERCENT_DEFAULT
  const n = Number(raw)
  if (!Number.isFinite(n)) return STORAGE_PERCENT_DEFAULT
  return Math.min(STORAGE_PERCENT_MAX, Math.max(STORAGE_PERCENT_MIN, Math.round(n)))
}

/**
 * Quantité nécessaire après application du pourcentage. Arrondi entier
 * (on commande des unités), plancher 0.
 */
export function applyStoragePercent(defaultRequired, pct) {
  const base = Number(defaultRequired)
  if (!Number.isFinite(base) || base <= 0) return 0
  return Math.max(0, Math.round((base * normalizeStoragePercent(pct)) / 100))
}

/**
 * Précédence des ajustements : un réglage individuel (non null) gagne
 * toujours ; sinon le global s'applique s'il est activé ; sinon 100.
 */
export function effectiveStoragePercent({ individual = null, globalPercent = 100, globalEnabled = true } = {}) {
  if (individual != null) return normalizeStoragePercent(individual)
  if (!globalEnabled) return STORAGE_PERCENT_DEFAULT
  return normalizeStoragePercent(globalPercent)
}

/**
 * Détection des alertes de seuils sur les lignes storage.
 *
 * - nearMax : maxStock > 0 et restant >= 90 % du max — « capacité de stockage
 *   presque atteinte » (le badge inline existant utilise le même seuil).
 * - nearMin : minStock > 0 et restant <= 110 % du min — « réapprovisionnement
 *   à considérer en priorité ». Le garde `> 0` est l'anti-bruit qui avait fait
 *   retirer le badge inline (JLH 13/08) : min absent ou 0 → jamais d'alerte.
 *
 * `rows` : lignes de storageRestockGroups aplaties, chacune portant au moins
 * { name, elementId, elementName, remaining, minStock, maxStock }.
 * Retourne une liste d'alertes avec `dedupeKey` stable (élément + item + type)
 * pour le dédoublonnage côté vue.
 */
export function detectStorageAlerts(rows) {
  const alerts = []
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue
    const remaining = Number(row.remaining) || 0
    const maxStock = Number(row.maxStock)
    const minStock = Number(row.minStock)
    const base = {
      name: row.name || '',
      elementId: row.elementId || '',
      elementName: row.elementName || '',
    }
    if (Number.isFinite(maxStock) && maxStock > 0 && remaining >= 0.9 * maxStock) {
      alerts.push({ ...base, kind: 'nearMax', dedupeKey: `${base.elementId}:${base.name}:nearMax` })
    }
    if (Number.isFinite(minStock) && minStock > 0 && remaining <= 1.1 * minStock) {
      alerts.push({ ...base, kind: 'nearMin', dedupeKey: `${base.elementId}:${base.name}:nearMin` })
    }
  }
  return alerts
}
