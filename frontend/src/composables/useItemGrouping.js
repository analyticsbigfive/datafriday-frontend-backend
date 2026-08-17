import { ref, computed } from 'vue'
import {
  buildDisplayNameIndex,
  resolveDisplayNameGroup,
  resolveItemName,
} from '@/utils/analyseDimensions'

/**
 * Mode de regroupement des vues « par article » de l'Analyse — PARTAGÉ.
 *
 * Deux valeurs : `'menuItem'` (défaut, une ligne par article du catalogue) et
 * `'displayName'` (les articles partageant un même DisplayName fusionnent —
 * référentiel N→1 `MenuItem.displayNameId`, demandé le 17/08 pour que les
 * variantes d'un même produit commercial — Happy Hour, formats, suffixes de
 * variante Digifood — ne se disputent plus le classement).
 *
 * Le mode est une ref de MODULE (comme `filtersRecomputing` dans useFilters) :
 * l'écran (SummaryPanel) et l'export XLSX (useAnalyseDataset, monté ailleurs
 * dans l'arbre) doivent lire LE MÊME mode, sinon la feuille « Classement » ne
 * correspond plus à ce qui est affiché.
 *
 * Le catalogue est passé par l'appelant (`menuItems`) plutôt qu'importé ici :
 * ce module reste sans dépendance au store, donc testable et importable depuis
 * un contexte qui ne monte pas Vuex.
 */
const _mode = ref('menuItem')

/**
 * @param {(() => Array) | { value: Array }} menuItems catalogue (getter ou ref) —
 *   typiquement `() => store.state.analyse.menuItems`.
 */
export function useItemGrouping(menuItems = () => []) {
  const readCatalogue = () =>
    (typeof menuItems === 'function' ? menuItems() : menuItems?.value) || []
  // Le catalogue arrive après le premier rendu (useSpaceData phases 1/2) —
  // computed et non valeur figée, comme le contexte de réconciliation.
  const displayNameIndex = computed(() => buildDisplayNameIndex(readCatalogue()))
  const isDisplayNameMode = computed(() => _mode.value === 'displayName')

  /** Clé de regroupement d'un record selon le mode actif. */
  function groupKeyOf(record) {
    return isDisplayNameMode.value
      ? resolveDisplayNameGroup(record, displayNameIndex.value)
      : resolveItemName(record)
  }

  return { mode: _mode, isDisplayNameMode, displayNameIndex, groupKeyOf }
}
