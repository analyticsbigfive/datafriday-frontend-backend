/**
 * comparisonDeltas : écarts d'un rapport A par rapport à un rapport de référence B,
 * à partir de deux snapshots normalisés (cf. comparisonReportSnapshot.js).
 *
 * Appeler computeReportDeltas(drawer, principal) donne l'écart affiché dans le drawer ;
 * computeReportDeltas(principal, drawer) donne l'écart réciproque affiché dans le principal.
 *
 * Règles (décisions 3, 11 et 12 du SPEC) : % partout, marge en POINTS, coûts inversés
 * (une hausse est rouge), référence nulle ou absente = « — » (kind 'none'), article ou
 * valeur absent de la référence = « nouveau » (kind 'new'), écart sous 0,5 = gris.
 *
 * Chaque écart est un objet Delta :
 *   { kind: 'delta'|'new'|'same'|'none', delta: number|null, unit: '%'|'pts',
 *     invert: boolean, tone: 'good'|'bad'|'neutral', text: string, isNew: boolean }
 * `text` est déjà formaté (« ▲ 4,2 % », « — »). 'same' ne sert qu'à VALO STOCK.
 */
import { pctDelta, ptsDelta, deltaTone, formatDelta } from '@/utils/analyseDeltas'
import { CHIP_KEYS, WIDGET_KEYS } from '@/utils/comparisonReportSnapshot'

/** Deux stocks du jour sont « égaux » à un demi-centime près. */
const STOCK_EQUAL_EPSILON = 0.005

/** Chips dont une hausse est mauvaise. */
const INVERTED_CHIPS = new Set(['cost'])

function build(kind, delta, unit, invert) {
  const d = kind === 'delta' ? delta : null
  return {
    kind,
    delta: d,
    unit,
    invert,
    tone: kind === 'delta' ? deltaTone(d, { invert }) : 'neutral',
    text: kind === 'delta' ? formatDelta(d, unit) : '—',
    isNew: kind === 'new',
  }
}

/** Écart de value vs ref (pourcentage, ou points avec unit 'pts'). */
export function makeDelta(value, ref, { unit = '%', invert = false } = {}) {
  const delta = unit === 'pts' ? ptsDelta(value, ref) : pctDelta(value, ref)
  return build(delta == null ? 'none' : 'delta', delta, unit, invert)
}

/** Écart « nouveau » : la valeur existe, la référence n'a pas cette ligne. */
export function newDelta(unit = '%', invert = false) {
  return build('new', null, unit, invert)
}

/** Ensemble de deltas d'un objet plat de valeurs (puces ou widgets). */
function flatDeltas(keys, a, b, options = () => ({})) {
  const out = {}
  for (const k of keys) out[k] = makeDelta(a?.[k] ?? null, b?.[k] ?? null, options(k))
  return out
}

/**
 * VALO STOCK (décision 11) : stock du jour. Valeurs égales (mêmes périmètres) = 'same'
 * (pastille « = du jour »), sinon écart en %. Une valeur absente = « — ».
 */
export function stockDelta(a, b) {
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
  if (isNum(a) && isNum(b) && Math.abs(a - b) < STOCK_EQUAL_EPSILON) {
    return { ...build('same', null, '%', false), tone: 'neutral', text: '=' }
  }
  return makeDelta(isNum(a) ? a : null, isNum(b) ? b : null)
}

/** Map clé -> Delta pour une liste [{ key, value }] ; vide si l'un des deux côtés n'est pas chargé. */
function entriesDeltas(entriesA, entriesB, { invert = false } = {}) {
  const out = new Map()
  if (!Array.isArray(entriesA) || !Array.isArray(entriesB)) return out
  const ref = new Map(entriesB.map((e) => [e.key, e.value]))
  for (const e of entriesA) {
    out.set(e.key, ref.has(e.key) ? makeDelta(e.value, ref.get(e.key), { invert }) : newDelta('%', invert))
  }
  return out
}

const DIM_KEYS = ['item', 'type', 'category', 'industrial', 'brand', 'promotion', 'promotionType']

function dimsDeltas(a, b) {
  const out = {}
  for (const k of DIM_KEYS) out[k] = entriesDeltas(a?.[k], b?.[k])
  return out
}

const SHOP_DIM_KEYS = ['shop', 'type', 'area']

