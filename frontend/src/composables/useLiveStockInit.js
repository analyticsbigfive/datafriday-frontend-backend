// Module Live (docs/modules/11_LIVE.md §15) — initialise le stock affiché dans
// l'onglet Inventaire de Live à partir du comptage validé de l'Inventaire
// pré-événement de l'event en cours (source de vérité du stock de départ,
// tranchée par Bertrand — pas Event Predict, qui reste une prédiction).
//
// Réutilise TEL QUEL le mécanisme de reset Logistic déjà en production
// (aucun changement backend) : POST /logistics/:spaceId/reset crée une
// StockReconciliation (nouvelle ancre) + des StockMovement `INVENTORY_RESET` +
// met à jour StockLevel — exactement comme un reset manuel (comptage physique),
// seule la provenance des quantités change. Les mouvements de stock (ventes en
// temps réel, transferts, resets ultérieurs) continuent de s'appliquer par-
// dessus, sans rien de spécifique à écrire pour ça.
import { ref } from 'vue'
import store from '@/store'
import { getPreEventInventory } from '@/api/endpoints/inventory.api'

/**
 * itemId (InventoryCount) → itemKey (nom, référentiel Logistic/StockMovement) :
 * même résolution que `itemNameById` côté backend (`buildPostEventReconciliationLines`,
 * inventory.service.ts) et `catalogById` côté front (useInventoryData.js) — le
 * catalogue MenuItem fait foi, les lignes non résolvables (composant/ingrédient
 * sans MenuItem correspondant) sont orphelines et écartées, même convention.
 */
function buildItemKeyById(menuItems) {
  const m = new Map()
  for (const mi of menuItems || []) {
    if (mi?.id != null && mi?.name) m.set(String(mi.id), mi.name)
  }
  return m
}

export function useLiveStockInit() {
  const initializing = ref(false)
  const lastError = ref(null)

  /**
   * @param {string} spaceId
   * @param {string} eventId
   * @param {string} [eventName]
   * @returns {Promise<{ok:boolean, reason?:string, lineCount?:number, source?:string}>}
   */
  async function initFromPreEventInventory(spaceId, eventId, eventName) {
    lastError.value = null
    if (!spaceId || !eventId) {
      lastError.value = 'missing-space-or-event'
      return { ok: false, reason: lastError.value }
    }
    initializing.value = true
    try {
      const pre = await getPreEventInventory(spaceId, eventId)
      if (!pre || !pre.inventoryCounts) {
        lastError.value = 'no-pre-event-inventory'
        return { ok: false, reason: lastError.value }
      }

      const itemKeyById = buildItemKeyById(store.state.analyse.menuItems)
      const lines = []
      for (const [shopId, byItem] of Object.entries(pre.inventoryCounts || {})) {
        for (const [itemId, count] of Object.entries(byItem || {})) {
          const itemKey = itemKeyById.get(String(itemId))
          if (!itemKey) continue // orphelin : id absent du catalogue courant, non adressable côté Logistic
          lines.push({
            elementId: shopId,
            itemKey,
            countedPacked: Number(count?.packedUnits) || 0,
            countedLoose: Number(count?.looseUnits) || 0,
          })
        }
      }
      if (!lines.length) {
        lastError.value = 'no-requirements'
        return { ok: false, reason: lastError.value }
      }

      await store.dispatch('logistics/reset', { spaceId, eventId, eventName, lines })
      return { ok: true, lineCount: lines.length, source: pre.source }
    } catch (err) {
      lastError.value = err?.response?.data?.message || err?.message || 'init-failed'
      return { ok: false, reason: lastError.value }
    } finally {
      initializing.value = false
    }
  }

  return { initializing, lastError, initFromPreEventInventory }
}
