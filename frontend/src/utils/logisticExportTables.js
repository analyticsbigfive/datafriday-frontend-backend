// Tableaux d'export de l'écran Logistique (bouton imprimer, maquette Bertrand du
// 2026-10-09) : la liste AFFICHÉE, filtres compris, mise à plat pour
// utils/tableExport.js. Fonctions PURES : libellés et lectures de stock injectés.

import { splitGroupRows, groupDepositGroupsByShop, VENTILATION_VIEW_BY_SHOP } from '@/utils/ventilationViews'

/**
 * Ventilation : une ligne par destination × article ayant quelque chose à déposer
 * (les stockages listés à 0 pour le bouton « + » ne sont pas des données).
 * @param {object} p
 * @param {Array} p.groups groupes par article affichés (recherche et fournisseur appliqués)
 * @param {Array<{id,name}>} p.storages stockages du périmètre
 * @param {'shop'|'item'} p.mode bascule Par PdV / Par article
 * @param {(key:string)=>string} p.t
 * @param {(item, quantity, packs)=>string} p.quantityLabel
 * @param {(item)=>string} p.packSizeLabel
 * @param {(itemName:string)=>Array<{name:string}>} p.suppliersOf
 * @param {string} p.title
 * @param {string} [p.subtitle]
 */
export function ventilationExportTable({ groups, storages, mode, t, quantityLabel, packSizeLabel, suppliersOf, title, subtitle }) {
  const typeLabel = (row) => (row.elementType === 'storage' ? t('logiTabStorage') : t('logiExportShop'))
  const toRow = (item, row) => ({
    destination: row.shopName,
    type: typeLabel(row),
    item: item.itemName,
    packaging: packSizeLabel(item),
    toDeposit: quantityLabel(item, row.quantity, row.packs),
    quantity: row.quantity,
    unit: item.unit || '',
    supplier: suppliersOf(item.itemName).map((s) => s.name).join(', '),
  })
  const rows = []
  if (mode === VENTILATION_VIEW_BY_SHOP) {
    const cards = groupDepositGroupsByShop(groups, storages)
    for (const card of [...cards.shops, ...cards.storages]) {
      for (const entry of card.items) if (entry.row.quantity > 0) rows.push(toRow(entry, entry.row))
    }
  } else {
    for (const group of groups || []) {
      const { shops, storages: storageRows } = splitGroupRows(group, storages)
      for (const row of [...shops, ...storageRows]) if (row.quantity > 0) rows.push(toRow(group, row))
    }
  }
  const destinationFirst = mode === VENTILATION_VIEW_BY_SHOP
  const columns = [
    ...(destinationFirst
      ? [{ key: 'destination', label: t('logiExportDestination') }, { key: 'type', label: t('logiExportType') }, { key: 'item', label: t('logiExportItem') }]
      : [{ key: 'item', label: t('logiExportItem') }, { key: 'destination', label: t('logiExportDestination') }, { key: 'type', label: t('logiExportType') }]),
    { key: 'packaging', label: t('logiExportPackaging') },
    { key: 'toDeposit', label: t('logiExportToDeposit') },
    { key: 'quantity', label: t('logiExportQuantity') },
    { key: 'unit', label: t('logiExportUnit') },
    { key: 'supplier', label: t('logiSupplierFilter') },
  ]
  return { title, subtitle, columns, rows }
}

/**
 * Onglets de stock (Boutiques F&B, Stockage, By Item) : une ligne par élément × article.
 * @param {object} p
 * @param {Array<{element:{id,name}, items:Array}>} p.entries éléments affichés
 * @param {boolean} [p.byItem] onglet By Item : article en première colonne, tri par article
 * @param {(entry)=>Array} p.itemsFor articles affichés d'un élément (filtres appliqués)
 * @param {(elementId, item)=>{packed:number, loose:number}} p.expectedFor stock attendu
 * @param {(elementId, item)=>'ok'|'warn'|'bad'} p.statusFor
 * @param {(elementId, item)=>number|null} [p.needFor] « À déposer » du match
 * @param {(key:string)=>string} p.t
 * @param {string} p.title
 * @param {string} [p.subtitle]
 */
export function stockExportTable({ entries, byItem = false, itemsFor, expectedFor, statusFor, needFor, t, title, subtitle }) {
  const statusLabel = { ok: t('logiExportStatusOk'), warn: t('logiRowLowStock'), bad: t('logiRowRuptures') }
  const rows = []
  for (const entry of entries || []) {
    for (const item of itemsFor(entry)) {
      const expected = expectedFor(entry.element.id, item) || { packed: 0, loose: 0 }
      const need = needFor ? needFor(entry.element.id, item) : null
      rows.push({
        element: entry.element.name,
        item: item.name,
        packed: expected.packed,
        loose: expected.loose,
        unit: item.unit || '',
        status: statusLabel[statusFor(entry.element.id, item)] || '',
        toDeposit: need == null ? '' : need,
      })
    }
  }
  if (byItem) rows.sort((a, b) => a.item.localeCompare(b.item, 'fr') || a.element.localeCompare(b.element, 'fr'))
  const elementCol = { key: 'element', label: t('logiExportDestination') }
  const itemCol = { key: 'item', label: t('logiExportItem') }
  const columns = [
    ...(byItem ? [itemCol, elementCol] : [elementCol, itemCol]),
    { key: 'packed', label: t('logiExportStockPacks') },
    { key: 'loose', label: t('logiExportStockUnits') },
    { key: 'unit', label: t('logiExportUnit') },
    { key: 'status', label: t('logiExportStatus') },
    ...(needFor ? [{ key: 'toDeposit', label: t('logiExportToDeposit') }] : []),
  ]
  return { title, subtitle, columns, rows }
}
