// src/composables/useLogisticEventSelection.js
//
// Sélecteur d'events du bandeau Logistique (maquettes Bertrand du 2026-10-09) : un
// ou plusieurs matchs, le prochain par défaut jusqu'à sa fin réelle (règle serveur,
// GET /logistics/:spaceId/ventilation-events). La sélection vit dans l'URL
// (`?events=a,b`) : elle survit au rechargement et se partage par lien. Un deep-link
// `?event=` (Event Predict) reste lu quand `?events=` est absent.

import { ref, computed } from 'vue'
import { getVentilationEvents } from '@/api/endpoints/logistics.api'

export function useLogisticEventSelection({ route, router, t }) {
  const events = ref([])
  const defaultEventId = ref(null)

  const queryIds = computed(() => {
    const raw = route?.query?.events
    const list = String(Array.isArray(raw) ? raw.join(',') : raw || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    if (list.length) return list
    return route?.query?.event ? [String(route.query.event)] : []
  })

  /** Matchs choisis, ordre chronologique. Seuls les matchs proposés comptent : un lien
   *  vers un match terminé (absent de la liste, impossible à décocher) retombe sur le
   *  prochain match. Liste indisponible : l'URL est gardée telle quelle. */
  const selectedIds = computed(() => {
    const order = events.value.map((e) => String(e.id))
    let ids = [...new Set(queryIds.value)]
    if (order.length) ids = ids.filter((id) => order.includes(id))
    if (!ids.length && defaultEventId.value) ids = [String(defaultEventId.value)]
    return ids.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  })

  const label = computed(() => {
    const ids = selectedIds.value
    if (!ids.length) return t('logiEventSelectNone')
    if (ids.length > 1) return t('logiEventSelectCount').replace('{n}', String(ids.length))
    const ev = events.value.find((e) => String(e.id) === ids[0])
    return ev?.label || ev?.name || t('logiEventSelectOne')
  })

  async function load(spaceId) {
    try {
      const res = await getVentilationEvents(spaceId)
      events.value = Array.isArray(res?.events) ? res.events : []
      defaultEventId.value = res?.defaultEventId || null
    } catch (e) {
      console.warn('[logistics] liste des matchs indisponible :', e?.message)
      events.value = []
      defaultEventId.value = null
    }
  }

  function select(ids) {
    const next = [...new Set((ids || []).map(String))]
    if (!next.length) return
    router.replace({ query: { ...route.query, events: next.join(',') } })
  }

  return { events, defaultEventId, selectedIds, label, load, select }
}
