// Stock de départ de la réconciliation post-event, résolu PAR PdV (BUG-378-02).
//
// Jusqu'ici une seule source pour tout le document : le comptage pré-event du
// match, sinon le post-event du match précédent, sinon rien. Deux défauts :
//   1. un comptage pré-event PARTIEL (5 PdV sur 41) fabriquait un départ de 0
//      sur les 36 autres : « absent du blob » était lu comme « compté à 0 » ;
//   2. le registre Logistic, pourtant la source d'attendu des écrans depuis le
//      PDF v3 du 2026-08-21 (« attendu = Total Logistic »), n'était jamais
//      consulté. Un espace qui tient sa Logistique sans faire de comptage
//      pré-event n'avait donc jamais de Restant.
//
// Règle par PdV compté, dans l'ordre :
//   - le PdV figure dans le comptage pré-event → départ = pré-event,
//     `left = pré-event − vendu + mouvements` (formule §14.3, inchangée) ;
//   - sinon, attendu Logistic disponible et non contaminé → `left = attendu`
//     (ventes et mouvements déjà nettés par le registre, c'est le chiffre
//     « Doit rester » de l'écran de comptage) ;
//   - sinon, rien : Restant/Manquant null, PdV compté dans `uncovered`.
//
// « Contaminé » : le registre a déjà été recalé depuis un comptage POST-event
// de cet event (`holdsPostEventCount`, marqueur BUG-352-01) ; il porte alors le
// comptage d'arrivée et `attendu − compté` vaudrait 0 partout.
//
// Fonctions PURES.

const toUnits = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** PdV présents dans un blob `{ elementId: { itemId: ... } }`. */
function elementIdsOfBlob(blob) {
  return new Set(Object.keys(blob && typeof blob === 'object' ? blob : {}))
}

/**
 * Aplatit `expectedUnits` du GET post-event-baseline en `reconciliationKey → unités`.
 * @param {Record<string, Record<string, number>>|null} blob
 * @param {(elementId:string, itemId:string)=>string} keyOf
 * @returns {Record<string, number>|null}
 */
export function flattenLogisticExpected(blob, keyOf) {
  if (!blob || typeof blob !== 'object') return null
  const out = {}
  for (const [elementId, byItem] of Object.entries(blob)) {
    for (const [itemId, units] of Object.entries(byItem || {})) {
      const n = Number(units)
      if (Number.isFinite(n)) out[keyOf(elementId, itemId)] = n
    }
  }
  return out
}

/**
 * Répartit les PdV comptés entre les sources de stock de départ.
 *
 * @param {object} params
 * @param {Set<string>} params.countedElementIds       PdV du périmètre compté
 * @param {object|null} params.preEventBlob            `inventoryCounts` du comptage pré-event (ou repli)
 * @param {Record<string, number>|null} params.logisticLeftByKey  attendu Logistic aplati
 * @param {boolean} params.logisticUsable              false si le registre est contaminé
 * @param {(key:string)=>string} params.elementOfKey   extrait l'elementId d'une clé
 * @returns {{
 *   preEventElementIds: Set<string>,
 *   logisticLeftByKey: Record<string, number>|null,
 *   fallbackElementIds: Set<string>,
 *   uncoveredElementIds: Set<string>,
 * }}
 *   `logisticLeftByKey` ne garde que les clés des PdV en repli (jamais un PdV
 *   déjà couvert par le pré-event, jamais un PdV hors périmètre).
 */
export function splitBaselineByElement({
  countedElementIds = new Set(),
  preEventBlob = null,
  logisticLeftByKey = null,
  logisticUsable = true,
  elementOfKey = (k) => k.slice(0, k.indexOf('|')),
} = {}) {
  const preEventElementIds = elementIdsOfBlob(preEventBlob)
  const logisticElementIds = new Set()
  if (logisticUsable && logisticLeftByKey) {
    for (const k of Object.keys(logisticLeftByKey)) logisticElementIds.add(elementOfKey(k))
  }

  const fallbackElementIds = new Set()
  const uncoveredElementIds = new Set()
  for (const elementId of countedElementIds) {
    if (preEventElementIds.has(elementId)) continue
    if (logisticElementIds.has(elementId)) fallbackElementIds.add(elementId)
    else uncoveredElementIds.add(elementId)
  }

  let kept = null
  if (fallbackElementIds.size) {
    kept = {}
    for (const [k, units] of Object.entries(logisticLeftByKey)) {
      if (fallbackElementIds.has(elementOfKey(k))) kept[k] = toUnits(units)
    }
  }

  return { preEventElementIds, logisticLeftByKey: kept, fallbackElementIds, uncoveredElementIds }
}

/**
 * Provenance archivable du stock de départ (`meta.baseline`).
 * @param {object} params
 * @param {string} params.preEventSource  'pre-event' | 'previous-post-event' | 'none'
 * @param {Set<string>} params.fallbackElementIds
 * @param {Set<string>} params.uncoveredElementIds
 * @returns {{source:string, fallback:{source:string, elements:number}|null, uncoveredElements:number}}
 */
export function describeBaseline({ preEventSource = 'none', fallbackElementIds, uncoveredElementIds } = {}) {
  const fallbackCount = fallbackElementIds?.size || 0
  const uncovered = uncoveredElementIds?.size || 0
  // Aucun comptage pré-event mais un repli Logistic sur au moins un PdV : la
  // source du document EST le registre.
  const source = preEventSource === 'none' && fallbackCount ? 'logistic-live' : preEventSource
  return {
    source,
    fallback: source !== 'logistic-live' && fallbackCount ? { source: 'logistic-live', elements: fallbackCount } : null,
    uncoveredElements: uncovered,
  }
}
