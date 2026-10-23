// Découpe une quantité totale (unités de base) en packs + vrac pour pré-remplir
// le drawer de réarmement. Pur, sans dépendance au composant.

import { ceilForUnit } from '@/utils/stockPlanning'

const EPS = 1e-9

function floorForUnit(value, unit) {
  const u = String(unit || '').toLowerCase()
  if (u === 'pcs' || u === 'pc' || u === 'piece' || u === 'pieces') return Math.floor(value + EPS)
  return Math.floor(value * 10 + EPS) / 10
}

/**
 * @param {number} total quantité voulue en unités de base
 * @param {Object} [opts]
 * @param {number|null} [opts.unitsPerPack] absent/0 : tout en vrac
 * @param {string} [opts.unit]
 * @param {{packed:number, loose:number}|null} [opts.cap] disponible à l'origine
 * @returns {{packed:number, loose:number, total:number, capped:boolean}}
 */
export function splitRestockQuantity(total, { unitsPerPack, unit, cap } = {}) {
  const wanted = Number(total)
  if (!(wanted > 0)) return { packed: 0, loose: 0, total: 0, capped: false }
  const upp = Number(unitsPerPack) > 0 ? Number(unitsPerPack) : 0

  let q = ceilForUnit(wanted, unit)
  let capped = false
  if (cap) {
    const capPacked = Math.max(0, Number(cap.packed) || 0)
    const capLoose = Math.max(0, Number(cap.loose) || 0)
    const capTotal = upp ? capPacked * upp + capLoose : capLoose
    if (q > capTotal + EPS) {
      q = floorForUnit(capTotal, unit)
      capped = true
    }
  }
  if (!(q > 0)) return { packed: 0, loose: 0, total: 0, capped }

  if (!upp) return { packed: 0, loose: Math.round(q * 100) / 100, total: q, capped }

  let packed = Math.floor(q / upp + EPS)
  if (cap) packed = Math.min(packed, Math.max(0, Math.floor(Number(cap.packed) || 0)))
  const loose = Math.round((q - packed * upp) * 100) / 100
  return { packed, loose, total: q, capped }
}
