// Montant à payer par fournisseur (carte « Fournisseurs » de la colonne de droite).
// Même règle de prix que le « Résumé commande » (utils/restockStorageSummary) :
// quantité à commander x prix du Market Price, au colis entier quand il y a un
// conditionnement. Aucun prix inventé : un article sans prix ne compte pas, et un
// fournisseur dont aucun article n'a de prix reste sans montant (null).
import { orderAmount, unitPriceOfMarketPrice } from '@/utils/restockStorageSummary'

/**
 * @param {Array} groups groupes fournisseurs ({ items: [{ quantity, ... }] })
 * @param {{ marketPriceFor: Function, packagingFor: Function }} resolvers
 * @returns {Array} mêmes groupes, avec `totalAmount` (number|null) et `item.amount`
 */
export function withSupplierAmounts(groups, { marketPriceFor, packagingFor }) {
  return (groups || []).map((group) => {
    let total = 0
    let priced = 0
    const items = (group.items || []).map((item) => {
      const qty = Number(item.quantity)
      const mp = marketPriceFor(item) || null
      if (!(qty > 0) || unitPriceOfMarketPrice(mp) == null) return item
      const amount = orderAmount(qty, mp, packagingFor(item, qty))
      total += amount
      priced += 1
      return { ...item, amount }
    })
    return { ...group, items, totalAmount: priced > 0 ? total : null }
  })
}
