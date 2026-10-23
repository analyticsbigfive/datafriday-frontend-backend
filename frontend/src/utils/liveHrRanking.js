// Onglet RH du Live : classement des PdV par rythme de ventes récent, effectif par rôle et
// avancement du CA face au CA prévu. Fonctions pures, aucune dépendance à Vue ni à l'API.
//
// Correspondance des identifiants (vérifiée dans le backend) : `shopId` des lignes live
// (event-timeline et transaction-baskets) = COALESCE(spaceElementId, weezeventLocationId),
// `elementId` du staffing = SpaceElement.id, `shopId` de EventPredictVersion.predictedRecords
// = id du PdV de la même famille. Les trois se joignent donc directement sur cette clé.
import { minuteLocalMinus } from '@/utils/liveDelta'

const num = (v) => Number(v) || 0

export const TX_WINDOW_MINUTES = 3

/** Dernière minute locale présente dans les paniers, ou null. */
function latestBasketMinute(basketRows) {
  let latest = null
  for (const b of basketRows || []) {
    if (b?.minuteLocal && (!latest || b.minuteLocal > latest)) latest = b.minuteLocal
  }
  return latest
}

/**
 * Minutes de la fenêtre, de la plus ancienne à la plus récente. La dernière minute connue est
 * encore en cours d'agrégation tant que l'event est live : elle est alors exclue pour ne pas
 * sous-estimer le rythme. Les minutes sans vente comptent pour 0 (calendrier, pas lignes).
 */
export function windowMinutes(basketRows, { excludeLatest = false, size = TX_WINDOW_MINUTES } = {}) {
  const latest = latestBasketMinute(basketRows)
  if (!latest) return []
  const end = excludeLatest ? minuteLocalMinus(latest, 1) : latest
  const minutes = []
  for (let i = size - 1; i >= 0; i--) minutes.push(minuteLocalMinus(end, i))
  return minutes.every(Boolean) ? minutes : []
}

/** { [shopId]: { name, perMinute: number[], total, avg } } sur la fenêtre donnée. */
export function txPerMinuteByShop(basketRows, minutes) {
  const index = new Map(minutes.map((m, i) => [m, i]))
  const out = new Map()
  for (const b of basketRows || []) {
    const i = index.get(b.minuteLocal)
    if (i === undefined) continue
    if (!out.has(b.shopId)) out.set(b.shopId, { name: b.shopName, perMinute: minutes.map(() => 0), total: 0, avg: 0 })
    const s = out.get(b.shopId)
    const c = num(b.transactionCount)
    s.perMinute[i] += c
    s.total += c
  }
  for (const s of out.values()) s.avg = minutes.length ? s.total / minutes.length : 0
  return out
}

/** Noms de PdV connus par id, tous flux confondus (paniers, timeline). */
function shopNames(basketRows, timelineRows) {
  const names = new Map()
  for (const r of [...(timelineRows || []), ...(basketRows || [])]) {
    if (r?.shopId && r.shopName && !names.has(r.shopId)) names.set(r.shopId, r.shopName)
  }
  return names
}

/** CA réalisé par PdV depuis le grain article (même champ que buildShopTotals). */
export function realizedRevenueByShop(timelineRows) {
  const out = new Map()
  for (const r of timelineRows || []) {
    out.set(r.shopId, (out.get(r.shopId) || 0) + num(r.revenueHt ?? r.revenue))
  }
  return out
}

/**
 * Effectif par PdV et par rôle, lignes activées seulement.
 * @returns {Map<string, { name: string, roles: Array<{ roleName: string, count: number }>, total: number }>}
 */
export function staffByElement(elements) {
  const out = new Map()
  for (const el of elements || []) {
    const counts = new Map()
    for (const line of el.lines || []) {
      if (!line.enabled) continue
      const role = line.roleName || ''
      counts.set(role, (counts.get(role) || 0) + 1)
    }
    const roles = [...counts.entries()]
      .map(([roleName, count]) => ({ roleName, count }))
      .sort((a, b) => b.count - a.count || a.roleName.localeCompare(b.roleName))
    out.set(el.elementId, { name: el.elementName, roles, total: roles.reduce((s, r) => s + r.count, 0) })
  }
  return out
}

/** Avancement en % (non borné : 130 % reste 130), null si aucun CA prévu exploitable. */
export function progressPercent(realized, predicted) {
  const p = num(predicted)
  if (p <= 0) return null
  return (num(realized) / p) * 100
}

/**
 * Lignes du classement, triées par rythme décroissant puis CA réalisé puis nom.
 * Un PdV figure s'il a un CA prévu ou des ventes enregistrées ; la barre n'existe que s'il y a un CA prévu.
 */
export function buildHrRows({ basketRows, timelineRows, staffElements, predictedByShop, excludeLatest = false }) {
  const minutes = windowMinutes(basketRows, { excludeLatest })
  const tx = txPerMinuteByShop(basketRows, minutes)
  const staff = staffByElement(staffElements)
  const realized = realizedRevenueByShop(timelineRows)
  const names = shopNames(basketRows, timelineRows)
  const soldShops = new Set((basketRows || []).filter((b) => num(b.transactionCount) > 0).map((b) => b.shopId))
  const predicted = predictedByShop || {}

  const ids = new Set([...staff.keys(), ...realized.keys(), ...names.keys(), ...Object.keys(predicted)])
  const rows = []
  for (const id of ids) {
    const t = tx.get(id)
    const st = staff.get(id)
    const hasPredicted = num(predicted[id]) > 0
    const realizedRevenue = realized.get(id) || 0
    // Sans CA prévu ni aucune vente enregistrée en live, le PdV n'apporte rien : on ne l'affiche pas.
    if (!hasPredicted && realizedRevenue === 0 && !soldShops.has(id)) continue
    rows.push({
      shopId: id,
      name: st?.name || names.get(id) || t?.name || id,
      perMinute: t ? t.perMinute : minutes.map(() => 0),
      avg: t ? t.avg : 0,
      roles: st ? st.roles : [],
      staffTotal: st ? st.total : 0,
      hasStaff: !!st && st.total > 0,
      realizedRevenue,
      predictedRevenue: hasPredicted ? num(predicted[id]) : 0,
      percent: progressPercent(realizedRevenue, predicted[id]),
    })
  }
  rows.sort((a, b) => b.avg - a.avg || b.realizedRevenue - a.realizedRevenue || a.name.localeCompare(b.name))
  return { rows, minutes }
}
