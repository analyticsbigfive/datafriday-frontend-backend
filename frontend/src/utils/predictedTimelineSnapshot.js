// Courbe prédite par minute, figée dans la version Event Predict à la sauvegarde
// (EventPredictVersion.predictedTimeline) puis relue par le Live pour la tracer en
// fond de la timeline de l'événement en cours.
//
// Grain : UNE valeur par minute (CA + quantités, tous PdV et articles confondus).
// Le grain PdV x minute dépasserait la limite de corps de requête du backend (100 ko)
// sur un gros événement ; la courbe totale tient en quelques ko. Conséquence : le fond
// n'est pas filtrable par PdV ou par article (le Live le masque quand un filtre est actif).
//
// Format colonnaire { v:1, grain:'minute', m:[minute], q:[quantité], r:[CA] }, miroir de
// backend/src/features/events/predicted-timeline-snapshot.ts.

import { bucketMinute, bucketDatedMinute } from '@/utils/timelineBucketing'

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0)
const round2 = (x) => Math.round(x * 100) / 100

/**
 * Clé de pourcentage d'ajustement d'une ligne : même convention que le slider
 * (`${elementId}-${menuItemId}`), avec repli sur le nom d'article en minuscules.
 */
function adjustmentFactor(row, adjustments) {
  if (!adjustments) return 1
  const shopId = row.shopId || row.shop
  const itemId = row.menuItemId || row.mappedMenuItemId
  const name = row.itemName || row.menuItemName
  const keys = [
    itemId ? `${shopId}-${itemId}` : null,
    name ? `${shopId}-${String(name).toLowerCase()}` : null,
  ]
  for (const k of keys) {
    if (k && adjustments[k] != null && Number.isFinite(Number(adjustments[k]))) {
      return Number(adjustments[k]) / 100
    }
  }
  return 1
}

/**
 * Construit le snapshot par minute depuis les lignes de la timeline prédictive.
 * Applique les pourcentages d'ajustement par PdV x article, comme les totaux affichés.
 * Retourne null si rien d'exploitable (l'appelant n'envoie alors pas la clé, ce qui
 * n'écrase pas une courbe déjà enregistrée).
 *
 * @param {Array<object>} rows lignes minute x PdV x article (activeTimelineData)
 * @param {Object<string, number>} [adjustments] quantityAdjustments (pourcent, 100 = neutre)
 * @returns {{ v:1, grain:'minute', m:string[], q:number[], r:number[] }|null}
 */
export function buildPredictedTimelineSnapshot(rows, adjustments) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const byMinute = new Map()
  for (const row of rows) {
    if (!row) continue
    // Clé datée quand la source la porte, sinon HH:MM (événement non aligné).
    const key = bucketDatedMinute(row.minuteLocal ?? row.minute, 1) || bucketMinute(row.minute, 1)
    if (!key) continue
    const f = adjustmentFactor(row, adjustments)
    const cur = byMinute.get(key) || { q: 0, r: 0 }
    cur.q += num(row.totalQuantity ?? row.quantity) * f
    cur.r += num(row.totalRevenue ?? row.revenue) * f
    byMinute.set(key, cur)
  }
  if (byMinute.size === 0) return null
  const keys = [...byMinute.keys()].sort()
  return {
    v: 1,
    grain: 'minute',
    m: keys,
    q: keys.map((k) => round2(byMinute.get(k).q)),
    r: keys.map((k) => round2(byMinute.get(k).r)),
  }
}

/** True si le snapshot est exploitable (format colonnaire cohérent, au moins un point). */
export function hasPredictedTimeline(snapshot) {
  return Boolean(
    snapshot
    && Array.isArray(snapshot.m)
    && snapshot.m.length > 0
    && Array.isArray(snapshot.q)
    && Array.isArray(snapshot.r)
    && snapshot.q.length === snapshot.m.length
    && snapshot.r.length === snapshot.m.length,
  )
}

/**
 * Snapshot -> lignes lisibles par EventTimelineChart (`backgroundTimelineData`).
 * Vide si le snapshot est absent ou incohérent (anciennes versions).
 */
export function snapshotToBackgroundRows(snapshot) {
  if (!hasPredictedTimeline(snapshot)) return []
  return snapshot.m.map((m, i) => ({
    minute: bucketMinute(m, 1) || m,
    minuteLocal: bucketDatedMinute(m, 1) || null,
    totalQuantity: num(snapshot.q[i]),
    totalRevenue: num(snapshot.r[i]),
  }))
}
