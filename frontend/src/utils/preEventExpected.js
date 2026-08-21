// Quantités ATTENDUES des écrans Pre/Post-event Inventory (docs modules/10 §8).
//
// Depuis la décision JLH 2026-08-20 : attendu(elementId × itemId) = ÉTAT
// LOGISTIC au chargement de l'écran (StockLevel − ventes dérivées, casse de
// pack + clamp ≥ 0) — exactement le chiffre de l'écran Logistic, calculé côté
// serveur (`LogisticsService.getExpectedStockIndex`) et re-découpé dans la
// taille de paquet de l'INVENTAIRE (BUG-239). La réponse de
// GET /inventory/:spaceId/pre-event-baseline/:eventId porte ce résultat dans
// `expected` — ce module ne fait plus que l'aplatir.
//
// Sémantique : article absent du blob (jamais suivi par la Logistique) → aucune
// valeur attendue (« — »), jamais de 0 fabriqué (décision user 2026-07-20).

export function expectedKey(elementId, itemId) {
  return `${elementId}|${itemId}`
}

/**
 * Segments « Attendu » d'une section POST-event : [{ unit, total }] ou null.
 * Somme l'indice serveur (`postExpectedUnits`, ventes déjà déduites — état
 * Logistic) sur les articles de la section, groupée par unité d'affichage —
 * même chip côté InventoryCountingInterface que le badge pre-event.
 * null = pas d'indice pour cette section.
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
 * @param {{ expected?: Record<string, Record<string, {packed?: number, loose?: number,
 *                              units?: number, unitsPerPack?: number}>>|null }|null} baselineResponse
 * @param {{ unitsPerItemId?: Record<string, number> }} [options]
 *   `unitsPerItemId` : itemId → `inventoryQuantityPackaged` du référentiel AFFICHÉ.
 *   Sert à re-découper l'attendu dans l'unité du champ Packed de l'écran quand le
 *   serveur a calculé avec une autre taille de paquet (BUG-239) — le total en
 *   unités, lui, ne bouge pas.
 * @returns {Record<string, {packed: number, loose: number, units: number|null}>|null}
 *   `expectedKey(elementId,itemId)` → attendu ; null si le blob serveur est absent
 *   (backend antérieur — la vue affiche alors « serveur non à jour »).
 */
export function buildPreEventExpected(baselineResponse, { unitsPerItemId } = {}) {
  const serverExpected = baselineResponse?.expected
  if (!serverExpected || typeof serverExpected !== 'object') return null

  const round2 = (n) => Math.round(n * 100) / 100
  const out = {}
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
