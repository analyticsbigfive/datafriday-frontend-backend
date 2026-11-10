// src/composables/useVentilationChecks.js
//
// Validations de dépôt de la Ventilation (demande Bertrand 2026-11-06) : coche par
// article, coche par ligne PDV / réserve, quantité modifiée et commentaire. Les
// données vivent en base (partagées entre appareils) ; ce composable garde l'état
// local, applique les changements tout de suite puis les envoie. L'écran hôte lui
// donne les deux appels (staff ou invité PIN) et le fournit aux lignes via
// provideVentilationChecks / useInjectedVentilationChecks.

import { reactive, provide, inject } from 'vue'

const INJECTION_KEY = 'ventilationChecks'
const ITEM_SCOPE = ''

/** Clé d'une validation : article seul (elementId vide) ou ligne (article x destination). */
export function checkKey(itemKey, elementId = ITEM_SCOPE) {
  return `${itemKey}|||${elementId == null ? ITEM_SCOPE : elementId}`
}

/** Quantité saisie au drawer en unités de l'article (packs x taille de pack + vrac). */
export function depositUnits({ packed, loose }, unitsPerPack) {
  return (Number(packed) || 0) * (Number(unitsPerPack) || 1) + (Number(loose) || 0)
}

/**
 * @param {Object} deps
 * @param {() => Promise<Array>} deps.fetchChecks relit toutes les validations
 * @param {(change:object) => Promise<any>} deps.saveCheck enregistre un changement
 */
export function useVentilationChecks({ fetchChecks, saveCheck }) {
  const entries = reactive({})

  async function load() {
    try {
      const list = await fetchChecks()
      for (const k of Object.keys(entries)) delete entries[k]
      for (const c of Array.isArray(list) ? list : []) {
        entries[checkKey(c.itemKey, c.elementId)] = {
          checked: !!c.checked,
          quantity: c.quantity == null ? null : Number(c.quantity),
          comment: c.comment || null,
        }
      }
    } catch (e) {
      console.warn('[ventilation] validations indisponibles :', e?.message)
    }
  }

  function entry(itemKey, elementId) {
    return entries[checkKey(itemKey, elementId)] || { checked: false, quantity: null, comment: null }
  }

  const isRowChecked = (itemKey, elementId) => entry(itemKey, elementId).checked
  const isItemChecked = (itemKey) => entry(itemKey, ITEM_SCOPE).checked

  /** Applique tout de suite, envoie ensuite ; en cas d'échec, restaure l'état d'avant. */
  async function apply(itemKey, elementId, patch, unchecksItem) {
    const key = checkKey(itemKey, elementId)
    const itemRef = checkKey(itemKey, ITEM_SCOPE)
    const before = entries[key] ? { ...entries[key] } : undefined
    const itemBefore = entries[itemRef] ? { ...entries[itemRef] } : undefined
    entries[key] = { ...entry(itemKey, elementId), ...patch }
    // Une ligne décochée décoche l'article (règle appliquée aussi par le serveur).
    if (unchecksItem && itemBefore?.checked) entries[itemRef] = { ...itemBefore, checked: false }
    try {
      await saveCheck({ itemKey, elementId: elementId || undefined, ...patch })
    } catch (e) {
      if (before) entries[key] = before
      else delete entries[key]
      if (itemBefore) entries[itemRef] = itemBefore
      throw e
    }
  }

  const toggleRow = (itemKey, elementId) => {
    const next = !isRowChecked(itemKey, elementId)
    return apply(itemKey, elementId, { checked: next }, !next)
  }
  const toggleItem = (itemKey) => apply(itemKey, ITEM_SCOPE, { checked: !isItemChecked(itemKey) }, false)
  /** Coche / décoche plusieurs lignes d'un coup (carte PDV, article pour tous les PDV). */
  const setRows = (pairs, next, unchecksItem = false) =>
    Promise.all(pairs.map(([itemKey, elementId]) => apply(itemKey, elementId, { checked: next }, unchecksItem && !next)))
  const areRowsChecked = (pairs) => pairs.length > 0 && pairs.every(([i, e]) => isRowChecked(i, e))
  /** Quantité modifiée et commentaire d'une ligne, ligne validée (drawer, bouton Confirmer). */
  const confirmRow = (itemKey, elementId, { quantity, comment }) =>
    apply(itemKey, elementId, { checked: true, quantity: quantity ?? null, comment: comment || null }, false)

  return { entries, load, entry, isRowChecked, isItemChecked, toggleRow, toggleItem, setRows, areRowsChecked, confirmRow }
}

export function provideVentilationChecks(checks) {
  provide(INJECTION_KEY, checks)
}

/** Validations fournies par l'écran hôte ; null (aucune coche affichée) sans fournisseur. */
export function useInjectedVentilationChecks() {
  return inject(INJECTION_KEY, null)
}
