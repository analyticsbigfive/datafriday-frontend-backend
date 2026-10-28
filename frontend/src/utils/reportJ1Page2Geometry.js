// Géométrie de la page 2 du rapport J+1 (px, page A4 794 x 1123). Constantes : pas de mesure DOM,
// les composants d'impression dessinent à la taille donnée dès le montage.

export const PAGE_W = 794
export const PAGE_H = 1123
export const PAGE_PAD_X = 26
export const PAGE_PAD_Y = 22
export const HEADER_H = 64 // marque + titre de page
export const SECTION_GAP = 12 // entre l'en-tête et la grille
export const GRID_GAP = 12
export const CELL_PAD = 10
export const CELL_BORDER = 1
export const CELL_HEAD_H = 44 // titre + ligne de filtres + espacement

export const GRID_W = PAGE_W - 2 * PAGE_PAD_X
export const GRID_H = PAGE_H - 2 * PAGE_PAD_Y - HEADER_H - SECTION_GAP

const COLS = 2
const ROWS = 3
export const CELL_W = (GRID_W - GRID_GAP * (COLS - 1)) / COLS
export const CELL_H = (GRID_H - GRID_GAP * (ROWS - 1)) / ROWS

/** Dimensions d'un slot (case entière) et de sa zone de rendu (sous le titre). */
export function slotBox(w, h) {
  const width = w * CELL_W + (w - 1) * GRID_GAP
  const height = h * CELL_H + (h - 1) * GRID_GAP
  const inset = 2 * (CELL_PAD + CELL_BORDER)
  return {
    width,
    height,
    renderWidth: Math.floor(width - inset),
    renderHeight: Math.floor(height - inset - CELL_HEAD_H),
  }
}
