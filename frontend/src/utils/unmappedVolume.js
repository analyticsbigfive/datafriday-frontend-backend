/**
 * Volume NON MAPPÉ d'un jeu de records item-level réconciliés (BUG-356-01).
 *
 * Dérivé des records DÉJÀ chargés par la page (event-timeline), sans requête dédiée : l'ancien
 * endpoint `analyse-unmapped` rescannait les transactions brutes (30 s, 502 en production) pour
 * un simple bandeau informatif. Mêmes critères que lui : produit sans menu item (`mapStatus`
 * 'unmapped') OU PdV sans mapping vers l'espace (`shopStatus` 'unmapped'). Les records sans
 * article (`mapStatus` 'noitem') ne sont pas des ventes non mappées.
 *
 * INFORMATIF : ces ventes restent comptées dans toutes les vues, sous « Non mappées ».
 *
 * @param {Array<object>} records records réconciliés (`reconcileRecord`)
 * @returns {{ units: number, revenueHt: number, known: boolean }} `known` = au moins un record lu
 */
export function computeUnmappedVolume(records) {
  let units = 0
  let revenueHt = 0
  let known = false
  for (const r of records || []) {
    known = true
    if (r?.mapStatus !== 'unmapped' && r?.shopStatus !== 'unmapped') continue
    units += Number(r.totalQuantity ?? r.quantity) || 0
    revenueHt += Number(r.totalRevenue ?? r.revenue ?? r.revenueHt) || 0
  }
  return { units, revenueHt, known }
}
