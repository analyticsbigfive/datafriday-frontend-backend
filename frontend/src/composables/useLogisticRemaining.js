// Stock restant pour le Réarmement, lu directement dans Logistic (le ledger
// temps réel : StockLevel − consommation ventes), plutôt que dans un comptage
// Pre/Post-event Inventory figé (retour client 2026-09-02 : le réarmement
// ignorait les ajustements faits dans Logistic).
//
// Le module Vuex `store/modules/logistics` est scopé à UN SEUL config à la
// fois (`SET_STOCK` remplace tout `state.levels`), inadapté ici : le
// Réarmement peut agréger plusieurs configs objectif (multi-event). On appelle
// donc l'API directement et on construit un index local, sans toucher au store
// partagé (pour ne pas interférer avec l'écran Logistic si les deux sont
// ouverts dans le même onglet).
//
// Identité Logistic = le NOM (`itemKey`), jamais un id d'inventaire, cf.
// `uniq_stock_level(elementId, itemKey)` côté backend. Les entrées produites
// ici portent donc `itemId: null` volontairement : forcer le matching par nom
// partout où elles sont consommées (stockNetting.consumeFromPool bascule sur
// le nom dès qu'un des deux côtés n'a aucun id).

import { getLogisticsStock } from '@/api/endpoints/logistics.api'
import { normalizeExpected } from '@/store/modules/logistics'
import { normalizeStr } from '@/utils/predictiveAnalytics'

function keyOf(elementId, itemName) {
  return `${elementId}::${normalizeStr(itemName)}`
}

/**
 * Charge le stock Logistic de l'espace pour un ou plusieurs configs (fan-out,
 * tolérant à l'échec par config : un config KO n'empêche pas les autres de
 * contribuer à l'index).
 * @param {Object} params
 * @param {string} params.spaceId
 * @param {Array<string>} params.configIds
 * @returns {Promise<{index: Record<string, {packed:number, loose:number, unitsPerPack:number|null, marketPriceId:string|null, unit:string|null}>, loaded: boolean}>}
 */
export async function loadLogisticRemainingIndex({ spaceId, configIds } = {}) {
  const ids = Array.from(new Set((configIds || []).filter(Boolean).map(String)))
  const index = {}
  if (!spaceId || !ids.length) return { index, loaded: false }

  let loaded = false
  await Promise.all(
    ids.map(async (configId) => {
      let data
      try {
        data = await getLogisticsStock(spaceId, configId)
      } catch (e) {
        console.warn('[restock] stock Logistic indisponible pour config', configId, e?.message)
        return
      }
      loaded = true

      const unitByName = {}
      for (const el of data?.elements || []) {
        for (const it of el?.items || []) {
          const nk = normalizeStr(it?.name)
          if (nk && !unitByName[nk]) unitByName[nk] = it.unit || ''
        }
      }

      const consumptionByKey = {}
      for (const c of data?.consumption || []) {
        consumptionByKey[keyOf(c.elementId, c.itemKey)] = Number(c.quantity) || 0
      }

      for (const level of data?.levels || []) {
        const k = keyOf(level.elementId, level.itemKey)
        const consumed = consumptionByKey[k] || 0
        const { packed, loose } = normalizeExpected(
          level.packedUnits,
          (level.looseUnits ?? 0) - consumed,
          level.unitsPerPack,
        )
        index[k] = {
          name: level.itemKey || '',
          packed,
          loose,
          unitsPerPack: level.unitsPerPack ?? null,
          marketPriceId: level.marketPriceId ?? null,
          unit: unitByName[normalizeStr(level.itemKey)] || '',
        }
      }
    }),
  )
  return { index, loaded }
}

/**
 * Restant Logistic (total unités, packed*unitsPerPack + loose) pour un
 * (élément, nom d'item). `null` = rien en Logistic pour cette ligne (config
 * pas encore chargé, ou article jamais mouvementé), à distinguer d'un 0
 * explicite (StockLevel existant mais vide), que l'appelant doit pouvoir
 * traiter différemment (ex. repli sur l'ancienne source).
 * @returns {number|null}
 */
export function lookupLogisticRemaining(index, elementId, itemName) {
  if (!index || !elementId || !itemName) return null
  const entry = index[keyOf(elementId, itemName)]
  if (!entry) return null
  const upp = Number(entry.unitsPerPack) > 0 ? Number(entry.unitsPerPack) : 1
  return entry.packed * upp + entry.loose
}

/**
 * Entrées de pool (stockNetting.preparePool) agrégeant le stock Logistic de
 * plusieurs éléments (typiquement les Storage) par nom normalisé, même shape
 * que l'ancien `aggregateCountsForElements` ({ itemId, sourceId,
 * marketPriceId, name, unit, qty }), identité pure par nom (itemId/sourceId
 * toujours null, cf. en-tête du fichier).
 * @param {Record<string, object>} index
 * @param {Array<string>} elementIds
 * @returns {Array<{itemId:null, sourceId:null, marketPriceId:string|null, name:string, unit:string, qty:number}>}
 */
export function logisticPoolEntriesForElements(index, elementIds) {
  const map = new Map()
  ;(elementIds || []).forEach((elId) => {
    Object.entries(index || {}).forEach(([k, entry]) => {
      if (!k.startsWith(`${elId}::`)) return
      const upp = Number(entry.unitsPerPack) > 0 ? Number(entry.unitsPerPack) : 1
      const qty = entry.packed * upp + entry.loose
      if (!(qty > 0)) return
      const nameKey = k.slice(String(elId).length + 2)
      const prev = map.get(nameKey)
      if (prev) {
        prev.qty += qty
        return
      }
      map.set(nameKey, {
        itemId: null,
        sourceId: null,
        marketPriceId: entry.marketPriceId || null,
        name: entry.name || nameKey,
        unit: entry.unit || '',
        qty,
      })
    })
  })
  return Array.from(map.values())
}
