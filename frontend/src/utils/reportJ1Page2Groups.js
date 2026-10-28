import { getDefaultFilters } from '@/store/modules/analyse'

// Clé stable d'un snapshot : JSON à clés triées (récursif), indépendant de l'ordre d'insertion.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value === undefined ? null : value)
}

/** Regroupe les slots qui ont exactement les mêmes filtres figés : [{ key, filters, slots }]. */
export function groupSlotsByFilters(slots) {
  const groups = new Map()
  for (const slot of slots || []) {
    const filters = slot?.filters || {}
    const key = stableStringify(filters)
    if (!groups.has(key)) groups.set(key, { key, filters, slots: [] })
    groups.get(key).slots.push(slot)
  }
  return [...groups.values()]
}

/** Filtres complets d'un groupe : défauts, puis snapshot, puis event J+1 seul. */
export function buildGroupFilters(snapshot, eventId) {
  return { ...getDefaultFilters(), ...(snapshot || {}), selectedEventIds: [eventId] }
}