/** Écarts de la répartition par PdV / type de PdV / zone, pour un mode (CA ou quantité). */
function shopDimsDeltas(a, b) {
  const out = {}
  for (const k of SHOP_DIM_KEYS) out[k] = entriesDeltas(a?.[k], b?.[k])
  return out
}

/** Cellules du tableau Article par PdV, appariées par PdV puis par article. */
function itemsByShopDeltas(listA, listB) {
  const out = new Map()
  const refShops = new Map((listB || []).map((s) => [s.name, s]))
  for (const shop of listA || []) {
    const refShop = refShops.get(shop.name)
    const items = new Map()
    if (!refShop) {
      for (const it of shop.items) {
        items.set(it.key, { avgQuantity: newDelta(), quantity: newDelta(), events: newDelta(), isNew: true })
      }
      out.set(shop.name, {
        isNew: true,
        shop: { avg: newDelta(), total: newDelta(), events: newDelta() },
        items,
      })
      continue
    }
    const refItems = new Map(refShop.items.map((it) => [it.key, it]))
    for (const it of shop.items) {
      const ref = refItems.get(it.key)
      items.set(it.key, ref
        ? {
          avgQuantity: makeDelta(it.avgQuantity, ref.avgQuantity),
          quantity: makeDelta(it.quantity, ref.quantity),
          events: makeDelta(it.events, ref.events),
          isNew: false,
        }
        : { avgQuantity: newDelta(), quantity: newDelta(), events: newDelta(), isNew: true })
    }
    out.set(shop.name, {
      isNew: false,
      shop: {
        avg: makeDelta(shop.avg, refShop.avg),
        total: makeDelta(shop.total, refShop.total),
        events: makeDelta(shop.events, refShop.events),
      },
      items,
    })
  }
  return out
}

/**
 * @param {object|null} reportA  snapshot du rapport dont on veut l'écart
 * @param {object|null} reportB  snapshot de référence
 * @returns {object|null} null si l'un des snapshots manque
 */
export function computeReportDeltas(reportA, reportB) {
  if (!reportA || !reportB) return null
  const widgets = flatDeltas(WIDGET_KEYS, reportA.widgets, reportB.widgets, (k) => (k === 'margin' ? { unit: 'pts' } : {}))
  widgets.stockValue = stockDelta(reportA.widgets?.stockValue ?? null, reportB.widgets?.stockValue ?? null)
  const bd = (r) => r.breakdowns || {}
  return {
    chips: flatDeltas(CHIP_KEYS, reportA.chips, reportB.chips, (k) => ({ invert: INVERTED_CHIPS.has(k) })),
    widgets,
    categories: entriesDeltas(reportA.categories, reportB.categories),
    breakdowns: {
      revenue: dimsDeltas(bd(reportA).revenue, bd(reportB).revenue),
      quantity: dimsDeltas(bd(reportA).quantity, bd(reportB).quantity),
      supplierCost: entriesDeltas(bd(reportA).supplierCost, bd(reportB).supplierCost, { invert: true }),
    },
    // Remise accordée : une hausse est une dépense en plus, donc inversée comme un coût.
    discount: makeDelta(bd(reportA).discount?.amount ?? null, bd(reportB).discount?.amount ?? null, { invert: true }),
    // Répartition des PdV par CA (camemberts PdV / type / zone) : une Map clé -> Delta par dimension.
    shopDistribution: {
      revenue: shopDimsDeltas(reportA.shopDistribution?.revenue, reportB.shopDistribution?.revenue),
      quantity: shopDimsDeltas(reportA.shopDistribution?.quantity, reportB.shopDistribution?.quantity),
    },
    itemsByShop: itemsByShopDeltas(reportA.itemsByShop, reportB.itemsByShop),
    sections: {
      shopChartRevenue: makeDelta(reportA.sections?.shopChartRevenue ?? null, reportB.sections?.shopChartRevenue ?? null),
      articleDistributionRevenue: makeDelta(
        reportA.sections?.articleDistributionRevenue ?? null, reportB.sections?.articleDistributionRevenue ?? null,
      ),
      itemsByShopRevenue: makeDelta(reportA.sections?.itemsByShopRevenue ?? null, reportB.sections?.itemsByShopRevenue ?? null),
    },
  }
}
