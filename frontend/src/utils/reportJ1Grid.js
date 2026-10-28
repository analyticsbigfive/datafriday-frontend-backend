// Grille 2 x 3 de la page 2 du rapport J+1 : fonctions PURES (aucun état, aucune mutation).
// Un slot occupe [col, col+w-1] x [row, row+h-1] ; le clic sur une case désigne son coin haut gauche.
import { GRID_COLS, GRID_ROWS, sizeOf } from './reportJ1Page2Catalog'

export const EMPTY_LAYOUT = Object.freeze({ version: 1, slots: [] })

const key = (col, row) => `${col},${row}`

function slotsOf(layout) {
  return Array.isArray(layout?.slots) ? layout.slots : []
}

/** Map "col,row" -> id du slot, pour toutes les cases couvertes par les slots du layout. */
export function occupiedCells(layout) {
  const map = new Map()
  for (const slot of slotsOf(layout)) {
    const size = sizeOf(slot.kind)
    if (!size) continue
    for (let c = slot.col; c < slot.col + size.w; c += 1) {
      for (let r = slot.row; r < slot.row + size.h; r += 1) map.set(key(c, r), slot.id)
    }
  }
  return map
}

/** Raison pour laquelle (kind, col, row) n'est pas posable, ou null si c'est posable. */
export function placementBlocker(layout, kind, col, row) {
  const size = sizeOf(kind)
  if (!size || !Number.isInteger(col) || !Number.isInteger(row)) return 'invalid'
  if (col < 0 || row < 0) return 'invalid'
  if (col + size.w > GRID_COLS) return 'overflow-cols'
  if (row + size.h > GRID_ROWS) return 'overflow-rows'
  const cells = occupiedCells(layout)
  for (let c = col; c < col + size.w; c += 1) {
    for (let r = row; r < row + size.h; r += 1) {
      if (cells.has(key(c, r))) return 'overlap'
    }
  }
  return null
}

export function canPlace(layout, kind, col, row) {
  return placementBlocker(layout, kind, col, row) === null
}

/**
 * Etat de chaque case comme coin haut gauche possible pour `kind`.
 * @returns {Array<{ col, row, state: 'free'|'occupied'|'unavailable', slotId: string|null, reason: string|null }>}
 *   ordre de lecture (rangée par rangée). 'occupied' = la case est déjà couverte par un slot ;
 *   'unavailable' = libre mais l'emprise du kind déborde ou chevauche.
 */
export function cellStates(layout, kind) {
  const cells = occupiedCells(layout)
  const out = []
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const slotId = cells.get(key(col, row)) || null
      if (slotId) {
        out.push({ col, row, state: 'occupied', slotId, reason: null })
        continue
      }
      const reason = placementBlocker(layout, kind, col, row)
      out.push({ col, row, state: reason ? 'unavailable' : 'free', slotId: null, reason })
    }
  }
  return out
}

/** Nouveau layout avec le slot ajouté. Lève si l'emplacement n'est pas posable. */
export function placeSlot(layout, slot) {
  const blocker = placementBlocker(layout, slot?.kind, slot?.col, slot?.row)
  if (blocker) throw new Error(`Placement impossible (${blocker})`)
  return { ...layout, version: layout?.version || 1, slots: [...slotsOf(layout), slot] }
}

/** Nouveau layout sans le slot d'id donné. */
export function removeSlot(layout, slotId) {
  return { ...layout, version: layout?.version || 1, slots: slotsOf(layout).filter((s) => s.id !== slotId) }
}
