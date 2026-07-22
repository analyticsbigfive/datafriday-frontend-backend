// Records de scénario Event Predict -> records au format des vues Analyse.
//
// Le mode Predict d'Analyse consomme `shopGranularData` (shop-details), qui est
// shop-level : `menuItemId`/`menuItemName` sont null → aucune dimension article.
// Les scénarios Event Predict, eux, persistent le grain article dans
// `EventPredictVersion.predictedRecords` (écrit par
// `EventPredictView.buildPredictedRecords()` depuis `activeTimelineData` +
// `manualQuantityRecords`, donc DÉJÀ ajusté par les sliders du scénario).
//
// Ce module fait la seule chose qui manque : traduire ces records compacts
// { shopId, shop, menuItemId, itemName, totalQuantity, totalRevenue } vers la
// forme attendue par les vues Analyse ({ shopName, menuItemName, quantity,
// revenue, ... }), qui passeront ensuite par `reconcileRecord` pour récupérer
// type/catégorie d'article. Fonction pure, sans état ni I/O.
//
// Consommateurs : `store/modules/analyse.js` (regeneratePredictions) →
// `MenuItemRevenueDistribution.vue` + `MenuItemsByShopTable.vue`.

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Traduit les `predictedRecords` d'une version de scénario en records Analyse.
 *
 * @param {{ id?: string, predictedRecords?: Array<object> }} version  version Event Predict
 * @param {{ id?: string, name?: string, eventName?: string, eventDate?: string, date?: string }} event
 * @param {{ elementNameById?: Map<string,string> }} [options]
 *   `elementNameById` : elementId → nom de PdV. Indispensable car
 *   `buildPredictedRecords` met `shop: null` sur les items à quantité manuelle,
 *   et le nom de PdV est la clé de jointure de `reconcileRecord` (shopByKey).
 * @returns {Array<object>} records au format Analyse (vide si rien d'exploitable)
 */
export function scenarioRecordsToAnalyseRecords(version, event, options = {}) {
  const source = Array.isArray(version?.predictedRecords) ? version.predictedRecords : []
  if (!source.length || !event?.id) return []

  const { elementNameById } = options
  const eventName = event.eventName || event.name || ''
  const eventDate = event.eventDate || event.date || ''
  const out = []

  for (const pr of source) {
    if (!pr) continue
    const menuItemId = pr.menuItemId || pr.mappedMenuItemId || null
    const itemName = pr.itemName || pr.menuItemName || null
    // Sans identifiant NI libellé, le record retomberait dans la sentinelle
    // « Non rattachés » — exactement ce que ce module doit éviter.
    if (!menuItemId && !itemName) continue

    const shopName =
      pr.shop
      || pr.shopName
      || (elementNameById instanceof Map ? elementNameById.get(String(pr.shopId)) : null)
      || ''

    out.push({
      eventId: event.id,
      eventName,
      eventDate,
      elementId: pr.shopId || null,
      elementName: shopName,
      shopName,
      menuItemId,
      mappedMenuItemId: pr.mappedMenuItemId || null,
      // Les deux champs : `resolveItemName` lit menuItemName en premier, mais
      // `reconcileRecord`/`classifyMenuRevenueBucket` regardent aussi itemName.
      menuItemName: itemName,
      itemName,
      quantity: toNumber(pr.totalQuantity),
      revenue: toNumber(pr.totalRevenue),
      transactionCount: 0,
      isPredictive: true,
      fromVersionId: version?.id || null,
    })
  }

  return out
}
