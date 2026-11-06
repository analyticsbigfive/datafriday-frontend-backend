// Transferts Container HK vers PDV (tâches logistiques) à partir des groupes
// « À déposer » de la Ventilation. Fonctions PURES, sans accès au store.
//
// Règles (validées avec Ulrich, 2026-11-06) :
//   - colis ENTIERS, du type de colis de l'article (fût, carton, caisse...) ;
//   - le stock source est réparti PDV par PDV (ordre alphabétique des groupes) ;
//   - un manque n'est jamais comblé : il est listé en `shortages` (à commander),
//     sans tâche ;
//   - stock source inconnu ou article sans colis : listé en `unknown`, aucune
//     tâche et aucun chiffre inventé ;
//   - `reservedPacks` (besoin propre du stockage source) vaut 0 par défaut : la
//     règle « colis gardé » n'est appliquée que si l'appelant la fournit.

const wholePacks = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0)

/**
 * @param {object} p
 * @param {Array} p.groups groupes de groupDepositLinesByItem
 * @param {(itemKey:string) => number|null} p.sourcePacks colis entiers en stock à la source (null = inconnu)
 * @param {(itemKey:string) => number} [p.reservedPacks] colis gardés par la source
 * @returns {{transfers:Array, shortages:Array, unknown:Array}}
 */
export function buildTransfers({ groups = [], sourcePacks = () => null, reservedPacks = () => 0 } = {}) {
  const transfers = []
  const shortages = []
  const unknown = []
  for (const group of groups || []) {
    if (!group) continue
    const stock = sourcePacks(group.itemKey)
    const rows = (group.rows || []).filter((r) => r && r.packs != null && Number(r.packs) > 0)
    if (!rows.length) {
      // Ligne à déposer sans nombre de colis : pas de transfert chiffrable.
      if ((group.rows || []).some((r) => Number(r.quantity) > 0)) {
        unknown.push({ itemKey: group.itemKey, itemName: group.itemName, reason: 'no-pack' })
      }
      continue
    }
    if (stock == null) {
      unknown.push({ itemKey: group.itemKey, itemName: group.itemName, reason: 'no-stock' })
      continue
    }
    let left = Math.max(0, wholePacks(stock) - wholePacks(reservedPacks(group.itemKey)))
    for (const row of rows) {
      const need = wholePacks(row.packs)
      const given = Math.min(need, left)
      left -= given
      const base = {
        itemKey: group.itemKey,
        itemName: group.itemName,
        packagingType: group.packagingType ?? null,
        unitsPerPack: group.unitsPerPack ?? null,
        shopId: row.shopId,
        shopName: row.shopName,
      }
      if (given > 0) transfers.push({ ...base, packs: given })
      if (need > given) shortages.push({ ...base, packs: need - given })
    }
  }
  return { transfers, shortages, unknown }
}

/**
 * Lignes du lot `POST spaces/:spaceId/logistic-tasks/batch`.
 * @param {Array} transfers sortie de buildTransfers
 * @param {object} p
 * @param {string} p.sourceElementId stockage source
 * @param {(transfer:object) => string} p.assigneeFor logisticien de la tâche
 * @param {string} [p.priority]
 * @param {(itemKey:string) => ({refKind?:string, id?:string}|null)} [p.itemRef]
 */
export function toTaskLines(transfers, { sourceElementId, assigneeFor, priority = 'TODO', itemRef = () => null } = {}) {
  return (transfers || []).map((t) => {
    const ref = itemRef(t.itemKey)
    return {
      itemKey: t.itemKey,
      ...(ref?.refKind ? { itemKind: ref.refKind, itemRefId: ref.id } : {}),
      sourceElementId,
      destinationElementId: t.shopId,
      packed: t.packs,
      loose: 0,
      assignedToUserId: assigneeFor(t),
      priority,
    }
  })
}

/** Clé stable d'un transfert (choix du logisticien par PDV). */
export const transferKey = (t) => `${t.shopId}::${t.itemKey}`

/**
 * Colis gardés par le stockage source pour son besoin propre : la ligne « À déposer »
 * du stockage source lui-même (aucun chiffre inventé : sans ligne, rien n'est gardé).
 * @param {Array} groups groupes de groupDepositLinesByItem (stockages inclus)
 * @param {string} sourceId
 * @returns {(itemKey:string) => number}
 */
export function ownNeedPacks(groups, sourceId) {
  const byItem = new Map()
  for (const g of groups || []) {
    const row = (g.rows || []).find((r) => r && String(r.shopId) === String(sourceId))
    if (row) byItem.set(g.itemKey, wholePacks(row.packs))
  }
  return (itemKey) => byItem.get(itemKey) || 0
}

/**
 * Bloc de synthèse du stockage source, par article dont le stock est lisible :
 * en stock, gardé, disponible pour les PDV, déposé, restant transférable, à commander.
 * @param {object} p
 * @param {Array} p.groups groupes destination (hors stockages)
 * @param {{transfers:Array, shortages:Array}} p.result sortie de buildTransfers
 * @param {(itemKey:string) => number|null} p.sourcePacks
 * @param {(itemKey:string) => number} [p.reservedPacks]
 */
export function summarizeSource({ groups = [], result, sourcePacks, reservedPacks = () => 0 }) {
  const sum = (list, key) =>
    (list || []).filter((t) => t.itemKey === key).reduce((n, t) => n + Number(t.packs || 0), 0)
  const out = []
  for (const g of groups || []) {
    const stockRaw = sourcePacks(g.itemKey)
    if (stockRaw == null) continue
    const stock = wholePacks(stockRaw)
    const reserved = Math.min(stock, wholePacks(reservedPacks(g.itemKey)))
    const available = stock - reserved
    const deposited = sum(result.transfers, g.itemKey)
    out.push({
      itemKey: g.itemKey,
      itemName: g.itemName,
      packagingType: g.packagingType ?? null,
      stock,
      reserved,
      available,
      deposited,
      left: Math.max(0, available - deposited),
      toOrder: sum(result.shortages, g.itemKey),
    })
  }
  return out
}
