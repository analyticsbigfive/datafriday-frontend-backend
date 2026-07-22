// Quantités ATTENDUES du Pre-event Inventory (écran bi-mode, docs modules/10 §8).
//
// attendu(elementId × itemId) = comptage POST-event de l'événement précédent
//                             + Σ mouvements Logistic depuis ce comptage.
//
// Fonction PURE : consomme la réponse de GET /inventory/:spaceId/pre-event-baseline/:eventId
// (endpoint gaté par `front.fb.preInventoryExpected` — l'appelant ne nous invoque
// que si la permission est là) et le référentiel d'items AFFICHÉ par l'écran
// (résolution nom→item des mouvements sans menuItemId : StockMovement.itemKey
// est un NOM libre — piège n°1 du domaine Stock, jointure id-d'abord).
//
// Sémantique : baseline null (pas de post-event précédent) → retour null — AUCUNE
// valeur attendue (décision user 2026-07-20, pas de « mouvements seuls », pas de
// 0 fabriqué). Deltas négatifs conservés tels quels : un attendu négatif est un
// signal (mouvement en double, casse sur-déclarée), pas une donnée à clamper.

import { normalizeStr } from '@/utils/predictiveAnalytics'

export function expectedKey(elementId, itemId) {
  return `${elementId}|${itemId}`
}

/**
 * @param {{ baseline: Record<string, Record<string, {packedUnits?: number, looseUnits?: number}>>|null,
 *           movements?: Array<{elementId: string, itemKey?: string, menuItemId?: string|null,
 *                              packedDelta?: number, looseDelta?: number}> }|null} baselineResponse
 * @param {{ itemIdByNormName?: Map<string, string> }} [options]
 *   `itemIdByNormName` : nom normalisé (normalizeStr) → itemId, construit par
 *   l'écran depuis son référentiel affiché. Mouvement sans menuItemId ET sans
 *   correspondance de nom → ignoré (non joignable, documenté).
 * @returns {Record<string, {packed: number, loose: number}>|null}
 *   `expectedKey(elementId,itemId)` → attendu ; null si aucune baseline.
 */
export function buildPreEventExpected(baselineResponse, { itemIdByNormName } = {}) {
  const baseline = baselineResponse?.baseline
  if (!baseline || typeof baseline !== 'object') return null

  const round2 = (n) => Math.round(n * 100) / 100
  const out = {}

  for (const [shopId, byItem] of Object.entries(baseline)) {
    for (const [itemId, c] of Object.entries(byItem || {})) {
      out[expectedKey(shopId, itemId)] = {
        packed: Number(c?.packedUnits) || 0,
        loose: round2(Number(c?.looseUnits) || 0),
      }
    }
  }

  for (const m of baselineResponse?.movements || []) {
    if (!m?.elementId) continue
    const itemId =
      (m.menuItemId != null && String(m.menuItemId)) ||
      (itemIdByNormName instanceof Map
        ? itemIdByNormName.get(normalizeStr(m.itemKey))
        : undefined) ||
      null
    if (!itemId) continue // mouvement non joignable au référentiel affiché
    const k = expectedKey(m.elementId, itemId)
    const cur = out[k] || { packed: 0, loose: 0 }
    cur.packed += Number(m.packedDelta) || 0
    cur.loose = round2(cur.loose + (Number(m.looseDelta) || 0))
    out[k] = cur
  }

  return out
}
