/**
 * Ratio de prix d'un article pour l'outil Forecast (Analyse). Module PUR.
 *
 * Règles :
 *  - itemPrice (cet article), categoryPct (sa catégorie) et typePct (son type) visent le
 *    MÊME prix : parmi celles qui s'appliquent, la DERNIÈRE de la liste gagne, sans cumul.
 *    Le % s'applique toujours au prix de base, jamais à un prix déjà modifié.
 *  - itemPrice : ratio = nouveau TTC / TTC catalogue actuel (la TVA s'annule en HT/HT).
 *    TTC catalogue introuvable ou <= 0 : ratio 1 et article « non modifiable ».
 *  - categoryPct / typePct : ratio = 1 + v/100 (-100 donne 0).
 *  - Pas d'élasticité : le ratio ne touche que le CA, jamais quantités ni transactions.
 */

import { menuItemPriceTtc } from '@/utils/price'
import { UNATTACHED_ITEM_KEY } from '@/utils/analyseReconciliation'
import { FORECAST_MODIFICATION_TYPES, effectiveModifications } from '@/utils/forecastModificationModel'

const T = FORECAST_MODIFICATION_TYPES

const NEUTRAL = Object.freeze({ ratio: 1, modified: false, unpriceable: false })

/** Article { menuItemId, category, type } à partir d'un record d'Analyse (grain article). */
export function articleFromRecord(rec) {
  const id = rec?.menuItemId ?? rec?.mappedMenuItemId
  return {
    menuItemId: id == null || id === '' ? null : String(id),
    category: rec?.menuItemCategory ?? null,
    type: rec?.menuItemType ?? null,
  }
}

/**
 * Un article n'est ciblable que s'il porte un menuItemId. Une catégorie ou un type égal à
 * la sentinelle « non rattaché » n'est jamais ciblé par categoryPct / typePct, mais le
 * prix de l'article (itemPrice) reste modifiable.
 */
export function isTargetableArticle(article) {
  return !!article && article.menuItemId != null && article.menuItemId !== ''
}

const isRealDimension = (v) => v != null && v !== UNATTACHED_ITEM_KEY

function appliesToArticle(m, article) {
  switch (m.type) {
    case T.ITEM_PRICE:
      return String(m.target) === String(article.menuItemId)
    case T.CATEGORY_PCT:
      return isRealDimension(article.category) && m.target === article.category
    case T.TYPE_PCT:
      return isRealDimension(article.type) && m.target === article.type
    default:
      return false
  }
}

/**
 * @param {{ menuItemId: string|null, category: string|null, type: string|null }} article
 * @param {object[]} list  Liste de modifications (ordre d'ajout).
 * @param {{ catalogById?: Map<string, object>, spaceId?: string|null }} [ctx]
 * @returns {{ ratio: number, modified: boolean, unpriceable: boolean }}
 */
export function priceRatioFor(article, list, { catalogById = null, spaceId = null } = {}) {
  if (!isTargetableArticle(article)) return NEUTRAL

  let winner = null
  for (const m of effectiveModifications(list)) {
    if (appliesToArticle(m, article)) winner = m
  }
  if (!winner) return NEUTRAL

  if (winner.type === T.ITEM_PRICE) {
    const currentTtc = menuItemPriceTtc(catalogById?.get(String(article.menuItemId)), spaceId)
    if (!(currentTtc > 0)) return { ratio: 1, modified: false, unpriceable: true }
    return { ratio: Number(winner.value) / currentTtc, modified: true, unpriceable: false }
  }
  return { ratio: 1 + Number(winner.value) / 100, modified: true, unpriceable: false }
}
