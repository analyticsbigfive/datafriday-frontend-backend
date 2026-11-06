// Porte le circuit de réarmement (reçu / cédé / prélevé en réserve) sur les lignes PDV
// vivantes, pour qu'il soit figé dans la feuille (freezeRestockLine) et relu par la
// Ventilation de Logistic. Module pur : aucun import Vue, aucune mutation des entrées.
//
// Chaque ligne reçoit, seulement si le circuit la concerne :
//   - received / ceded / fromStorage : quantités en unités de la ligne ;
//   - receivedFrom : [{ shopId, shopName, packs, quantity, remainingFromLogistic }],
//     d'où vient ce que le PDV reçoit (un élément par PDV cédant) ;
//   - remainingFromLogistic : le restant de la ligne vient de Logistic (et non du
//     comptage inventaire). Il est aussi porté par chaque cédant de receivedFrom,
//     car un PDV cédant n'a pas de ligne dans la feuille (rien à déposer).

import { circuitFlowKey } from '@/utils/restockCircuitDisplay'

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * @param {Array} sheetRows lignes de la feuille (PDV et lignes de stockage)
 * @param {object} p
 * @param {Array} p.allRows toutes les lignes PDV vivantes (cédants compris)
 * @param {Object<string, object>} p.flowByShopRow flux par `${shopId}|||${itemKey}`
 * @param {Object<string, Array>} p.transfersByItem itemKey -> [{fromShopId,toShopId,quantity,packs}]
 */
export function attachCircuitFlow(sheetRows, { allRows = [], flowByShopRow = {}, transfersByItem = {} } = {}) {
  const byRow = new Map()
  for (const r of allRows || []) {
    if (r) byRow.set(circuitFlowKey(r.shopId, r.itemKey), r)
  }
  return (sheetRows || []).map((row) => {
    if (!row || row.elementType === 'storage') return row
    const flow = (flowByShopRow || {})[circuitFlowKey(row.shopId, row.itemKey)]
    const out = { ...row }
    if (row.remainingFromLogistic == null) {
      const own = byRow.get(circuitFlowKey(row.shopId, row.itemKey))
      if (own && own.remainingFromLogistic != null) out.remainingFromLogistic = !!own.remainingFromLogistic
    }
    if (!flow) return out
    out.received = num(flow.received)
    out.ceded = num(flow.ceded)
    out.fromStorage = num(flow.fromStorage)
    const merged = new Map()
    for (const tr of (transfersByItem || {})[row.itemKey] || []) {
      if (String(tr.toShopId) !== String(row.shopId)) continue
      const id = String(tr.fromShopId)
      const donor = byRow.get(circuitFlowKey(tr.fromShopId, row.itemKey))
      const cur = merged.get(id) || {
        shopId: id,
        shopName: donor?.shopName || '',
        packs: 0,
        quantity: 0,
        remainingFromLogistic: !!donor?.remainingFromLogistic,
      }
      cur.packs += num(tr.packs)
      cur.quantity += num(tr.quantity)
      merged.set(id, cur)
    }
    if (merged.size) out.receivedFrom = [...merged.values()]
    return out
  })
}
