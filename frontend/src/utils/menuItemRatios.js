// Miroir pur de StaffingCalculatorService.applyMenuItemRatios() (backend) — voir
// 11_RH_STAFFING.md §11.16. Sert à afficher un aperçu ("qty déclenchée") dans
// MenuItemSalesInputSection.vue sans attendre l'aller-retour serveur. Toute divergence entre ce
// fichier et le backend fait mentir cet aperçu — d'où le test dédié (menuItemRatios.spec.js).

/**
 * ratios: [{ roleId, ratioBasis: 'REVENUE'|'QUANTITY', ratioValue, unitQty, targetMenuItemIds }]
 * sales: [{ menuItemId, quantity, revenueHt }]
 * → [{ roleId, qty }], SOMMÉ par rôle (pas de max, contrairement aux Sinking Rules).
 */
export function applyMenuItemRatios(ratios, sales) {
  const salesByItem = new Map((sales || []).map((s) => [s.menuItemId, s]))
  const byRoleQty = new Map()
  for (const ratio of ratios || []) {
    if (!ratio?.ratioValue) continue
    let sum = 0
    for (const menuItemId of ratio.targetMenuItemIds || []) {
      const s = salesByItem.get(menuItemId)
      if (!s) continue
      sum += ratio.ratioBasis === 'REVENUE' ? (Number(s.revenueHt) || 0) : (Number(s.quantity) || 0)
    }
    const qty = Math.floor(sum / ratio.ratioValue) * (ratio.unitQty || 1)
    if (qty > 0) byRoleQty.set(ratio.roleId, (byRoleQty.get(ratio.roleId) || 0) + qty)
  }
  return [...byRoleQty.entries()].map(([roleId, qty]) => ({ roleId, qty }))
}

/** allMenuItems=true → tous les items disponibles sur ce shop ; sinon la liste explicite. */
export function resolveTargetMenuItemIds(ratio, availableMenuItemIds) {
  return ratio?.allMenuItems ? [...(availableMenuItemIds || [])] : (ratio?.menuItemIds || [])
}
