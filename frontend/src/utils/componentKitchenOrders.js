// Onglet « Composants par cuisine » de l'étape 3 (feuille de course) de la page
// Commandes : les composants (MenuComponent) à commander, regroupés par cuisine.
//
// Tout est pur et testable sans monter SpaceRestockView. La vue ne fait que
// fournir les lignes de l'étape 1, le catalogue des composants et la map
// « À commander » déjà affichée à l'étape 1 (vivante, ou figée si un plan est
// chargé) : aucune quantité n'est recalculée ici.

import { resolveComponentDef } from '@/utils/inventoryUtils'

export const KITCHEN_KIND_LOCAL = 'local'
export const KITCHEN_KIND_CENTRAL = 'central'
export const KITCHEN_KIND_UNDEFINED = 'undefined'

const norm = (s) => String(s ?? '').trim().toLowerCase()

/**
 * Cuisine d'un composant du catalogue (champs du MenuComponent) :
 *  - kitchenType 'Local' → Cuisine locale ;
 *  - kitchenType 'Central' avec un nom (relation `kitchen`, sinon cuisine
 *    retrouvée par `kitchenId` dans `kitchens`) → cette cuisine ;
 *  - tout le reste → cuisine non définie.
 */
export function resolveComponentKitchen(def, kitchens = []) {
  if (def?.kitchenType === 'Local') return { kind: KITCHEN_KIND_LOCAL, id: null, name: '' }
  if (def?.kitchenType === 'Central') {
    const id = def.kitchen?.id ?? def.kitchenId ?? null
    const fromList = id != null ? (kitchens || []).find((k) => String(k?.id) === String(id)) : null
    const name = String(def.kitchen?.name || fromList?.name || '').trim()
    if (name) return { kind: KITCHEN_KIND_CENTRAL, id: id != null ? String(id) : null, name }
  }
  return { kind: KITCHEN_KIND_UNDEFINED, id: null, name: '' }
}

/**
 * Lignes d'étape 1 qui sont des composants, avec une quantité « À commander » > 0.
 * Identification identique à `buildRecipeCoeffs` (restockPlanSnapshot) :
 * `resolveComponentDef` sur le catalogue, lignes stockage exclues. Un article
 * décoché ou sans quantité figée est absent de `orderByItem` → écarté.
 *
 * @returns {Array<{ itemKey, itemName, unit, quantity, kitchen, source }>}
 */
export function collectComponentOrders({ rows = [], components = [], orderByItem = {}, kitchens = [] } = {}) {
  const out = []
  const seen = new Set()
  for (const row of rows || []) {
    if (!row || row.itemKey == null || seen.has(row.itemKey)) continue
    if (row.elementType === 'storage') continue
    const raw = orderByItem ? orderByItem[row.itemKey] : null
    if (raw == null) continue
    const quantity = Number(raw)
    if (!Number.isFinite(quantity) || !(quantity > 0)) continue
    const def = resolveComponentDef(
      { sourceId: row.sourceId ?? row.itemId ?? null, name: row.itemName },
      components,
    )
    if (!def) continue
    seen.add(row.itemKey)
    out.push({
      itemKey: row.itemKey,
      itemName: row.itemName,
      unit: row.unit,
      quantity,
      kitchen: resolveComponentKitchen(def, kitchens),
      source: row,
    })
  }
  return out
}

function groupKey(kitchen) {
  if (kitchen.kind === KITCHEN_KIND_LOCAL) return 'local'
  if (kitchen.kind === KITCHEN_KIND_UNDEFINED) return 'undefined'
  return `kitchen:${kitchen.id ?? norm(kitchen.name)}`
}

/**
 * Regroupe par cuisine : Cuisine locale, puis les cuisines par ordre
 * alphabétique, puis Cuisine non définie en dernier. Lignes triées par nom.
 * `labels` = { local, undefined } (textes i18n) ; `search` filtre sur le nom du
 * composant ou le nom de la cuisine (une cuisine qui matche garde ses lignes).
 *
 * @returns {Array<{ key, kind, name, rows }>}
 */
export function groupComponentOrdersByKitchen(orders = [], { labels = {}, search = '' } = {}) {
  const q = norm(search)
  const groups = new Map()
  for (const order of orders) {
    const kind = order.kitchen.kind
    const name =
      kind === KITCHEN_KIND_LOCAL
        ? labels.local || ''
        : kind === KITCHEN_KIND_UNDEFINED
          ? labels.undefined || ''
          : order.kitchen.name
    if (q && !norm(name).includes(q) && !norm(order.itemName).includes(q)) continue
    const key = groupKey(order.kitchen)
    if (!groups.has(key)) groups.set(key, { key, kind, name, rows: [] })
    groups.get(key).rows.push(order)
  }
  const rank = (g) => (g.kind === KITCHEN_KIND_LOCAL ? 0 : g.kind === KITCHEN_KIND_CENTRAL ? 1 : 2)
  return Array.from(groups.values())
    .map((g) => ({ ...g, rows: [...g.rows].sort((a, b) => String(a.itemName).localeCompare(String(b.itemName))) }))
    .sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)))
}

/**
 * Habille les groupes cuisine à la forme d'un groupe fournisseur de l'étape 3
 * ({ supplierId, supplierName, supplierEmail, supplierPhone, items }), pour que
 * la carte, l'e-mail, l'appel, l'export CSV et l'impression soient ceux des
 * fournisseurs, la cuisine jouant le rôle du fournisseur. Les coordonnées
 * viennent de la fiche Kitchen (email, tel) retrouvée par id ; Cuisine locale
 * et Cuisine non définie n'ont pas de fiche : coordonnées vides (boutons
 * désactivés).
 *
 * Chaque ligne porte `quantityLabel` / `quantitySub` (libellé colis de l'étape 1,
 * déjà formaté dans `orderMain` / `orderSub`) : aucune quantité recalculée.
 */
export function buildKitchenShoppingGroups(groups = [], kitchens = []) {
  return (groups || []).map((group) => {
    const card =
      group.kind === KITCHEN_KIND_CENTRAL && group.rows[0]?.kitchen?.id != null
        ? (kitchens || []).find((k) => String(k?.id) === String(group.rows[0].kitchen.id))
        : null
    return {
      supplierId: group.key,
      supplierName: group.name,
      supplierEmail: String(card?.email || '').trim(),
      supplierPhone: String(card?.tel || '').trim(),
      items: group.rows.map((row) => ({
        itemKey: row.itemKey,
        itemName: row.itemName,
        itemType: 'Component',
        unit: row.unit,
        quantity: row.quantity,
        quantityLabel: row.orderMain,
        quantitySub: row.orderSub || '',
        shopNames: row.shopNames || [],
      })),
    }
  })
}
