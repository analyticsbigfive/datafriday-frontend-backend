/**
 * Référentiel canonique des types de point de vente (shop type), consommé par la
 * page Analyse pour normaliser les `shopType` renvoyés par le backend.
 *
 * ⚠️ Doit refléter l'enum inline de Space Menu
 * (`['food', 'beverages', 'beer', 'gppremium', 'temporary', 'drinkee']`,
 * cf. SpaceMenusPanel.vue / PropertiesPanel.vue). On NE dédoublonne PAS Space Menu
 * (décision : ne pas y toucher) → garder cette liste synchro manuellement.
 *
 * Le backend émet des chaînes hétérogènes (composites `'food, beverages'`, singulier
 * `'beverage'`, libres `'Points of sale'`, voire un vocabulaire `fnb-*` mort).
 * `normalizeShopType` ramène tout ça vers une CLÉ canonique stable, utilisée
 * identiquement comme clé de regroupement (donut) ET de filtre (store) — sinon le
 * clic-pour-filtrer renvoie 0 ligne. Le libellé affiché est localisé côté composant
 * via `SHOP_TYPE_LABEL_KEYS` (i18n), jamais en dur ici.
 */

export const OTHER_SHOP_TYPE = 'other'

// Ordre canonique + couleur du donut. value = clé canonique.
export const SHOP_TYPES = [
  { value: 'food', labelKey: 'anShopTypeFood', color: '#EF5350' },
  { value: 'beverages', labelKey: 'anShopTypeBeverages', color: '#66BB6A' },
  { value: 'beer', labelKey: 'anShopTypeBeer', color: '#FFD54F' },
  { value: 'gppremium', labelKey: 'anShopTypeGpPremium', color: '#5B8DEF' },
  { value: 'temporary', labelKey: 'anShopTypeTemporary', color: '#AB47BC' },
  { value: 'drinkee', labelKey: 'anShopTypeDrinkee', color: '#4DD0E1' },
]

export const SHOP_TYPE_VALUES = SHOP_TYPES.map((t) => t.value)

// Clé canonique → clé i18n (inclut le bucket de repli « Autre »).
export const SHOP_TYPE_LABEL_KEYS = {
  ...Object.fromEntries(SHOP_TYPES.map((t) => [t.value, t.labelKey])),
  [OTHER_SHOP_TYPE]: 'anShopTypeOther',
}

// Couleur par clé canonique (donut). Repli géré par l'appelant.
export const SHOP_TYPE_COLORS = {
  ...Object.fromEntries(SHOP_TYPES.map((t) => [t.value, t.color])),
  [OTHER_SHOP_TYPE]: '#90A4AE',
}

// Priorité d'affichage dans la clé composite.
const ORDER = new Map(SHOP_TYPE_VALUES.map((v, i) => [v, i]))

// Alias bruts (lowercase) → valeur canonique. Tolère composites, singulier,
// préfixe `fnb-`, underscore (typo `gp_premium` laissé tel quel dans Space Menu).
const ALIAS = {
  food: 'food',
  'fnb-food': 'food',
  snack: 'food',
  'fnb-snack': 'food',
  icecream: 'food',
  'ice cream': 'food',
  'fnb-icecream': 'food',
  beverage: 'beverages',
  beverages: 'beverages',
  'fnb-beverages': 'beverages',
  bar: 'beverages',
  'fnb-bar': 'beverages',
  beer: 'beer',
  brew: 'beer',
  gppremium: 'gppremium',
  'gp premium': 'gppremium',
  gp_premium: 'gppremium',
  temporary: 'temporary',
  temporaire: 'temporary',
  drinkee: 'drinkee',
}

function canonicalToken(raw) {
  const key = String(raw || '').trim().toLowerCase()
  if (!key) return null
  if (ALIAS[key]) return ALIAS[key]
  // Séparateurs hétérogènes du backend : le vocabulaire réel utilise l'underscore
  // (`fnb_beverages`, `fnb_food`) alors que l'ALIAS est en tiret (`fnb-beverages`).
  // On normalise dans les deux sens pour matcher quel que soit le séparateur.
  const dash = key.replace(/[_\s]+/g, '-')
  if (ALIAS[dash]) return ALIAS[dash]
  const underscore = key.replace(/[-\s]+/g, '_')
  if (ALIAS[underscore]) return ALIAS[underscore]
  return SHOP_TYPE_VALUES.includes(key) ? key : OTHER_SHOP_TYPE
}

/**
 * Normalise un `shopType` backend vers une CLÉ canonique stable.
 * - composite : `'food, beverages'` → `'food, beverages'` (canonique, dédupé, ordonné)
 * - singulier : `'beverage'` → `'beverages'`
 * - inconnu : `'Points of sale'` → `'other'`
 * - vide / falsy : `''` (le donut/filtre l'ignore, comme aujourd'hui)
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeShopType(raw) {
  if (!raw) return ''
  const tokens = String(raw)
    .split(',')
    .map(canonicalToken)
    .filter(Boolean)
  if (!tokens.length) return ''
  const unique = [...new Set(tokens)]
  unique.sort((a, b) => {
    const oa = ORDER.has(a) ? ORDER.get(a) : Number.MAX_SAFE_INTEGER
    const ob = ORDER.has(b) ? ORDER.get(b) : Number.MAX_SAFE_INTEGER
    return oa - ob
  })
  return unique.join(', ')
}

/**
 * Couleur d'une clé canonique (simple ou composite) — 1er token connu sinon repli.
 * @param {string} key
 * @returns {string|undefined}
 */
export function shopTypeColor(key) {
  if (!key) return undefined
  for (const token of String(key).split(', ')) {
    if (SHOP_TYPE_COLORS[token]) return SHOP_TYPE_COLORS[token]
  }
  return undefined
}
