// Zones du plan d'une configuration, à plat.
//
// getConfiguration renvoie les éléments répartis en trois groupes : `floors`
// (étages), `forecourt` (parvis) et `externalMerch` (zone merch externe). Les
// consommateurs qui ne lisent que `floors` perdent tout ce qui est posé sur le
// parvis (stockages, merch, shops). Le parvis et la zone externe sont donc
// présentés ici comme des étages supplémentaires, avec leur nom de zone en
// `name` (repris en `floorName` par l'inventaire).
//
// Fonction PURE.

/**
 * @param {Object|null} config réponse de getConfiguration (`data` ou racine)
 * @returns {Array<{ id, name, elements: Array<Object> }>}
 */
export function configPlanZones(config) {
  const src = config?.data ?? config ?? {}
  const zones = Array.isArray(src.floors) ? [...src.floors] : []
  for (const extra of [src.forecourt, src.externalMerch]) {
    if (extra && Array.isArray(extra.elements) && extra.elements.length) zones.push(extra)
  }
  return zones
}
