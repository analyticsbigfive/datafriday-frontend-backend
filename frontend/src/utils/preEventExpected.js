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
 * Segments « Attendu » d'une section POST-event : [{ unit, total }] ou null.
 * Somme l'indice serveur (`postExpectedUnits`, ventes déjà déduites = pre-event
 * + Logistic) sur les articles de la section, groupée par unité d'affichage —
 * même forme que `aggregateExpectedUnitsByElement` (badge pre-event), même chip
 * côté InventoryCountingInterface. null = pas d'indice pour cette section.
 */
export function aggregateExpectedUnitsFromIndex(index, entry, { fallbackUnit = 'pc' } = {}) {
  const elementId = entry?.element?.id
  const items = entry?.consolidatedInventory || entry?.storageInventory || entry?.merchInventory || []
  if (!index || elementId == null || !items.length) return null
  const byUnit = {}
  let found = false
  for (const item of items) {
    if (item?.id == null) continue
    const v = index[expectedKey(elementId, item.id)]
    if (!Number.isFinite(v)) continue
    found = true
    const unit = String(item.unit || fallbackUnit).trim() || fallbackUnit
    byUnit[unit] = (byUnit[unit] || 0) + v
  }
  if (!found) return null
  return Object.entries(byUnit).map(([unit, total]) => ({ unit, total: Math.round(total * 100) / 100 }))
}

/**
 * @param {{ baseline: Record<string, Record<string, {packedUnits?: number, looseUnits?: number}>>|null,
 *           expected?: Record<string, Record<string, {packed?: number, loose?: number,
 *                              units?: number, unitsPerPack?: number}>>|null,
 *           movements?: Array<{elementId: string, itemKey?: string, menuItemId?: string|null,
 *                              packedDelta?: number, looseDelta?: number}> }|null} baselineResponse
 * @param {{ itemIdByNormName?: Map<string, string>, unitsPerItemId?: Record<string, number> }} [options]
 *   `itemIdByNormName` : nom normalisé (normalizeStr) → itemId — n'est utilisé
 *   que par le repli legacy (le blob `expected` serveur est déjà joint).
 *   `unitsPerItemId` : itemId → `inventoryQuantityPackaged` du référentiel AFFICHÉ.
 *   Sert à re-découper l'attendu dans l'unité du champ Packed de l'écran quand le
 *   serveur a calculé avec une autre taille de paquet (BUG-239) — le total en
 *   unités, lui, ne bouge pas.
 * @returns {Record<string, {packed: number, loose: number, units: number|null}>|null}
 *   `expectedKey(elementId,itemId)` → attendu ; null si aucune baseline.
 */
