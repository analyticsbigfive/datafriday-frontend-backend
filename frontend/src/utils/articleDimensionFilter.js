/**
 * Filtres des dimensions article « rendement » (marque, industriel, fournisseur,
 * promotion, type de promotion) appliqués aux records article.
 *
 * Même règle d'or que analyseDimensions.js : le donut qui regroupe et le filtre qui
 * restreint lisent la MÊME ventilation (expandToLeaves), sinon clic -> filtre = 0 ligne.
 * Un record passe le filtre fournisseur si sa recette (ou celle de ses enfants de combo)
 * contient ce fournisseur.
 */
import {
  NOT_SET_KEY,
  PROMO_YES_KEY,
  PROMO_NO_KEY,
  expandToLeaves,
  recordMenuItemId,
  isPromoRecord,
} from '@/utils/articleDimensionBreakdown'

/** Clés de filtre ajoutées au store analyse. */
export const ARTICLE_DIMENSION_FILTER_KEYS = [
  'selectedBrands',
  'selectedIndustrials',
  'selectedSuppliers',
  'selectedPromotions',
  'selectedPromotionTypes',
]

/** Au moins un filtre « dimension article » est actif. */
export function hasArticleDimensionFilter(filters) {
  const f = filters || {}
  return ARTICLE_DIMENSION_FILTER_KEYS.some((k) => Array.isArray(f[k]) && f[k].length > 0)
}

/** Ensembles de valeurs (marques, industriels, fournisseurs) portés par un article, combo ventilé. */
function valueSetsFor(id, index) {
  const brands = new Set()
  const industrials = new Set()
  const suppliers = new Set()
  for (const leaf of expandToLeaves(id, index, { includeSelf: true })) {
    const dim = leaf.dim
    if (!leaf.self) {
      brands.add(dim?.brandName || NOT_SET_KEY)
      const shares = dim?.industrialShares
      if (Array.isArray(shares) && shares.length) for (const s of shares) industrials.add(s?.name || NOT_SET_KEY)
      else industrials.add(NOT_SET_KEY)
    }
    for (const c of dim?.supplierCosts || []) suppliers.add(c?.name || NOT_SET_KEY)
  }
  return { brands, industrials, suppliers }
}

/**
 * Prédicat sur un record article. `index` null (endpoint A pas encore répondu) ou aucun
 * filtre actif : tout passe, car filtrer sans la donnée viderait la page pendant le chargement.
 * @param {Object} filters état des filtres du store analyse
 * @param {Map|null} index Map menuItemId -> ArticleDimension
 * @returns {((record: Object) => boolean)|null} null si rien à filtrer
 */
export function buildArticleDimensionPredicate(filters, index) {
  if (!index || !hasArticleDimensionFilter(filters)) return null
  const set = (key) => (filters[key]?.length ? new Set(filters[key]) : null)
  const brandSel = set('selectedBrands')
  const indSel = set('selectedIndustrials')
  const supSel = set('selectedSuppliers')
  const promoSel = set('selectedPromotions')
  const promoTypeSel = set('selectedPromotionTypes')
  const cache = new Map()
  const sets = (id) => {
    if (!cache.has(id)) cache.set(id, valueSetsFor(id, index))
    return cache.get(id)
  }
  const intersects = (selection, values) => {
    for (const v of values) if (selection.has(v)) return true
    return false
  }
  return (r) => {
    const id = recordMenuItemId(r)
    if (promoSel) {
      const key = isPromoRecord(r, index) ? PROMO_YES_KEY : PROMO_NO_KEY
      if (!promoSel.has(key)) return false
    }
    if (promoTypeSel) {
      const promo = id != null ? index.get(id)?.promotion : null
      if (!promo || !promoTypeSel.has(promo.typeName || NOT_SET_KEY)) return false
    }
    if (brandSel || indSel || supSel) {
      // Record sans article résolu : marque et industriel « Non renseigné », aucun fournisseur.
      const s = id != null ? sets(id) : { brands: new Set([NOT_SET_KEY]), industrials: new Set([NOT_SET_KEY]), suppliers: new Set() }
      if (brandSel && !intersects(brandSel, s.brands)) return false
      if (indSel && !intersects(indSel, s.industrials)) return false
      if (supSel && !intersects(supSel, s.suppliers)) return false
    }
    return true
  }
}
