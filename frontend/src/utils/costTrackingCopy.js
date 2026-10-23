/**
 * Textes de la page Cost tracking qui dépendent du mode « Afficher par » : noms au singulier ou
 * au pluriel, aide du tableau, message de périmètre vide. Fonctions pures : les clés i18n sont
 * calculées ici, la traduction reste faite par les composants.
 */

const MODES = ['article', 'category', 'type', 'supplier', 'component', 'ingredient']

const NOUN_KEYS = {
  article: ['ctNounArticleOne', 'ctNounArticleMany'],
  category: ['ctNounCategoryOne', 'ctNounCategoryMany'],
  type: ['ctNounTypeOne', 'ctNounTypeMany'],
  supplier: ['ctNounSupplierOne', 'ctNounSupplierMany'],
  component: ['ctNounComponentOne', 'ctNounComponentMany'],
  ingredient: ['ctNounIngredientOne', 'ctNounIngredientMany'],
}

const TABLE_HINT_KEYS = {
  article: 'ctTableHint',
  category: 'ctTableHintCategory',
  type: 'ctTableHintType',
  supplier: 'ctTableHintSupplier',
  component: 'ctTableHintComponent',
  ingredient: 'ctTableHintIngredient',
}

const NO_SCOPE_TITLE_KEYS = {
  article: 'ctNoScopeTitle',
  category: 'ctNoScopeTitleCategory',
  type: 'ctNoScopeTitleType',
  supplier: 'ctNoScopeTitleSupplier',
  component: 'ctNoScopeTitleComponent',
  ingredient: 'ctNoScopeTitleIngredient',
}

const mode = (groupBy) => (MODES.includes(groupBy) ? groupBy : 'article')

/** Français : 0 et 1 sont au singulier. Autres langues : seul 1 l'est. */
export function isSingular(n, locale) {
  return locale === 'fr' ? n < 2 : n === 1
}

/** Choisit la clé singulier ou pluriel d'une paire selon le nombre et la langue. */
export function pluralKey(n, locale, one, many) {
  return isSingular(n, locale) ? one : many
}

/** Clés [singulier, pluriel] du nom du niveau affiché. */
export function nounKeys(groupBy) {
  return NOUN_KEYS[mode(groupBy)]
}

/** « 28 catégories », « 0 fournisseur ». */
export function countText(n, groupBy, t, locale) {
  const [one, many] = nounKeys(groupBy)
  return `${n} ${t(pluralKey(n, locale, one, many))}`
}

export function tableHintKey(groupBy) {
  return TABLE_HINT_KEYS[mode(groupBy)]
}

export function noScopeTitleKey(groupBy) {
  return NO_SCOPE_TITLE_KEYS[mode(groupBy)]
}
