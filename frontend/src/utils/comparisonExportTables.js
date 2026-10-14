/**
 * comparisonExportTables : fonctions pures de l'export du rapport de comparaison.
 *   - buildEventAggregates : agrégat par event (CA, transactions, participants) depuis les records ;
 *   - buildDeltaTable : table « Écarts vs principal » (puces, widgets, types d'articles,
 *     chaque ligne de chaque répartition) : valeur comparaison, valeur principal, écart ;
 *   - comparisonFileBase / slugify : noms de fichiers (CSV, capture).
 * Aucune dépendance au store ni à Vue : tout est passé en paramètre.
 */
import { KPI_CHIP_DEFS } from '@/utils/comparisonReportView'
import { WIDGET_KEYS } from '@/utils/comparisonReportSnapshot'
import { shopTypeLabel } from '@/utils/shopDistribution'

const NOT_SET_KEY = '__NOT_SET__'

/** Libellés (clés i18n) des widgets, dans l'ordre du snapshot. */
const WIDGET_LABEL_KEYS = {
  revenuePerTpe: 'anKpiCardRevenuePerTpe',
  revenuePerCollaborator: 'anKpiCardRevenuePerCollaborator',
  margin: 'anKpiCardMargin',
  transactionRate: 'anKpiCardTransactionRate',
  stockValue: 'anKpiCardStockValue',
}

/** Répartitions du snapshot : [dimension, clé i18n du titre]. */
const DIMENSIONS = [
  ['item', 'anTopItemsByRevenue'],
  ['type', 'anByItemType'],
  ['category', 'anByItemCategory'],
  ['industrial', 'anByIndustrial'],
  ['brand', 'anByBrand'],
  ['promotion', 'anPromoYesNo'],
  ['promotionType', 'anPromoType'],
]

/** Répartition des PdV par CA : [dimension, clé i18n du titre du camembert]. */
const SHOP_DIMENSIONS = [
  ['shop', 'anPieByShopTitle'],
  ['type', 'anPieByTypeTitle'],
  ['area', 'anPieByAreaTitle'],
]

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100)

/** « nom-d-espace » sans accents ni ponctuation, borné à `max` caractères. */
export function slugify(text, fallback = '', max = 40) {
  const slug = String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
  return slug || fallback
}

