// Cadence de vente réelle vs prédictive (onglet Inventaire live).
//
// Spec Bertrand : pct = (vendu - prévu_à_m) / prévu_à_m x 100 à la minute courante m
// (positif = on vend plus vite que prévu), par PdV x élément d'inventaire.
//
// APPROXIMATION ASSUMÉE : la version Event Predict ne porte qu'un total prédit par
// PdV x Menu Item (sans minute) et une courbe par minute GLOBALE (tous PdV et articles).
// On applique donc la cadence globale à chaque ligne : fraction cumulée
// f(m) = (somme des q de la courbe jusqu'à m) / (somme totale des q), puis
// prévu_à_m d'une ligne = prévu total de la ligne x f(m). Le profil horaire propre à
// un PdV ou à un article n'est pas connu.
//
// Module PUR : il fabrique des records au grain Menu Item que `buildPredictedNeedIndex`
// convertit au grain inventaire (même explosion recettes que le restant). Courbe absente
// ou prévu_à_m = 0 : cadence null, rien de fabriqué.

import { hasPredictedTimeline } from '@/utils/predictedTimelineSnapshot'
import { parseMinuteToken } from '@/utils/timelineBucketing'

const DATED_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
const pad = (n) => String(n).padStart(2, '0')

/** Clé minute (HH:MM ou datée) -> { ord, kind, label } ; ord comparable au sein d'un même kind. */
function parseKey(key) {
  const s = String(key ?? '')
  const d = DATED_RE.exec(s)
  if (d) {
    const ord = Date.UTC(+d[1], +d[2] - 1, +d[3], +d[4], +d[5]) / 60000
    return { ord, kind: 'dated', label: `${d[4]}:${d[5]}` }
  }
  const t = parseMinuteToken(s)
  if (t == null) return null
  return { ord: t, kind: 'hhmm', label: `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}` }
}

/** Date locale -> même forme que les clés de la courbe (datée ou HH:MM). */
function nowOrd(now, kind) {
  const d = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(d.getTime())) return null
  if (kind === 'dated') {
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) / 60000
  }
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Fraction cumulée de la courbe prédite à la minute courante (bornée à la plage).
 * @returns {{fraction:number, minuteLabel:string}|null} null si courbe absente/vide
 */
export function cumulativeFraction(snapshot, now = new Date()) {
  if (!hasPredictedTimeline(snapshot)) return null
  const pts = []
  for (let i = 0; i < snapshot.m.length; i += 1) {
    const k = parseKey(snapshot.m[i])
    const q = Number(snapshot.q[i])
    if (k) pts.push({ ...k, q: Number.isFinite(q) && q > 0 ? q : 0 })
  }
  if (!pts.length) return null
  const total = pts.reduce((a, p) => a + p.q, 0)
  if (!(total > 0)) return null
  const ord = nowOrd(now, pts[0].kind)
  if (ord == null) return null
  const first = pts[0]
  const last = pts[pts.length - 1]
  const clamped = Math.min(Math.max(ord, first.ord), last.ord)
  let cum = 0
  let label = first.label
  for (const p of pts) {
    if (p.ord > clamped) break
    cum += p.q
    label = p.label
  }
  // Avant la première minute : rien n'est encore prévu (fraction 0 sur la minute bornée).
  if (ord < first.ord) cum = 0
  return { fraction: Math.min(1, cum / total), minuteLabel: label }
}

/**
 * Records « prévu à m » et « vendu » (un par PdV x Menu Item), à passer chacun à
 * `buildPredictedNeedIndex`. `fullRecords` = records prédits ajustés complets
 * (buildRemainingRecords sans ventes) ; `soldFn(shop, record)` renvoie le vendu.
 */
export function buildCadenceRecords({ fullRecords = [], shops = [], fraction, soldFn }) {
  const shopById = new Map(shops.map((s) => [String(s.id), s]))
  const predictedAtM = []
  const sold = []
  for (const r of fullRecords) {
    const atM = (Number(r.totalQuantity) || 0) * fraction
    if (atM > 0) predictedAtM.push({ ...r, totalQuantity: atM, isManual: true })
    const shop = shopById.get(String(r.shopId))
    const s = shop ? Number(soldFn(shop, r)) || 0 : 0
    if (s > 0) sold.push({ ...r, totalQuantity: s, isManual: true })
  }
  return { predictedAtM, sold }
}

/** Bande d'un pourcentage déjà arrondi à l'entier. */
export function cadenceBand(pct) {
  if (pct <= 0) return 'ok'
  if (pct <= 20) return 'orange'
  if (pct <= 40) return 'red'
  return 'violet'
}

/**
 * Calcul final au grain inventaire. null si prévu_à_m <= 0 ou données invalides.
 * @returns {null|{pct:number, band:string, minuteLabel:string, soldUnits:number,
 *   predictedToMinuteUnits:number, remainingUnits:number,
 *   remainingAtSameCadenceUnits:number, toRestockUnits:number}}
 */
export function computeCadence({ soldUnits, predictedToMinuteUnits, remainingUnits, minuteLabel }) {
  const sold = Number(soldUnits) || 0
  const pred = Number(predictedToMinuteUnits) || 0
  const rem = Math.max(0, Number(remainingUnits) || 0)
  if (!(pred > 0)) return null
  const raw = ((sold - pred) / pred) * 100
  const pct = Math.round(raw) + 0 // évite -0
  const same = rem * (1 + raw / 100)
  return {
    pct,
    band: cadenceBand(pct),
    minuteLabel,
    soldUnits: sold,
    predictedToMinuteUnits: pred,
    remainingUnits: rem,
    remainingAtSameCadenceUnits: Math.max(0, same),
    toRestockUnits: Math.max(0, same - rem),
  }
}
