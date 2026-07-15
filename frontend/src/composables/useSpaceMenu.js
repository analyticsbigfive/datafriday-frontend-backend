// useSpaceMenu(spaceId, configId) — spec composable #2.
// État = Map<elementId, Set<menuItemId>>. Charge getSpaceMenuConfiguration,
// applique la réconciliation SOUPLE (Règle 1) via seedBlankElements, persiste via
// saveSpaceMenuConfiguration (forme { menuItems: { [elementId]: { [menuItemId]: bool } } }).
//
// Critère : recharger ne réinjecte jamais un item retiré manuellement (un PDV
// sauvegardé est marqué dans savedElementIds -> jamais re-seedé).

import { ref } from 'vue'
import * as api from '@/utils/api'
import { seedBlankElements } from '@/composables/useSpaceMenuReconciliation'

export function useSpaceMenu() {
  const selection = ref(new Map()) // Map<elementId, Set<menuItemId>>
  const savedElementIds = ref(new Set())
  const loading = ref(false)
  const saving = ref(false)
  const error = ref(null)

  /**
   * Charge la config sauvegardée et pré-remplit UNIQUEMENT les PDV vierges depuis
   * les suggestions mapping.
   * @param {string} spaceId
   * @param {string} configId
   * @param {Map<string, Set<string>>} [suggestionsByElement]
   */
  async function load(spaceId, configId, suggestionsByElement = new Map()) {
    loading.value = true
    error.value = null
    try {
      const cfg = await api.getSpaceMenuConfiguration(spaceId, configId)
      const saved = new Set()
      const sel = new Map()
      if (cfg && cfg.menuItems) {
        Object.entries(cfg.menuItems).forEach(([elementId, obj]) => {
          saved.add(elementId) // clé présente = PDV configuré -> choix utilisateur gagne
          const set = new Set()
          Object.entries(obj || {}).forEach(([miId, checked]) => {
            if (checked) set.add(miId)
          })
          sel.set(elementId, set)
        })
      }
      savedElementIds.value = saved
      selection.value = seedBlankElements(sel, saved, suggestionsByElement)
    } catch (e) {
      error.value = e?.message || 'space-menu-load-error'
      savedElementIds.value = new Set()
      selection.value = seedBlankElements(new Map(), new Set(), suggestionsByElement)
    } finally {
      loading.value = false
    }
    return selection.value
  }

  function isSelected(elementId, menuItemId) {
    return !!selection.value.get(elementId)?.has(menuItemId)
  }

  function toggle(elementId, menuItemId) {
    const next = new Map(selection.value)
    const set = new Set(next.get(elementId) || [])
    if (set.has(menuItemId)) set.delete(menuItemId)
    else set.add(menuItemId)
    next.set(elementId, set)
    selection.value = next
  }

  function setForElement(elementId, menuItemIds) {
    const next = new Map(selection.value)
    next.set(elementId, new Set(menuItemIds || []))
    selection.value = next
  }

  /**
   * Persiste l'état édité. `availableByElement` = Map/objet elementId -> menuItemId[]
   * des items disponibles : on persiste explicitement true/false pour CHAQUE item
   * disponible (donc un PDV vidé reste "configuré" -> jamais re-seedé au reload).
   */
  async function persist(spaceId, configId, availableByElement) {
    saving.value = true
    error.value = null
    try {
      const entries =
        availableByElement instanceof Map
          ? availableByElement
          : new Map(Object.entries(availableByElement || {}))
      const menuItems = {}
      entries.forEach((ids, elementId) => {
        const set = selection.value.get(elementId) || new Set()
        const obj = {}
        ;(ids || []).forEach((id) => {
          obj[id] = set.has(id)
        })
        menuItems[elementId] = obj
      })
      await api.saveSpaceMenuConfiguration(spaceId, configId, menuItems)
      const saved = new Set(savedElementIds.value)
      Object.keys(menuItems).forEach((id) => saved.add(id))
      savedElementIds.value = saved
      return menuItems
    } catch (e) {
      error.value = e?.message || 'space-menu-save-error'
      throw e
    } finally {
      saving.value = false
    }
  }

  return {
    selection,
    savedElementIds,
    loading,
    saving,
    error,
    load,
    isSelected,
    toggle,
    setForElement,
    persist,
  }
}
