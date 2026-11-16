/**
 * Garde du chargement différé du contexte PdV « All Configurations » (AnalyseView).
 *
 * Le contexte union (`analyse/loadAllConfigsShopContext`) enchaîne, par configuration,
 * builder-v2/state, configurations/:id, spaceShops/fetchForSpace et les menus légers
 * des PdV. Ses seules entrées sont l'espace et les configurations de la phase 1 : il ne
 * dépend d'AUCUNE donnée de shop-details. Il peut donc partir dès la fin de la phase 1,
 * en parallèle de l'appel shop-details (le plus lent), au lieu d'attendre la vague 2a.
 *
 * Fonction pure : l'état du store est passé en paramètre, le dispatch reste dans la vue.
 */

/**
 * Délai entre la fin de la phase 1 (loading true -> false) et le lancement du contexte
 * union. 0 = prochaine macrotâche : il laisse la continuation de `ensureAuthAndLoad`
 * (microtâches suivant `await loadSpace`) restaurer d'abord une config de deep-link
 * `?config=<id>`, sans quoi on chargerait l'union pour rien. Le watcher `enriching`
 * (fin de la phase 2) reste un filet si ce déclencheur a été sauté.
 *
 * Retour arrière : remettre 3000 pour retrouver l'ancien repli (union lancée 3 s après
 * la fin de la phase 1, ou à la fin de la phase 2 si elle arrive avant).
 */
export const ALL_CONFIGS_CTX_AFTER_PHASE1_MS = 0

/**
 * @param {object} st état du module store `analyse` (store.state.analyse)
 * @returns {'wait'|'latch'|'dispatch'}
 *  - 'wait'     : ne rien faire et NE PAS verrouiller (espace pas encore connu, ou Event
 *                 Predict ouvert : l'union serait du travail invisible, le watcher de la
 *                 toolbox relancera au retour sur Analyse)
 *  - 'latch'    : verrouiller sans dispatcher (config précise sélectionnée, chargement de
 *                 contexte déjà en cours, ou contexte union déjà chargé)
 *  - 'dispatch' : verrouiller puis dispatcher `analyse/loadAllConfigsShopContext`
 */
export function decideAllConfigsContext(st) {
  if (!st?.spaceId && !st?.space?.id) return 'wait'
  if (st.selectedToolbox === 'event-predict') return 'wait'
  const sel = st.filters?.selectedConfigurationId
  if (
    (sel && sel !== 'cfg-all') ||
    st.configContextLoading ||
    (st.configShopContext?.configId === null && (st.configShopContext?.floorElements?.length || 0) > 0)
  ) {
    return 'latch'
  }
  return 'dispatch'
}
