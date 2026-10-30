/**
 * Filtres Type / Catégorie / Fournisseur de l'étape 1 de Commande (réarmement).
 * Logique pure : les options sont construites à partir des lignes présentes,
 * le filtrage agit comme la recherche (la pagination suit côté vue).
 *
 * `metaByItem` : itemKey -> { typeName, categoryName, supplierName }.
 * Une valeur de filtre vide (null, '') veut dire « tous ». Une ligne sans la
 * valeur demandée est exclue dès qu'un filtre correspondant est actif.
 */

const clean = (value) => String(value ?? '').trim()

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

function sortedUnique(values) {
  const byKey = new Map()
  values.forEach((value) => {
    const text = clean(value)
    if (!text) return
    const key = text.toLowerCase()
    if (!byKey.has(key)) byKey.set(key, text)
  })
  return Array.from(byKey.values()).sort(collator.compare)
}

/** Options des trois listes, à partir des lignes de l'étape 1. */
export function buildStockFilterOptions(rows = [], metaByItem = {}) {
  const metas = (rows || []).map((row) => (metaByItem || {})[row?.itemKey] || {})
  return {
    types: sortedUnique(metas.map((m) => m.typeName)),
    categories: sortedUnique(metas.map((m) => m.categoryName)),
    suppliers: sortedUnique(metas.map((m) => m.supplierName)),
  }
}

const sameValue = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase()

/** Vrai si au moins un des trois filtres est actif. */
export function hasStockFilter(filters = {}) {
  return !!(clean(filters.type) || clean(filters.category) || clean(filters.supplier))
}

/** Garde les lignes qui satisfont tous les filtres actifs. */
export function filterStockRowsByMeta(rows = [], metaByItem = {}, filters = {}) {
  if (!hasStockFilter(filters)) return rows
  const { type, category, supplier } = filters
  return (rows || []).filter((row) => {
    const meta = (metaByItem || {})[row?.itemKey] || {}
    if (clean(type) && !sameValue(meta.typeName, type)) return false
    if (clean(category) && !sameValue(meta.categoryName, category)) return false
    if (clean(supplier) && !sameValue(meta.supplierName, supplier)) return false
    return true
  })
}

/**
 * Nom de type / catégorie d'un Market Price : référentiel dynamique (id ->
 * nom) d'abord, texte libre historique (goodType / category) en repli.
 */
export function marketPriceTypeCategory(marketPrice, types = [], categories = []) {
  if (!marketPrice) return { typeName: '', categoryName: '' }
  const typeRef = marketPrice.marketPriceTypeId
    ? (types || []).find((t) => t.id === marketPrice.marketPriceTypeId)
    : null
  const categoryRef = marketPrice.marketPriceCategoryId
    ? (categories || []).find((c) => c.id === marketPrice.marketPriceCategoryId)
    : null
  return {
    typeName: clean(typeRef?.name || marketPrice.marketPriceType?.name || marketPrice.goodType),
    categoryName: clean(categoryRef?.name || marketPrice.marketPriceCategory?.name || marketPrice.category),
  }
}
