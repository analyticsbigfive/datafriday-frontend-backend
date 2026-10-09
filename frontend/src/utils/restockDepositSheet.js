// Feuille « à déposer » des logisticiens (vue Ventilation de Logistic, demande
// Bertrand du 2026-10-08), tirée de la feuille de réarmement sauvegardée.
//
// Source unique pour Logistic : la vue Ventilation, la colonne « À déposer » des
// fiches PdV et la vue By Item lisent toutes ces lignes, pour ne jamais afficher
// deux chiffres différents pour le même dépôt.
//
// Une ligne reste « à déposer » tant que :
//   - sa quantité, corrections manuelles comprises (`lineOverrides`, mêmes règles
//     que l'écran Réarmement via `applyPlanEdits`), est strictement positive ;
//   - elle n'est pas cochée « réarmé » dans l'écran Réarmement (`restockedRows`,
//     booléen par `rowKey`, enregistré sur la feuille) ;
//   - les dépôts « Ventilation » déjà confirmés pour ce match (mouvements Logistic,
//     GET /logistics/:spaceId/ventilation-deposits) ne la couvrent pas entièrement.
//     Un dépôt partiel laisse la ligne avec le reste à déposer.

import { applyPlanEdits, recomputePackaging } from '@/utils/restockPlanSnapshot'
import { packSizeForPackaging } from '@/utils/stockPlanning'
import { normalizeStr } from '@/utils/predictiveAnalytics'
import { depositGroupKey, isStorageRestockLine } from '@/utils/storageRestockLines'

const EPSILON = 1e-9

function depositKey(elementId, itemName) {
  return `${elementId}::${normalizeStr(itemName)}`
}

/**
 * Cumul des dépôts en unités de l'article, par destination × nom normalisé
 * (Logistic identifie un article par son NOM, comme useLogisticRemaining).
 * Les packs sont convertis avec `unitsPerPack` du dépôt (niveau Logistic) ;
 * à défaut, la ligne de la feuille fournira son conditionnement.
 */
function indexDeposits(deposits) {
  const map = new Map()
  for (const d of deposits || []) {
    if (!d?.elementId || !d?.itemKey) continue
    const key = depositKey(d.elementId, d.itemKey)
    const cur = map.get(key) || { packed: 0, loose: 0, unitsPerPack: null }
    cur.packed += Number(d.packed) || 0
    cur.loose += Number(d.loose) || 0
    if (!cur.unitsPerPack && Number(d.unitsPerPack) > 0) cur.unitsPerPack = Number(d.unitsPerPack)
    map.set(key, cur)
  }
  return map
}

/**
 * Lignes restant à déposer d'une feuille de réarmement complète.
 * @param {object|null} plan RestockPlan complet (GET /restock-plans/:id)
 * @param {Array<{elementId:string, itemKey:string, packed:number, loose:number,
 *   unitsPerPack?:number|null}>} [deposits] dépôts « Ventilation » du match
 * @returns {Array<object>} lignes figées (grain destination × article), quantité
 *   ramenée au reste à déposer (`restockQuantity`), packs recalculés, et
 *   `depositedQuantity` (déjà déposé sur cette ligne)
 */
export function buildDepositLines(plan, deposits = []) {
  if (!plan) return []
  const restocked = plan.restockedRows && typeof plan.restockedRows === 'object' ? plan.restockedRows : {}
  const lines = applyPlanEdits(plan.restockLines || [], plan.lineOverrides || {})
    .filter((line) => line?.shopId && Number(line.restockQuantity) > 0)
    .filter((line) => !restocked[line.rowKey])

  // Unités de dépôt encore à imputer par clé : une même destination × article
  // peut porter plusieurs lignes (feuille multi-match), consommées dans l'ordre.
  const pool = new Map()
  for (const [key, d] of indexDeposits(deposits)) pool.set(key, d)

  const out = []
  for (const line of lines) {
    const key = depositKey(line.shopId, line.itemName)
    const d = pool.get(key)
    let available = 0
    if (d) {
      // Taille d'un colis de la ligne en repli : packSizeForPackaging tient compte de
      // l'unité d'achat (purchaseUnitConversion), pas packagingUnitNumber seul.
      const upp = d.unitsPerPack || packSizeForPackaging(line.packaging) || 0
      available = (d.loose || 0) + (d.packed || 0) * upp
    }
    const quantity = Number(line.restockQuantity) || 0
    const consumed = Math.min(quantity, Math.max(0, available))
    if (d && consumed > 0) {
      // Le reste du dépôt passe à la ligne suivante, exprimé en vrac.
      pool.set(key, { packed: 0, loose: available - consumed, unitsPerPack: d.unitsPerPack })
    }
    const remaining = quantity - consumed
    if (remaining <= EPSILON) continue
    out.push(consumed > 0
      ? {
          ...line,
          restockQuantity: remaining,
          packaging: recomputePackaging(line.packaging, remaining),
          depositedQuantity: consumed,
        }
      : { ...line, depositedQuantity: 0 })
  }
  return out
}

/**
 * Regroupe les lignes par article (vue « par item » de la Ventilation), une
 * ligne par destination. Articles et destinations triés par nom.
 * @param {Array<object>} lines sortie de `buildDepositLines`
 * @returns {Array<{itemKey:string, itemName:string, unit:string|null,
 *   packagingType:string|null, unitsPerPack:number|null, totalQuantity:number,
 *   totalPacks:number|null, rows:Array<{rowKey:string, shopId:string,
 *   shopName:string, quantity:number, packs:number|null}>}>}
 */
