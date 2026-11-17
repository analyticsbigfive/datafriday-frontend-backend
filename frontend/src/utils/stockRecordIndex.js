// Index des records de prédiction par menu item, pour les calculs de réarmement
// et de demande (`buildStockRequirements`, `buildMenuItemDemand`).
//
// Problème résolu : pour chaque couple (PdV, menu item), ces calculs balayaient
// TOUS les records trois fois (échantillon, quantité prédite, manuel pur). Avec
// 250 records, 94 menu items et 15 PdV, c'était des centaines de milliers de
// comparaisons par calcul, et la page Commandes en lance une dizaine au
// chargement. L'index regroupe les records par id de menu item : un couple ne
// parcourt plus que les quelques records de SON menu item.
//
// Règles de conception :
//  - construit UNE FOIS PAR APPEL à partir du tableau reçu, jamais conservé
//    entre deux appels (pas de cache global : aucune donnée périmée possible) ;
//  - chaque liste garde l'ordre d'origine des records, donc la somme des
//    quantités s'additionne dans le même ordre qu'avec le balayage complet
//    (même résultat flottant) et l'échantillon est le même record ;
//  - la clé garde son type d'origine (Map = égalité SameValueZero, identique à
//    `===` pour toutes les valeurs que `getRecordMenuItemId` peut renvoyer : le
//    seul écart, NaN, est falsy donc jamais renvoyé).

import {
  getRecordMenuItemId,
  getRecordQuantity,
  shopRecordMatchesElement,
} from './stockRecordMatching'

const EMPTY = Object.freeze([])

/**
 * @param {Array<object>|null|undefined} records records de prédiction
 * @returns {{
 *   findSample: (element: object, menuItemId: *) => (object|undefined),
 *   getPredictedQuantity: (element: object, menuItemId: *) => number,
 *   isManualOnly: (element: object, menuItemId: *) => boolean,
 *   summarize: (element: object, menuItemId: *) =>
 *     { sample: (object|undefined), quantity: number, manualOnly: boolean },
 * }}
 */
export function createStockRecordIndex(records) {
  const byMenuItemId = new Map()
  for (const record of records || []) {
    const key = getRecordMenuItemId(record)
    const bucket = byMenuItemId.get(key)
    if (bucket) bucket.push(record)
    else byMenuItemId.set(key, [record])
  }

  const bucketOf = (menuItemId) => byMenuItemId.get(menuItemId) || EMPTY

  /**
   * Premier record (ordre d'origine) de ce menu item qui matche le PdV :
   * équivalent de `records.find((r) => getRecordMenuItemId(r) === id &&
   * shopRecordMatchesElement(r, element))`.
   */
  function findSample(element, menuItemId) {
    for (const record of bucketOf(menuItemId)) {
      if (shopRecordMatchesElement(record, element)) return record
    }
    return undefined
  }

  /**
   * Équivalent exact de `getPredictedQuantityForElement` : somme, dans l'ordre
   * d'origine, des quantités des records de ce menu item qui matchent le PdV.
   */
  function getPredictedQuantity(element, menuItemId) {
    let sum = 0
    for (const record of bucketOf(menuItemId)) {
      if (!shopRecordMatchesElement(record, element)) continue
      sum = sum + getRecordQuantity(record)
    }
    return sum
  }

  /**
   * Équivalent exact de `isManualOnlyForElement` : vrai si au moins un record
   * matche et que TOUS ceux qui matchent sont `isManual === true`.
   */
  function isManualOnly(element, menuItemId) {
    let seen = false
    for (const record of bucketOf(menuItemId)) {
      if (!shopRecordMatchesElement(record, element)) continue
      if (record.isManual !== true) return false
      seen = true
    }
    return seen
  }

  /**
   * Les trois résultats en un seul parcours de la liste du menu item.
   */
  function summarize(element, menuItemId) {
    let sample
    let quantity = 0
    let seen = false
    let allManual = true
    for (const record of bucketOf(menuItemId)) {
      if (!shopRecordMatchesElement(record, element)) continue
      if (!seen) sample = record
      seen = true
      quantity = quantity + getRecordQuantity(record)
      if (record.isManual !== true) allManual = false
    }
    return { sample, quantity, manualOnly: seen && allManual }
  }

  return { findSample, getPredictedQuantity, isManualOnly, summarize }
}
