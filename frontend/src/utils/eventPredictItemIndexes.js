// Index mémoïsés de la vue « Par article » d'Event Predict (BUG-390-02).
//
// Avant, chaque carte recalculait à chaque rendu : un filtre sur tous les PDV
// (PDV cochés pour l'article) et un Set des articles du Space Menu par PDV
// (342 cartes × 36 PDV constructions par rendu). Ces fonctions pures
// construisent les index une seule fois ; EventPredictMenusSection les expose
// en computed. Sémantique strictement identique aux anciennes méthodes.

/**
 * Map(menuItemId → PDV cochés pour cet article), dans l'ordre de `elements`.
 * Équivaut à `elements.filter((el) => (selected[el.id] || []).includes(id))` :
 * un PDV n'apparaît qu'une fois même si l'id est en double dans sa sélection,
 * et la clé garde le type d'origine (Map et includes comparent pareil).
 */
export function buildSelectedElementsByMenuItem(elements, selectedMenuItems) {
  const map = new Map()
  const sel = selectedMenuItems || {}
  for (const element of elements || []) {
    if (!element) continue
    const ids = sel[element.id]
    if (!Array.isArray(ids) || !ids.length) continue
    const seen = new Set()
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      let arr = map.get(id)
      if (!arr) {
        arr = []
        map.set(id, arr)
      }
      arr.push(element)
    }
  }
  return map
}

/**
 * Map(élément → Set des ids de son Space Menu | null si non chargé).
 * Clé = l'objet élément lui-même (les cartes reçoivent les mêmes objets que
 * `fbElements`). `assignedItemsFor(element)` = résolution historique par nom
 * normalisé puis id. Les Set sont partagés : ne jamais les muter.
 */
export function buildAssignedIdSetByElement(elements, assignedItemsFor) {
  const map = new Map()
  for (const element of elements || []) {
    map.set(element, assignedIdSetFromItems(assignedItemsFor(element)))
  }
  return map
}

export function assignedIdSetFromItems(arr) {
  return Array.isArray(arr) ? new Set(arr.map((it) => it.id)) : null
}

/**
 * Entrées réellement montées par le rendu progressif : les `count` premières,
 * plus celles qui ne doivent pas disparaître hors de la tranche :
 *  - entrée traitée sous un chip (BUG-315-01, `_chipTreated`), qui peut
 *    changer de groupe (« Non rattachés » ↔ menu) donc de position ;
 *  - entrée dont le tiroir latéral est ouvert (`keepIds`).
 * L'ordre de la liste est conservé. `_isFirstUnmapped` est recalculé sur la
 * liste visible pour que l'en-tête « Non rattachés » reste au bon endroit.
 */
export function sliceVisibleEntries(entries, count, keepIds) {
  const list = Array.isArray(entries) ? entries : []
  const visible = []
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (i < count || e._chipTreated || (keepIds && keepIds.has(e.menuItemId))) visible.push(e)
  }
  let headerPlaced = false
  return visible.map((e) => {
    const first = !headerPlaced && e._mapGroup === 'unmapped'
    if (first) headerPlaced = true
    return e._isFirstUnmapped === first ? e : { ...e, _isFirstUnmapped: first }
  })
}
