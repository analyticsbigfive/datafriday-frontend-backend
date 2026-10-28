// Catalogue des éléments placables sur la page 2 du rapport J+1 (contrat partagé du chantier,
// voir docs/chantiers/report_j1_page2/PLAN.md). Source unique : kinds, variantes, tailles
// (colonnes x rangées) et clés i18n de libellé. Aucune logique de rendu ici.

export const GRID_COLS = 2
export const GRID_ROWS = 3

export const REPORT_J1_KINDS = Object.freeze({
  'kpi-bar': { w: 2, h: 1, labelKey: 'rj1KindKpiBar', variants: [] },
  'widget-bar': { w: 2, h: 1, labelKey: 'rj1KindWidgetBar', variants: [] },
  donut: {
    w: 1,
    h: 1,
    labelKey: 'rj1KindDonut',
    variants: [
      'shop',
      'shopType',
      'shopArea',
      'articleType',
      'articleCategory',
      'displayName',
      'industrial',
      'brand',
      'supplier',
      'promotion',
      'promotionType',
      'basketMix',
      'basketMixItem',
    ],
  },
  'perf-table': { w: 1, h: 2, labelKey: 'rj1KindPerfTable', variants: ['shops', 'events', 'items'] },
  'revenue-bars': { w: 2, h: 2, labelKey: 'rj1KindRevenueBars', variants: [] },
  'items-by-shop': { w: 2, h: 2, labelKey: 'rj1KindItemsByShop', variants: [] },
})

/** Libellés i18n par variante (clé de traduction). */
export const REPORT_J1_VARIANT_LABEL_KEYS = Object.freeze({
  shop: 'anPieByShopTitle',
  shopType: 'anPieByTypeTitle',
  shopArea: 'anPieByAreaTitle',
  articleType: 'anByItemType',
  articleCategory: 'anByItemCategory',
  displayName: 'anTopItemsByRevenue',
  industrial: 'anByIndustrial',
  brand: 'anByBrand',
  supplier: 'anSupplierCost',
  promotion: 'anPromoYesNo',
  promotionType: 'anPromoType',
  basketMix: 'anTxMixByCategoryTitle',
  basketMixItem: 'anTxMixByItemTitle',
  shops: 'anShopPerformance',
  events: 'anEventsPerformance',
  items: 'anItemPerformance',
})

export function isKnownKind(kind) {
  return Object.prototype.hasOwnProperty.call(REPORT_J1_KINDS, kind)
}

export function isKnownVariant(kind, variant) {
  if (!isKnownKind(kind)) return false
  const variants = REPORT_J1_KINDS[kind].variants
  return variants.length === 0 ? variant == null : variants.includes(variant)
}

/** Taille { w, h } d'un kind, ou null s'il est inconnu. */
export function sizeOf(kind) {
  const def = isKnownKind(kind) ? REPORT_J1_KINDS[kind] : null
  return def ? { w: def.w, h: def.h } : null
}

/** Clé i18n du libellé d'un élément : variante si elle existe, sinon kind. */
export function labelKeyOf(kind, variant) {
  if (variant && REPORT_J1_VARIANT_LABEL_KEYS[variant]) return REPORT_J1_VARIANT_LABEL_KEYS[variant]
  return isKnownKind(kind) ? REPORT_J1_KINDS[kind].labelKey : ''
}
