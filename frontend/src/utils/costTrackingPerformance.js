/**
 * Cost tracking : section « Performance des <niveau> » de la colonne de droite.
 * Tri par variation en %, recherche par nom, montant affiché. Fonctions pures (sans Vue ni DOM).
 */

/** Hausses d'abord (de la plus forte hausse à la plus forte baisse), ou baisses d'abord. */
export const PERFORMANCE_SORTS = ['up', 'down']

/** Clé i18n du titre de section selon le mode affiché (types, catégories, articles, ingrédients...). */
const TITLE_KEYS = {
  type: 'ctPerfTitleType',
  category: 'ctPerfTitleCategory',
  article: 'ctPerfTitleArticle',
  ingredient: 'ctPerfTitleIngredient',
  component: 'ctPerfTitleComponent',
  supplier: 'ctPerfTitleSupplier',
}

export function performanceTitleKey(level) {
  return TITLE_KEYS[level] || TITLE_KEYS.article
}

/** Minuscules sans accents ni espaces de bord, pour comparer des noms. */
export function normalizeSearch(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Lignes ayant une variation chiffrée, filtrées par nom (`query`, insensible à la casse et aux accents)
 * puis triées par variation en % : 'up' = plus forte hausse en premier, 'down' = plus forte baisse en premier.
 * À variation égale, ordre alphabétique (tri stable). Ne modifie pas `rows`.
 */
export function performanceRows(rows, sort = 'up', query = '') {
  const q = normalizeSearch(query)
  const factor = sort === 'down' ? 1 : -1
  return (rows || [])
    .filter((r) => r?.variation && typeof r.variation.pct === 'number')
    .filter((r) => !q || normalizeSearch(r.name).includes(q))
    .sort((a, b) => factor * (a.variation.pct - b.variation.pct) || String(a.name ?? '').localeCompare(String(b.name ?? '')))
}

/** Plus forte variation absolue (%) des lignes, base des barres (au moins 1 pour éviter une division par zéro). */
export function maxAbsPct(rows) {
  return Math.max(1e-9, ...(rows || []).map((r) => Math.abs(r?.variation?.pct ?? 0)))
}

/** Valeur principale d'une carte : `amount` s'il est fourni sur la ligne, sinon le coût actuel. */
export function primaryAmount(row) {
  return typeof row?.amount === 'number' ? row.amount : row?.currentCost
}
