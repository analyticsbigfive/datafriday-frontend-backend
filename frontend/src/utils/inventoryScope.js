// Périmètre des PdV de l'inventaire.
//
// 'event' (défaut, règle BUG-383-02) : les PdV de la configuration de l'event,
// ceux qui étaient ouverts ce soir-là.
// 'space' (« Voir tout l'inventaire », post-event) : les PdV et réserves de
// TOUTES les configurations de l'espace, pour les cas où il faut tout compter.
// Les articles par PdV restent l'union des configurations dans les deux cas.
//
// Fonctions PURES.

export const INVENTORY_SCOPE_EVENT = 'event'
export const INVENTORY_SCOPE_SPACE = 'space'

const rowConfigId = (r) => String(r?.configId ?? r?._raw?.configId ?? '')

/**
 * Rows `/spaces/:id/shops` (une ligne par élément ET par configuration) retenues
 * pour le périmètre. En 'space', les lignes de la configuration de l'event passent
 * en tête : `buildConfigShopList` garde la première ligne d'un PdV, donc son statut
 * ouvert/fermé est celui de l'event quand il en fait partie.
 */
export function rowsForScope(rows, configId, scope) {
  const all = Array.isArray(rows) ? rows : []
  const id = String(configId)
  if (scope !== INVENTORY_SCOPE_SPACE) return all.filter((r) => rowConfigId(r) === id)
  return [...all.filter((r) => rowConfigId(r) === id), ...all.filter((r) => rowConfigId(r) !== id)]
}

/**
 * Floors de plusieurs configurations fusionnés : un élément v2 partagé entre
 * configurations n'apparaît qu'une fois (première occurrence gardée, donc celle
 * de la configuration de l'event quand elle est passée en premier).
 * @param {Array<Array<Object>>} floorsByConfig
 */
export function mergeConfigFloors(floorsByConfig) {
  const seen = new Set()
  const out = []
  for (const floors of floorsByConfig || []) {
    for (const floor of floors || []) {
      const elements = []
      for (const el of floor?.elements || []) {
        const id = el?.id != null ? String(el.id) : ''
        if (id && seen.has(id)) continue
        if (id) seen.add(id)
        elements.push(el)
      }
      if (elements.length) out.push({ ...floor, elements })
    }
  }
  return out
}

/** Ids des éléments de la configuration de l'event (rows scopées + éléments de son plan). */
export function eventConfigElementIds(rows, configId, floors) {
  const ids = new Set()
  for (const r of rowsForScope(rows, configId, INVENTORY_SCOPE_EVENT)) {
    const id = r?.id ?? r?._id ?? r?.shopId
    if (id != null) ids.add(String(id))
  }
  for (const floor of floors || []) {
    for (const el of floor?.elements || []) {
      if (el?.id != null) ids.add(String(el.id))
    }
  }
  return ids
}