export function groupDepositLinesByItem(lines) {
  const map = new Map()
  // Nom normalisé → clé de groupe : une ligne stockage (clé propre au stockage)
  // rejoint le groupe de l'article PDV du même nom quand il existe.
  const keyByName = new Map()
  const ordered = [...(lines || [])].sort((a, b) => Number(isStorageRestockLine(a)) - Number(isStorageRestockLine(b)))
  for (const line of ordered) {
    const nameKey = normalizeStr(line.itemName)
    const key = isStorageRestockLine(line) && keyByName.has(nameKey) ? keyByName.get(nameKey) : depositGroupKey(line)
    if (!key) continue
    if (nameKey && !keyByName.has(nameKey)) keyByName.set(nameKey, key)
    let group = map.get(key)
    if (!group) {
      group = {
        itemKey: key,
        itemName: line.itemName || key,
        unit: line.unit ?? null,
        packagingType: line.packaging?.packagingType ?? null,
        unitsPerPack: Number(line.packaging?.packagingUnitNumber) || null,
        rows: [],
      }
      map.set(key, group)
    }
    if (!group.packagingType && line.packaging?.packagingType) group.packagingType = line.packaging.packagingType
    if (!group.unitsPerPack && line.packaging?.packagingUnitNumber) group.unitsPerPack = Number(line.packaging.packagingUnitNumber) || null
    const rawPacks = line.packaging?.packedCount
    const packs = Number.isFinite(Number(rawPacks)) && rawPacks != null ? Number(rawPacks) : null
    const quantity = Number(line.restockQuantity) || 0
    const part = { rowKey: line.rowKey, planId: line.planId ?? null, quantity }
    // Même destination sur plusieurs feuilles (plusieurs matchs choisis) : une seule
    // ligne, dont les parts gardent chaque feuille pour répartir le dépôt.
    const existing = group.rows.find((r) => r.shopId === String(line.shopId))
    if (existing) {
      existing.quantity += quantity
      existing.packs = existing.packs != null && packs != null ? existing.packs + packs : null
      existing.parts.push(part)
      continue
    }
    group.rows.push({
      rowKey: line.rowKey,
      elementType: line.elementType || null,
      shopId: String(line.shopId),
      shopName: line.shopName || '',
      quantity,
      packs,
      parts: [part],
    })
  }
  return [...map.values()]
    .map((group) => {
      const rows = [...group.rows].sort((a, b) => a.shopName.localeCompare(b.shopName, 'fr'))
      return { ...group, rows, ...summarizeDepositRows(rows) }
    })
    .sort((a, b) => a.itemName.localeCompare(b.itemName, 'fr'))
}

/**
 * Totaux d'un groupe d'article à partir de ses lignes.
 * @param {Array<{quantity:number, packs:number|null}>} rows
 * @returns {{totalQuantity:number, totalPacks:number|null}}
 */
export function summarizeDepositRows(rows) {
  const totalQuantity = rows.reduce((sum, r) => sum + r.quantity, 0)
  // Total en packs seulement si TOUTES les lignes ont un nombre de packs :
  // additionner des packs et des lignes sans conditionnement mentirait.
  const totalPacks = rows.every((r) => r.packs != null) ? rows.reduce((sum, r) => sum + r.packs, 0) : null
  return { totalQuantity, totalPacks }
}

/**
 * Index des tailles de pack Logistic (destination × nom normalisé), depuis la
 * réponse invité `packSizes` ou les niveaux de l'écran Logistique.
 * @param {Array<{elementId:string, itemName:string, unitsPerPack:number|null}>} packSizes
 * @returns {(elementId:string, itemName:string) => number|null}
 */
export function packSizeLookup(packSizes) {
  const map = new Map()
  for (const p of packSizes || []) {
    if (p?.elementId && Number(p.unitsPerPack) > 0) map.set(depositKey(p.elementId, p.itemName), Number(p.unitsPerPack))
  }
  return (elementId, itemName) => map.get(depositKey(elementId, itemName)) ?? null
}

/**
 * Pré-remplissage du drawer de dépôt, même règle sur l'écran Logistique et la page
 * des logisticiens : les packs saisis sont enregistrés avec la taille de pack
 * LOGISTIC de la destination, on part donc de la quantité restante convertie avec
 * cette taille quand elle est connue ; sinon, les packs décidés au réarmement.
 * @param {{quantity:number, packs:number|null}} row ligne de groupDepositLinesByItem
 * @param {number|null} logisticUnitsPerPack taille de pack Logistic de la destination
 * @param {number|null} [sheetUnitsPerPack] taille du colis de la feuille (repli d'affichage)
 */
export function depositPrefill(row, logisticUnitsPerPack, sheetUnitsPerPack = null) {
  const upp = Number(logisticUnitsPerPack) > 0 ? Number(logisticUnitsPerPack) : null
  if (upp) return { packs: Math.ceil((Number(row?.quantity) || 0) / upp), unitsPerPack: upp }
  return { packs: row?.packs ?? null, unitsPerPack: Number(sheetUnitsPerPack) > 0 ? Number(sheetUnitsPerPack) : null }
}
