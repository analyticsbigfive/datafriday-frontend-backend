// Quantités ATTENDUES du Pre-event Inventory (écran bi-mode, docs modules/10 §8).
//
// attendu(elementId × itemId) = comptage POST-event de l'événement précédent
//                             + Σ mouvements Logistic depuis ce comptage,
// NORMALISÉ côté serveur (BUG-232) : rejeu séquentiel des mouvements avec casse
// de pack + clamp ≥ 0 (`LogisticsService.normalizeLevel`), pour coller aux
// niveaux du module Logistique. La réponse de
// GET /inventory/:spaceId/pre-event-baseline/:eventId porte ce résultat dans
// `expected` — ce module ne fait plus que l'aplatir.
//
// Repli legacy (backend pas encore redéployé, réflexe BUG-228) : si `expected`
// est absent de la réponse, on retombe sur l'ancienne somme brute
// baseline + deltas avec jointure nom→item contre le référentiel AFFICHÉ
// (StockMovement.itemKey est un NOM libre — piège n°1 du domaine Stock).
// Ce repli peut produire des négatifs (pas de casse de pack) — à supprimer une
// fois les deux côtés déployés ensemble.
//
// Sémantique : baseline null (pas de post-event précédent) → retour null — AUCUNE
// valeur attendue (décision user 2026-07-20, pas de « mouvements seuls », pas de
// 0 fabriqué). La décision « deltas négatifs conservés comme signal » (2026-07-20)
// est RÉVOQUÉE le 2026-07-23 : un attendu négatif était un bug d'affichage
// (BUG-232), la normalisation serveur l'élimine.

import { normalizeStr } from '@/utils/predictiveAnalytics'

export function expectedKey(elementId, itemId) {
  return `${elementId}|${itemId}`
}

/**
 * @param {{ baseline: Record<string, Record<string, {packedUnits?: number, looseUnits?: number}>>|null,
 *           expected?: Record<string, Record<string, {packed?: number, loose?: number}>>|null,
 *           movements?: Array<{elementId: string, itemKey?: string, menuItemId?: string|null,
 *                              packedDelta?: number, looseDelta?: number}> }|null} baselineResponse
 * @param {{ itemIdByNormName?: Map<string, string> }} [options]
 *   `itemIdByNormName` : nom normalisé (normalizeStr) → itemId — n'est utilisé
 *   que par le repli legacy (le blob `expected` serveur est déjà joint).
 * @returns {Record<string, {packed: number, loose: number}>|null}
 *   `expectedKey(elementId,itemId)` → attendu ; null si aucune baseline.
 */
export function buildPreEventExpected(baselineResponse, { itemIdByNormName } = {}) {
  const baseline = baselineResponse?.baseline
  if (!baseline || typeof baseline !== 'object') return null

  const round2 = (n) => Math.round(n * 100) / 100
  const out = {}

  // Chemin nominal : blob `expected` normalisé côté serveur (BUG-232).
  const serverExpected = baselineResponse?.expected
  if (serverExpected && typeof serverExpected === 'object') {
    for (const [elementId, byItem] of Object.entries(serverExpected)) {
      for (const [itemId, v] of Object.entries(byItem || {})) {
        out[expectedKey(elementId, itemId)] = {
          packed: Number(v?.packed) || 0,
          loose: round2(Number(v?.loose) || 0),
        }
      }
    }
    return out
  }

  // ── Repli legacy (backend antérieur à BUG-232) : somme brute, sans casse de
  // pack — peut produire des négatifs. À supprimer après déploiement conjoint.
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
