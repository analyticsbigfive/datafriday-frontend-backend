// src/utils/inventoryCoverage.js
// Vérification « stocks ↔ menu items » par point de vente.
//
// Pour chaque shop, on dispose de :
//   - availableMenuItems   : les menu items vendus par ce PdV (attendu)
//   - consolidatedInventory: les articles de stock dérivés de ces menus
//                            (chaque article porte usedIn[] = menus qui l'utilisent)
//   - inventoryCounts[shopId][itemId].isCounted : a-t-il été compté ?
//
// On en déduit, par shop :
//   - uncoveredMenuItems : menus vendus SANS aucun article de stock pour les couvrir
//   - uncountedItems     : articles de stock pas encore comptés
//   - orphanItems        : articles de stock non rattachés à un menu (usedIn vide)

/**
 * @param {Array<{element:Object, availableMenuItems:Array, consolidatedInventory:Array}>} shops
 * @param {Object} inventoryCounts  { [shopId]: { [itemId]: { isCounted } } }
 * @returns {Array<Object>} un rapport par shop
 */
export function buildCoverageReports(shops = [], inventoryCounts = {}) {
  return (shops || []).map((entry) => {
    const shopId = entry?.element?.id || null
    const shopName = entry?.element?.name || 'Sans nom'
    const menuItems = entry?.availableMenuItems || []
    const inv = entry?.consolidatedInventory || []
    const counts = (shopId && inventoryCounts?.[shopId]) || {}

    // Ids des menu items couverts par AU MOINS un article de stock.
    const covered = new Set()
    for (const it of inv) {
      for (const u of it?.usedIn || []) {
        if (u?.id) covered.add(u.id)
      }
    }

    const uncoveredMenuItems = menuItems.filter((m) => !covered.has(m.id))
    const uncountedItems = inv.filter((it) => !counts?.[it.id]?.isCounted)
    const orphanItems = inv.filter((it) => !(it?.usedIn || []).length)

    const menuItemCount = menuItems.length
    const coveredCount = menuItemCount - uncoveredMenuItems.length
    const coveragePct = menuItemCount ? Math.round((coveredCount / menuItemCount) * 100) : 100
    // Anomalie = menu non couvert OU article non compté (les orphelins sont
    // informatifs, pas bloquants → exclus du compteur d'anomalies).
    const issueCount = uncoveredMenuItems.length + uncountedItems.length

    return {
      shopId,
      shopName,
      menuItemCount,
      coveredCount,
      coveragePct,
      uncoveredMenuItems,
      uncountedItems,
      orphanItems,
      uncoveredCount: uncoveredMenuItems.length,
      uncountedCount: uncountedItems.length,
      itemCount: inv.length,
      issueCount,
      ok: issueCount === 0,
    }
  })
}

/** Total d'anomalies (menus non couverts + articles non comptés) sur tous les shops. */
export function totalCoverageIssues(reports = []) {
  return (reports || []).reduce((n, r) => n + (r?.issueCount || 0), 0)
}
