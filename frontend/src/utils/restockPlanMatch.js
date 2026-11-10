/**
 * restockPlanMatch : détection d'une commande (plan Réarmement) déjà sauvegardée pour
 * le même jeu d'events. Fonctions pures, sans I/O.
 *
 * Règle Bertrand (2026-11-10) : le critère est le jeu d'events attachés à la commande
 * (selectedEventIds), indépendamment de l'ordre. Le scénario n'entre pas dans la clé.
 */

/** Horodatage d'un plan (updatedAt, createdAt), 0 si illisible. */
function planTime(plan) {
  const t = Date.parse(plan?.updatedAt || plan?.createdAt || '')
  return Number.isFinite(t) ? t : 0
}

/** Clé canonique d'un jeu d'events : ids en texte, sans doublon, triés. '' si vide. */
export function eventSetKey(eventIds) {
  const ids = Array.isArray(eventIds) ? eventIds : []
  return [...new Set(ids.map((id) => String(id)).filter(Boolean))].sort().join('|')
}

/** Tri du plus récent au plus ancien (ne mute pas l'entrée). */
function newestFirst(plans) {
  return [...plans].sort((a, b) => planTime(b) - planTime(a))
}

/**
 * Commandes existantes qui portent exactement le même jeu d'events, la plus récente d'abord.
 * Un jeu vide ne correspond à rien.
 * @param {Array<object>} plans  métadonnées de plans (useRestockPlans)
 * @param {Array<string|number>} eventIds  events sélectionnés
 * @param {{ excludeId?: string|null }} [opts]  plan à ignorer (celui en cours de modification)
 */
export function findPlansForEvents(plans, eventIds, { excludeId = null } = {}) {
  const key = eventSetKey(eventIds)
  if (!key) return []
  const list = Array.isArray(plans) ? plans.filter(Boolean) : []
  return newestFirst(
    list.filter((p) => p.id !== excludeId && eventSetKey(p.selectedEventIds) === key),
  )
}

/** Dernière commande sauvegardée de l'espace (la plus récente), null si aucune. */
export function latestPlan(plans) {
  const list = Array.isArray(plans) ? plans.filter(Boolean) : []
  return list.length ? newestFirst(list)[0] : null
}

function nameKey(name) {
  return String(name || '').trim().toLowerCase()
}

/** Vrai si une commande de la liste porte déjà ce nom (casse et espaces ignorés). */
export function isPlanNameTaken(plans, name) {
  const key = nameKey(name)
  if (!key) return false
  return (Array.isArray(plans) ? plans : []).some((p) => nameKey(p?.name) === key)
}

/**
 * Nom proposé pour une nouvelle commande du même jeu d'events : « Base (2) », « Base (3) »…
 * premier nom libre. Base vide : « Commande (n) ».
 */
export function suggestPlanName(baseName, plans, fallbackBase = 'Commande') {
  const base = String(baseName || '').trim() || fallbackBase
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base} (${n})`
    if (!isPlanNameTaken(plans, candidate)) return candidate
  }
  return `${base} (${Date.now()})`
}
