/**
 * BUG-350-01 — point de bascule UNIQUE de la source du CA affiché dans l'Analyse.
 *
 * Pourquoi un module et pas trois lignes dans `AnalyseView.vue` : l'arbitrage
 * « quelle source fait foi » n'est pas tranché (QUESTIONS_A_BERTRAND #62). Il
 * doit rester repérable et testable, pas enfoui dans un SFC de 2 400 lignes.
 *
 * Rappel du problème corrigé : `kpiRecords`/`chartRecords` publiaient le
 * shop-level comme un CA définitif, puis le remplaçaient par l'item-level.
 * Ce ne sont PAS deux étapes de chargement mais deux moteurs de calcul —
 * `SpaceRevenueMinuteAgg` déduit les remises et n'exclut pas les transactions
 * non validées, `SpaceRevenueMinuteItemAgg` fait l'inverse
 * (`aggregation.service.ts:543-554`, divergence volontaire). Écart mesuré :
 * 7,12 % sur Stade Jean Bouin, 28,6 % sur Auxerre (BUG-247-01).
 */

/**
 * Source canonique du CA en mode Analyse.
 * Basculer ICI, et ici seulement, si Bertrand tranche pour le shop-level.
 * @type {'item-level' | 'shop-level'}
 */
export const CANONICAL_REVENUE_SOURCE = 'item-level'

/**
 * Records alimentant KPI, graphes, donuts et tables.
 *
 * ⚠️ Mode Predict : le shop-level est la source CANONIQUE, pas un repli — la
 * prédiction est shop-level par nature (aucun `menuItemId`) et l'item-level ne
 * couvre que le passé, il masquerait tous les events à venir.
 *
 * ⚠️ Mode Analyse : aucun repli. Un tableau vide est un résultat légitime
 * (« pas encore chargé » ou « rien à afficher ») ; c'est `resolveKpiSourceState`
 * qui dit lequel des deux, et l'UI qui choisit squelette ou état vide.
 *
 * @param {{isPredict: boolean, itemLevelRecords: Array, shopLevelRecords: Array,
 *          canonicalSource?: 'item-level'|'shop-level'}} args
 * @returns {Array}
 */
export function pickRevenueRecords({
  isPredict,
  itemLevelRecords,
  shopLevelRecords,
  canonicalSource = CANONICAL_REVENUE_SOURCE,
}) {
  if (isPredict) return shopLevelRecords || []
  return (canonicalSource === 'item-level' ? itemLevelRecords : shopLevelRecords) || []
}

/**
 * État d'affichage : 'loading' | 'ready' | 'empty'.
 *
 * Le distinguo 'empty' vs 'loading' est le point critique du lot. Zéro record
 * est aussi un état TERMINAL — batch en échec, PdV non mappés (`shopIds` vide →
 * réponse nulle, `spaces.service.ts:1238`), dates d'event hors fenêtre (cas
 * « Match 10 Mai », BUG-247-01). Les confondre figerait l'écran sur un squelette
 * éternel : pire que la valeur provisoire qu'on vient de retirer.
 *
 * @param {{isPredict: boolean, itemLevelState: 'loading'|'ready'|'empty',
 *          canonicalSource?: 'item-level'|'shop-level'}} args
 * @returns {'loading'|'ready'|'empty'}
 */
export function resolveKpiSourceState({
  isPredict,
  itemLevelState,
  canonicalSource = CANONICAL_REVENUE_SOURCE,
}) {
  // Predict et shop-level canonique lisent une source déjà en mémoire (store) :
  // rien à attendre, donc jamais de squelette de leur fait.
  if (isPredict || canonicalSource !== 'item-level') return 'ready'
  return itemLevelState
}
