// Périmètre d'un document de réconciliation post-event (BUG-378-02).
//
// Le document décrit le PÉRIMÈTRE COMPTÉ : les PdV/storages de l'écran et leurs
// articles. Les autres sources (pré-event, mouvements) peuvent porter des clés
// hors de ce périmètre (PdV retiré de la configuration entre deux matchs,
// storage non compté) : sans filtre, elles fabriquaient des lignes orphelines
// sans nom, illisibles et faussant les totaux. Ces clés sont écartées ET
// comptées, pour être archivées dans `meta.perimeterExcluded`.
//
// Le même module porte le repli de nommage catalogue : une clé jointe (pré-event
// d'un article retiré du référentiel depuis, mouvement Logistic) peut ne pas
// avoir de nom côté comptage. Le catalogue (menu items, market prices,
// composants) le fournit alors, avec les MÊMES identités que
// `componentIngredientId` (marketPriceId → sourceId → id).
//
// Fonctions PURES.

const toUnits = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Restreint un index `reconciliationKey → unités` aux PdV du périmètre.
 * @param {Object|null} byKey
 * @param {Set<string>} elementIdSet PdV/storages comptés
 * @returns {{kept: Object|null, excludedLines: number, excludedUnits: number}}
 *   `kept` reste null quand l'index d'entrée est null (source absente).
 */
export function restrictKeysToPerimeter(byKey, elementIdSet) {
  if (byKey == null) return { kept: null, excludedLines: 0, excludedUnits: 0 }
  const kept = {}
  let excludedLines = 0
  let excludedUnits = 0
  for (const [key, units] of Object.entries(byKey)) {
    const sep = key.indexOf('|')
    const elementId = sep > 0 ? key.slice(0, sep) : ''
    if (elementId && elementIdSet?.has(elementId)) {
      kept[key] = units
    } else {
      excludedLines += 1
      excludedUnits += Math.abs(toUnits(units))
    }
  }
  return { kept, excludedLines, excludedUnits: Math.round(excludedUnits * 100) / 100 }
}

/**
 * Cumule plusieurs résultats de `restrictKeysToPerimeter` en un compteur
 * archivable. null quand rien n'a été écarté (pas de faux bandeau).
 * @param {...{excludedLines:number, excludedUnits:number}} parts
 * @returns {{lines:number, units:number}|null}
 */
export function sumPerimeterExclusions(...parts) {
  let lines = 0
  let units = 0
  for (const p of parts) {
    lines += Number(p?.excludedLines) || 0
    units += Number(p?.excludedUnits) || 0
  }
  return lines > 0 ? { lines, units: Math.round(units * 100) / 100 } : null
}

/**
 * Noms catalogue par id, pour les clés que le comptage ne nomme pas.
 * @param {object} params
 * @param {Array<{id:string,name:string}>} [params.menuItems]
 * @param {Array<{id:string,itemName:string}>} [params.marketPrices]
 * @param {Array<{id:string,name:string}>} [params.components]
 * @returns {Record<string,string>}
 */
export function buildCatalogNameById({ menuItems = [], marketPrices = [], components = [] } = {}) {
  const out = {}
  const put = (id, name) => {
    if (id == null || !name) return
    const k = String(id)
    if (!out[k]) out[k] = String(name).trim()
  }
  // Menu item prioritaire sur une collision d'id, même règle que le backend
  // (`resolveItemKeysByIds`) ; premier vu gagne ensuite.
  for (const mi of menuItems || []) put(mi?.id, mi?.name)
  for (const mp of marketPrices || []) put(mp?.id, mp?.itemName || mp?.name)
  for (const c of components || []) put(c?.id, c?.name)
  return out
}
