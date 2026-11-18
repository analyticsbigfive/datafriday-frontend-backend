/**
 * Préchauffage du contexte PdV « All Configurations » (union de toutes les configurations).
 *
 * Le contexte union ne dépend que de l'espace et de la LISTE des configurations. Cette liste
 * arrive bien avant la fin de la phase 1 de `fetchSpaceData` (qui attend aussi la liste des
 * events, plus lente). Avant, l'union ne partait qu'à la fin de la phase 1 ; on la lance
 * maintenant dès que la liste des configurations est connue. Les lectures passent par le même
 * cache que l'union (`buildConfigShopEntryCached`) : quand l'union est demandée ensuite, elle
 * retrouve les promesses déjà en vol ou terminées, le résultat est identique.
 *
 * Fonction pure : le store fournit l'état, la vue décide (flag) d'activer ou non.
 */

/**
 * Configurations à préchauffer, ou `[]` quand l'union ne sera pas demandée (le préchauffage
 * serait alors du travail inutile) :
 *  - Event Predict ouvert : l'union est reportée au retour sur Analyse ;
 *  - lien profond `?config=<id>` : une configuration précise sera restaurée après le chargement ;
 *  - sélection précise conservée par `resolveSelection` : son contexte se charge seul ;
 *  - aucune configuration : rien à lire.
 *
 * @param {Object} p
 * @param {Array<{id:string}>} p.configurations liste déjà passée par `filterValidConfigurations`
 * @param {string|null} [p.currentSelection] `filters.selectedConfigurationId` avant le chargement
 * @param {string} [p.toolbox] `selectedToolbox` du store
 * @param {string} [p.urlConfig] paramètre `?config=` de l'URL, vide si absent
 * @param {Function} p.resolveSelection `resolveConfigSelectionAfterLoad` (même règle que le store)
 * @returns {Array<{id:string}>}
 */
export function pickConfigsToPrewarm({ configurations, currentSelection = null, toolbox = '', urlConfig = '', resolveSelection }) {
  if (toolbox === 'event-predict') return []
  if (urlConfig && urlConfig !== 'cfg-all') return []
  const list = (Array.isArray(configurations) ? configurations : []).filter((c) => c?.id && c.id !== 'cfg-all')
  if (!list.length) return []
  if (resolveSelection(currentSelection, list)) return []
  return list
}