/** AAAA-MM-JJ en heure LOCALE (pas de décalage UTC à minuit). */
export function localDay(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/**
 * Nom de fichier (sans extension) : « comparaison-<espace>[-<libellé>]-<date> ».
 * @param {{ spaceName: string, label?: string, date?: Date, predict?: boolean }} p
 */
export function comparisonFileBase({ spaceName, label = '', date = new Date(), predict = false }) {
  const parts = ['comparaison', slugify(spaceName, 'analyse'), slugify(label, '', 40), localDay(date)].filter(Boolean)
  return parts.join('-') + (predict ? '-predict' : '')
}

/**
 * Agrégat par event pour la table « CA par événement » du dataset.
 * @param {Array} events  events du rapport de comparaison
 * @param {Array} records  records au grain shop (chartRecords)
 */
export function buildEventAggregates(events, records) {
  const byEvent = new Map()
  for (const e of events || []) {
    byEvent.set(e.id, {
      eventId: e.id,
      eventName: e.name || e.eventName || e.id,
      eventDate: e.date || e.eventDate || null,
      attendees: e.ticketsScanned ?? e.attendees ?? e.ticketsSold ?? 0,
      revenue: 0,
      transactions: 0,
    })
  }
  for (const r of records || []) {
    const e = r?.eventId ? byEvent.get(r.eventId) : null
    if (!e) continue
    e.revenue += r.revenue || 0
    e.transactions += r.transactionCount || 0
  }
  return Array.from(byEvent.values()).map((e) => ({
    ...e,
    avgTransaction: e.transactions ? e.revenue / e.transactions : 0,
  }))
}

function entryLabel(key, t) {
  if (key === NOT_SET_KEY) return t('anNotSet')
  if (key === 'promo') return t('anPromoYes')
  if (key === 'normal') return t('anPromoNo')
  return String(key)
}

/** Colonnes numériques d'un écart : valeur + unité ('%', 'pts', 'nouveau', '=' ou vide). */
function deltaCells(d, t) {
  if (!d) return { delta: null, deltaUnit: '' }
  if (d.kind === 'delta') return { delta: round2(d.delta), deltaUnit: d.unit === 'pts' ? 'pts' : '%' }
  if (d.kind === 'new') return { delta: null, deltaUnit: t('anCmpExportNew') }
  if (d.kind === 'same') return { delta: null, deltaUnit: '=' }
  return { delta: null, deltaUnit: '' }
}

/**
 * Table « Écarts vs principal ». Lignes : les 8 puces, les 5 widgets, les types d'articles
 * (cartes du haut), puis chaque ligne de chaque répartition (CA et quantité), le coût
 * fournisseur et la remise. Écart en % (marge en points) ; coût et remise inversés côté couleur
 * seulement (ici l'écart est signé tel quel).
 * @param {{ snapshot: object|null, mainSnapshot: object|null, deltas: object|null, t: Function }} p
 * @returns {object|null} table { key, title, columns, rows } ou null sans snapshot
 */
export function buildDeltaTable({ snapshot, mainSnapshot, deltas, t }) {
  if (!snapshot) return null
  const rows = []
  const push = (section, label, value, ref, delta) => {
    rows.push({ section, label, comparison: round2(num(value)), main: round2(num(ref)), ...deltaCells(delta, t) })
  }

  const secChips = t('anCmpStripLabel')
  for (const def of KPI_CHIP_DEFS) {
    push(secChips, t(def.labelKey), snapshot.chips?.[def.key], mainSnapshot?.chips?.[def.key], deltas?.chips?.[def.key])
  }

  const secWidgets = t('anCmpExportSecWidgets')
  for (const k of WIDGET_KEYS) {
    push(secWidgets, t(WIDGET_LABEL_KEYS[k]), snapshot.widgets?.[k], mainSnapshot?.widgets?.[k], deltas?.widgets?.[k])
  }

  // Une répartition : lignes de la comparaison, valeur du principal retrouvée par clé.
  const pushEntries = (section, entries, mainEntries, deltaMap, labelOf = (key) => entryLabel(key, t)) => {
    if (!Array.isArray(entries)) return
    const ref = new Map((Array.isArray(mainEntries) ? mainEntries : []).map((e) => [e.key, e.value]))
    for (const e of entries) {
      push(section, labelOf(e.key), e.value, ref.has(e.key) ? ref.get(e.key) : null, deltaMap?.get?.(e.key))
    }
  }

  pushEntries(t('anCmpExportSecTypes'), snapshot.categories, mainSnapshot?.categories, deltas?.categories)

  const modes = [['revenue', t('anRevenue')], ['quantity', t('anQuantity')]]
  for (const [mode, modeLabel] of modes) {
    for (const [dim, titleKey] of DIMENSIONS) {
      pushEntries(
        `${t(titleKey)} · ${modeLabel}`,
        snapshot.breakdowns?.[mode]?.[dim],
        mainSnapshot?.breakdowns?.[mode]?.[dim],
        deltas?.breakdowns?.[mode]?.[dim],
      )
    }
  }
  // Répartition des PdV par CA : par PdV, type de PdV et zone (CA puis quantité).
  for (const [mode, modeLabel] of modes) {
    for (const [dim, titleKey] of SHOP_DIMENSIONS) {
      pushEntries(
        `${t(titleKey)} · ${modeLabel}`,
        snapshot.shopDistribution?.[mode]?.[dim],
        mainSnapshot?.shopDistribution?.[mode]?.[dim],
        deltas?.shopDistribution?.[mode]?.[dim],
        dim === 'type' ? (key) => shopTypeLabel(key, t) : (key) => String(key),
      )
    }
  }
  pushEntries(
    t('anSupplierCost'),
    snapshot.breakdowns?.supplierCost,
    mainSnapshot?.breakdowns?.supplierCost,
    deltas?.breakdowns?.supplierCost,
  )
  if (snapshot.breakdowns?.discount) {
    push(
      t('anPromotionTitle'), t('anPromotionTitle'),
      snapshot.breakdowns.discount.amount, mainSnapshot?.breakdowns?.discount?.amount, deltas?.discount,
    )
  }

  const col = (key, label, format) => ({ key, label, format })
  return {
    key: 'comparisonDeltas',
    title: t('anCmpExportSheetDeltas'),
    columns: [
      col('section', t('anCmpExportColSection')),
      col('label', t('anExportColLabel')),
      col('comparison', t('anCmpExportColComparison'), 'number'),
      col('main', t('anCmpExportColMain'), 'number'),
      col('delta', t('anCmpExportColDelta'), 'number'),
      col('deltaUnit', t('anCmpExportColDeltaUnit')),
    ],
    rows,
  }
}
