// Filtre saison multi-choix des Menu Items (Data Integration, Space Menu, liste Menu Item).
// Règle validée : un article SANS saison n'est jamais visible dès qu'une saison est filtrée ;
// sélection vide = pas de filtre. Une saison explicite (item.seasonIds), jamais déduite des espaces.

/** @param {{ seasonIds?: string[] }} item @param {string[]} selectedSeasonIds */
export function matchesSeasonFilter(item, selectedSeasonIds) {
  if (!Array.isArray(selectedSeasonIds) || selectedSeasonIds.length === 0) return true
  const itemSeasonIds = Array.isArray(item?.seasonIds) ? item.seasonIds : []
  return itemSeasonIds.some((id) => selectedSeasonIds.includes(String(id)))
}
