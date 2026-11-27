// Pastilles sélectionnables des barres KPI (barre du haut et barre de widgets) du rapport J+1.
// Les clés sont celles des `kind` déjà utilisés par Analyse pour ouvrir les graphes.

export const KPI_BAR_KEYS = Object.freeze([
  'revenue', 'avg-revenue', 'cost', 'transactions', 'avg-trans', 'attendees', 'transformation', 'percap',
])
export const WIDGET_BAR_KEYS = Object.freeze([
  'revenue-per-tpe', 'revenue-per-collaborator', 'margin', 'transaction-rate', 'stock-value',
])

const KEYS_BY_KIND = { 'kpi-bar': KPI_BAR_KEYS, 'widget-bar': WIDGET_BAR_KEYS }

export const isChipKind = (kind) => Object.prototype.hasOwnProperty.call(KEYS_BY_KIND, kind)

/** Liste de clés -> valeur d'option plate (les options d'un slot n'acceptent que des valeurs simples). */
export function serializeChipKeys(kind, keys) {
  const known = KEYS_BY_KIND[kind] || []
  return known.filter((k) => keys.includes(k)).join(',')
}

/** Option stockée -> liste de clés ; vide ou absente = [] (toutes les pastilles, ancien comportement). */
export function parseChipKeys(kind, value) {
  const known = KEYS_BY_KIND[kind] || []
  const wanted = String(value || '').split(',').map((s) => s.trim()).filter(Boolean)
  return known.filter((k) => wanted.includes(k))
}

/** Garde les pastilles choisies, dans l'ordre d'origine ; sans choix valide, tout est gardé. */
export function pickChips(kind, items, value) {
  const keys = parseChipKeys(kind, value)
  if (!keys.length) return items
  const kept = items.filter((it) => keys.includes(it.key))
  return kept.length ? kept : items
}

/** Clé de pastille -> clé i18n de son libellé (mêmes libellés que les pastilles d'Analyse). */
export const CHIP_LABEL_KEYS = Object.freeze({
  revenue: 'anHeaderKpiRevenue',
  'avg-revenue': 'anHeaderKpiAvgPerEvent',
  cost: 'anHeaderKpiCost',
  transactions: 'anHeaderKpiTransactions',
  'avg-trans': 'anHeaderKpiBasket',
  attendees: 'anHeaderKpiAttendees',
  transformation: 'anHeaderKpiTransformation',
  percap: 'anHeaderKpiPerCap',
  'revenue-per-tpe': 'anKpiCardRevenuePerTpe',
  'revenue-per-collaborator': 'anKpiCardRevenuePerCollaborator',
  margin: 'anKpiCardMargin',
  'transaction-rate': 'anKpiCardTransactionRate',
  'stock-value': 'anKpiCardStockValue',
})

/** Pastilles choisies, en clair (« CA, Coût ») ; chaîne vide si l'option est absente (= toutes). */
export function describeChips(kind, value, t) {
  return parseChipKeys(kind, value).map((k) => t(CHIP_LABEL_KEYS[k])).join(', ')
}
