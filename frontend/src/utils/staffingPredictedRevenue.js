// BUG-391-02 : CA prédit par PDV envoyé à « Generate Staff ».
// Le backend calculait le staff à partir de la version Event Predict enregistrée par défaut
// (ou d'ElementPerformance, jamais alimenté) : sans version enregistrée, CA = 0 partout et
// aucune ligne n'était générée. On envoie désormais le CA que l'utilisateur voit, agrégé
// exactement comme le backend agrège `EventPredictVersion.predictedRecords` (somme de
// `totalRevenue` par `shopId`).

const round2 = (v) => Math.round(v * 100) / 100

/**
 * Agrège des enregistrements au format `buildPredictedRecords()` (`{ shopId, totalRevenue, ... }`)
 * en `{ [shopId]: CA }`. Ignore les lignes sans `shopId` ou au CA non fini. Arrondi à 2 décimales.
 * @param {Array<{ shopId?: string, totalRevenue?: number }>} records
 * @returns {Record<string, number>}
 */
export function aggregatePredictedRevenueByElement(records) {
  if (!Array.isArray(records)) return {}
  const sums = {}
  for (const rec of records) {
    const shopId = rec?.shopId
    if (!shopId) continue
    const revenue = Number(rec?.totalRevenue)
    if (rec?.totalRevenue === null || rec?.totalRevenue === undefined || !Number.isFinite(revenue)) continue
    sums[shopId] = (sums[shopId] ?? 0) + revenue
  }
  const out = {}
  for (const [shopId, total] of Object.entries(sums)) out[shopId] = round2(total)
  return out
}

/**
 * Vrai si la map contient au moins un PDV. Sert à n'envoyer le corps du POST generate que
 * lorsque la timeline est calculée (sinon comportement historique, POST sans corps).
 * @param {Record<string, number> | null | undefined} map
 */
export function hasPredictedRevenue(map) {
  return !!map && typeof map === 'object' && !Array.isArray(map) && Object.keys(map).length > 0
}
