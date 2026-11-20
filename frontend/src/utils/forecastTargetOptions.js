/**
 * Options des menus déroulants de l'outil Forecast (Analyse). Module PUR.
 *
 * Les listes sont construites UNIQUEMENT depuis ce que portent les records article, pour
 * garantir qu'une modification choisie touche au moins un article. Un article sans
 * menuItemId n'est jamais proposé (cf. isTargetableArticle) ; la sentinelle « non
 * rattaché » n'apparaît jamais dans les catégories ni les types.
 */

import { menuItemPriceTtc, menuItemVatRate } from '@/utils/price'
import { articleFromRecord, isTargetableArticle } from '@/utils/forecastPriceRatio'
import { UNATTACHED_ITEM_KEY } from '@/utils/analyseReconciliation'

function cleanName(v) {
  const s = v == null ? '' : String(v).trim()
  return s && s !== UNATTACHED_ITEM_KEY ? s : ''
}

function sortedNames(set) {
  return [...set].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
}

/**
 * @param {object} input
 * @param {object[]} input.articleRecords  Records au grain article.
 * @param {Map<string, object>} [input.catalogById]  menuItemId (chaîne) vers Menu Item.
 * @param {string|null} [input.spaceId]  Espace courant.
 * @returns {{
 *   items: { id: string, name: string, currentTtc: number, vatRate: number|null, priceable: boolean }[],
 *     (vatRate : taux de TVA en % du prix TTC, null si inconnu : pas de HT dérivable),
 *   categories: string[],
 *   types: string[],
 * }}  items triés par nom ; categories et types : noms distincts triés.
 */
export function forecastTargetOptions({ articleRecords, catalogById = null, spaceId = null } = {}) {
  const itemsById = new Map()
  const categories = new Set()
  const types = new Set()

  for (const rec of Array.isArray(articleRecords) ? articleRecords : []) {
    const article = articleFromRecord(rec)
    if (!isTargetableArticle(article)) continue

    const category = cleanName(article.category)
    const type = cleanName(article.type)
    if (category) categories.add(category)
    if (type) types.add(type)

    const catalogItem = catalogById?.get(article.menuItemId)
    const existing = itemsById.get(article.menuItemId)
    const name = cleanName(rec.menuItemName) || cleanName(catalogItem?.name) || article.menuItemId
    if (existing) {
      // Un nom lisible remplace un identifiant brut si un record plus riche arrive.
      if (existing.name === article.menuItemId && name !== article.menuItemId) existing.name = name
      continue
    }
    const currentTtc = menuItemPriceTtc(catalogItem, spaceId)
    itemsById.set(article.menuItemId, {
      id: article.menuItemId,
      name,
      currentTtc,
      vatRate: menuItemVatRate(catalogItem, spaceId),
      priceable: currentTtc > 0,
    })
  }

  const items = [...itemsById.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
  )
  return { items, categories: sortedNames(categories), types: sortedNames(types) }
}
