// Pages de sélection du rapport J+1 : fonctions PURES au-dessus de reportJ1Grid.
// Document v2 : { version: 2, pages: [{ slots }] }, de 1 à MAX_PAGES pages (la 1re est la page 2
// du rapport, les suivantes les pages 3 à 5). Un document v1 { version: 1, slots } est lu comme
// une seule page.
import { placeSlot, removeSlot } from './reportJ1Grid'

export const MAX_PAGES = 4
/** Numéro de la 1re page de sélection dans le rapport (la page 1 est le bilan fixe). */
export const FIRST_PAGE_NUMBER = 2

const emptyPage = () => ({ slots: [] })

/** Tout document (v1, v2, vide, absent) -> { version: 2, pages } avec au moins une page. */
export function normalizeLayout(raw) {
  if (raw && Array.isArray(raw.pages) && raw.pages.length) {
    const pages = raw.pages.slice(0, MAX_PAGES).map((p) => ({ slots: Array.isArray(p?.slots) ? p.slots : [] }))
    return { version: 2, pages }
  }
  const slots = Array.isArray(raw?.slots) ? raw.slots : []
  return { version: 2, pages: [{ slots }] }
}

/** Page d'indice donné (objet { slots }), vide si hors bornes. */
export function pageAt(layout, index) {
  return normalizeLayout(layout).pages[index] || emptyPage()
}

export const pageCount = (layout) => normalizeLayout(layout).pages.length
export const canAddPage = (layout) => pageCount(layout) < MAX_PAGES
export const pageNumber = (index) => FIRST_PAGE_NUMBER + index

/** Tous les slots, pages dans l'ordre. */
export function allSlots(layout) {
  return normalizeLayout(layout).pages.flatMap((p) => p.slots)
}

function withPages(layout, pages) {
  return { ...normalizeLayout(layout), pages }
}

/** Pose un slot dans la page `index`. Lève si l'emplacement n'est pas posable. */
export function placeInPage(layout, index, slot) {
  const n = normalizeLayout(layout)
  if (!n.pages[index]) throw new Error('Page inconnue')
  const placed = placeSlot(n.pages[index], slot)
  return withPages(n, n.pages.map((p, i) => (i === index ? { slots: placed.slots } : p)))
}

/** Retire le slot d'id donné, quelle que soit sa page. */
export function removeSlotEverywhere(layout, slotId) {
  const n = normalizeLayout(layout)
  return withPages(n, n.pages.map((p) => ({ slots: removeSlot(p, slotId).slots })))
}

/** Change le titre d'un slot (vide = retour au titre par défaut). */
export function renameSlot(layout, slotId, label) {
  const n = normalizeLayout(layout)
  const clean = String(label ?? '').trim().slice(0, 120)
  return withPages(n, n.pages.map((p) => ({ slots: p.slots.map((s) => (s.id === slotId ? { ...s, label: clean } : s)) })))
}

/** Ajoute une page vide à la fin ; inchangé si le maximum est atteint. */
export function addPage(layout) {
  const n = normalizeLayout(layout)
  return n.pages.length >= MAX_PAGES ? n : withPages(n, [...n.pages, emptyPage()])
}

/** Supprime la page `index` et ses éléments. La dernière page restante est vidée, pas supprimée. */
export function removePageAt(layout, index) {
  const n = normalizeLayout(layout)
  if (n.pages.length <= 1) return withPages(n, [emptyPage()])
  return withPages(n, n.pages.filter((_, i) => i !== index))
}

/**
 * Résultats de loadPage2 (dans l'ordre de allSlots) -> [{ number, items }] par page non vide,
 * `number` = numéro de la page dans le rapport.
 */
export function splitResultsByPage(layout, results) {
  const out = []
  let offset = 0
  normalizeLayout(layout).pages.forEach((page, index) => {
    const items = (results || []).slice(offset, offset + page.slots.length)
    offset += page.slots.length
    if (items.length) out.push({ number: pageNumber(index), items })
  })
  return out
}
