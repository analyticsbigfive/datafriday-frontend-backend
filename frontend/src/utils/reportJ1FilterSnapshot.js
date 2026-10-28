// Snapshot des filtres Analyse enregistré avec un élément de la page 2 du rapport J+1.
// Liste blanche (décision 6 du plan) : on fige tout SAUF le périmètre événement/période, car le
// rapport J+1 s'applique à un seul event et ces filtres l'excluraient.

export const SNAPSHOT_KEYS = Object.freeze([
  'selectedShopIds',
  'selectedShopTypes',
  'selectedShopAreas',
  'selectedMenuItemIds',
  'selectedMenuItemTypes',
  'selectedMenuItemCategories',
  'selectedBrands',
  'selectedIndustrials',
  'selectedSuppliers',
  'selectedPromotions',
  'selectedPromotionTypes',
  'selectedTimeRange',
  'selectedConfigurationId',
])

/**
 * Copie des filtres retenus ; tableaux vides, null et plage horaire sans borne omis.
 * @param {Object} filters state.analyse.filters
 * @returns {Object}
 */
export function buildFilterSnapshot(filters) {
  const out = {}
  const src = filters || {}
  for (const k of SNAPSHOT_KEYS) {
    const v = src[k]
    if (v == null || v === '') continue
    if (Array.isArray(v)) {
      if (v.length) out[k] = [...v]
    } else if (k === 'selectedTimeRange') {
      if (v.start || v.end) out[k] = { start: v.start || null, end: v.end || null }
    } else {
      out[k] = v
    }
  }
  return out
}

// Ordre d'affichage et préfixe i18n (null = valeurs seules). Les ids de PdV et d'articles sont
// des noms dans le store Analyse (les clics de légende y posent le libellé).
const SUMMARY_PARTS = [
  { key: 'selectedMenuItemCategories', prefix: null },
  { key: 'selectedMenuItemTypes', prefix: null },
  { key: 'selectedMenuItemIds', prefix: null },
  { key: 'selectedBrands', prefix: 'rj1FilterBrand' },
  { key: 'selectedIndustrials', prefix: 'rj1FilterIndustrial' },
  { key: 'selectedSuppliers', prefix: 'rj1FilterSupplier' },
  { key: 'selectedPromotions', prefix: null },
  { key: 'selectedPromotionTypes', prefix: null },
  { key: 'selectedShopIds', prefix: 'rj1FilterShop' },
  { key: 'selectedShopTypes', prefix: 'rj1FilterShopType' },
  { key: 'selectedShopAreas', prefix: 'rj1FilterShopArea' },
]

const MAX_VALUES = 3

function valueLabel(v, t) {
  if (v === 'promo') return t('anPromoYes')
  if (v === 'normal') return t('anPromoNo')
  return String(v)
}

/**
 * Résumé court et lisible d'un snapshot, ex. « Bières, PdV Tribune Nord ».
 * @param {Object} snapshot
 * @param {(key: string) => string} t
 * @returns {string} chaîne vide si aucun filtre
 */
export function describeFilters(snapshot, t) {
  const snap = snapshot || {}
  const parts = []
  for (const { key, prefix } of SUMMARY_PARTS) {
    const list = snap[key]
    if (!Array.isArray(list) || !list.length) continue
    const shown = list.slice(0, MAX_VALUES).map((v) => valueLabel(v, t)).join(', ')
    const more = list.length > MAX_VALUES ? ` +${list.length - MAX_VALUES}` : ''
    parts.push(prefix ? `${t(prefix)} ${shown}${more}` : `${shown}${more}`)
  }
  const range = snap.selectedTimeRange
  if (range && (range.start || range.end)) {
    parts.push(`${range.start || '...'} - ${range.end || '...'}`)
  }
  return parts.join(', ')
}