export function buildPreEventExpected(baselineResponse, { itemIdByNormName, unitsPerItemId } = {}) {
  const baseline = baselineResponse?.baseline
  if (!baseline || typeof baseline !== 'object') return null

  const round2 = (n) => Math.round(n * 100) / 100
  const out = {}

  // Chemin nominal : blob `expected` normalisé côté serveur (BUG-232), exprimé en
  // packed/loose + `units`/`unitsPerPack` (BUG-239).
  const serverExpected = baselineResponse?.expected
  if (serverExpected && typeof serverExpected === 'object') {
    for (const [elementId, byItem] of Object.entries(serverExpected)) {
      for (const [itemId, v] of Object.entries(byItem || {})) {
        const srvPacked = Number(v?.packed) || 0
        const srvLoose = round2(Number(v?.loose) || 0)
        const srvUpp = Number(v?.unitsPerPack) > 0 ? Number(v.unitsPerPack) : null
        const units =
          Number.isFinite(Number(v?.units)) && v?.units != null
            ? round2(Number(v.units))
            : srvUpp
              ? round2(srvPacked * srvUpp + srvLoose)
              : null
        const q = Number(unitsPerItemId?.[itemId]) > 0 ? Number(unitsPerItemId[itemId]) : null

        // Le serveur et l'écran s'accordent (ou l'un des deux ne sait pas) →
        // on garde tel quel. Sinon on re-découpe le MÊME total d'unités dans
        // l'unité du champ Packed affiché : le hint légende enfin son champ.
        if (units == null || !q || !srvUpp || q === srvUpp) {
          out[expectedKey(elementId, itemId)] = { packed: srvPacked, loose: srvLoose, units }
          continue
        }
        const packed = Math.floor(units / q)
        out[expectedKey(elementId, itemId)] = {
          packed,
          loose: round2(units - packed * q),
          units,
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

/**
 * Index plat `expectedKey(elementId,itemId)` → TOTAL en unités, depuis la sortie
 * de buildPreEventExpected. Alimente le badge « Attendu » de section pre-event
 * (réunion Bertrand 2026-08-19 : post-event précédent + Logistique — plus le
 * plan Stockup sauvegardé, retour JLH 13/08 remplacé).
 *
 * `units` peut manquer : le serveur ne le renvoie que s'il a résolu une taille
 * de paquet (inventory.service.ts, sortie de computeExpected). Repli avec la
 * taille de paquet de l'ÉCRAN (`unitsPerItemId`, inventoryQuantityPackaged) :
 * le badge doit sommer ce que les hints Packed/Loose affichés laissent
 * recalculer de tête — un total `packed + loose` sous un champ légendé
 * « Nombre de Cartons de 24 » contredirait l'écran. Référentiel serveur vs
 * écran : divergence connue (BUG-239 / Q39), même arbitrage que le re-découpage
 * de buildPreEventExpected.
 */
/**
 * Détail du calcul de l'attendu, par `expectedKey(elementId,itemId)` — alimente
 * les infobulles « voir le détail » (demande JLH 2026-08-19, suite réunion
 * Bertrand) : pre-event « post-event précédent + livraisons », post-event
 * « pre-event + mouvements − vendu ».
 *
 * Les termes sont DÉRIVÉS pour que l'identité affichée tienne toujours :
 *  - base = comptage du blob `baseline` converti avec la taille de paquet de
 *    l'ÉCRAN (même convention que flattenExpectedUnits — quand le serveur a
 *    calculé avec un autre référentiel (BUG-239/Q39), c'est le terme dérivé qui
 *    absorbe l'écart, jamais l'égalité) ;
 *  - avec `movementUnits` (post-event) : moves = net serveur, sold dérivé
 *    (base + moves − attendu) ;
 *  - sans (pre-event) : moves dérivé (attendu − base), sold null.
 *
 * @param {{ baseline: object|null, movementUnits?: object|null,
 *           expectedUnits: Record<string, number>|null,
 *           unitsPerItemId?: Record<string, number> }} params
 * @returns {Record<string, {base: number, moves: number, sold: number|null}>|null}
 */
export function buildExpectedCalcDetails({ baseline, movementUnits, expectedUnits, unitsPerItemId } = {}) {
  if (!expectedUnits || typeof expectedUnits !== 'object') return null
  const round2 = (n) => Math.round(n * 100) / 100
  const out = {}
  for (const [key, expected] of Object.entries(expectedUnits)) {
    if (!Number.isFinite(Number(expected))) continue
    const sep = key.indexOf('|')
    const elementId = key.slice(0, sep)
    const itemId = key.slice(sep + 1)
    const c = baseline?.[elementId]?.[itemId]
    const q = Number(unitsPerItemId?.[itemId]) > 0 ? Number(unitsPerItemId[itemId]) : 1
    const base = round2((Number(c?.packedUnits) || 0) * q + (Number(c?.looseUnits) || 0))
    if (movementUnits && typeof movementUnits === 'object') {
      const moves = round2(Number(movementUnits?.[elementId]?.[itemId]) || 0)
      out[key] = { base, moves, sold: round2(base + moves - Number(expected)) }
    } else {
      out[key] = { base, moves: round2(Number(expected) - base), sold: null }
    }
  }
  return out
}

export function flattenExpectedUnits(preExpected, { unitsPerItemId } = {}) {
  if (!preExpected || typeof preExpected !== 'object') return null
  const round2 = (n) => Math.round(n * 100) / 100
  const out = {}
  for (const [key, v] of Object.entries(preExpected)) {
    // Garde `!= null` obligatoire : Number(null) vaut 0 (fini) et écraserait
    // le repli — même piège que dans buildPreEventExpected.
    const units = v?.units != null ? Number(v.units) : NaN
    if (Number.isFinite(units)) {
      out[key] = round2(units)
      continue
    }
    const itemId = key.split('|')[1] ?? ''
    const q = Number(unitsPerItemId?.[itemId]) > 0 ? Number(unitsPerItemId[itemId]) : 1
    out[key] = round2((Number(v?.packed) || 0) * q + (Number(v?.loose) || 0))
  }
  return out
}
