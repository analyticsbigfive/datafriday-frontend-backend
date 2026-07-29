import { computed } from 'vue'
import { buildReconciliationContext } from '@/utils/analyseReconciliation'
import store from '@/store'

/**
 * Contexte de réconciliation UNIQUE, dérivé du catalogue en store.
 *
 * Pourquoi un point de construction partagé : plusieurs datasets de l'Analyse
 * passent par `reconcileRecord` (item-level d'`useAnalyseItemRecords`, records
 * article des scénarios Predict, timeline). S'ils se réconcilient avec des
 * contextes construits séparément, une MÊME ligne peut se voir attribuer deux
 * `menuItemType`/`menuItemCategory` différents dès que les deux constructions
 * divergent — et cliquer une part de donut filtre alors la timeline à zéro.
 * C'est le pendant de la règle d'or d'`analyseDimensions.js` (même `resolveX`
 * côté regroupement et côté filtre), un cran plus haut : même contexte de
 * réconciliation pour tous les consommateurs.
 *
 * `computed` et non valeur figée : le catalogue (`menuItems`,
 * `productCategoriesList`, `configShopContext`) arrive à son propre rythme,
 * après le premier rendu. Un contexte capturé dans un `load()` async figerait
 * l'état du catalogue à cet instant.
 */
export function useReconciliationContext() {
  return computed(() => {
    const a = store.state.analyse
    return buildReconciliationContext({
      menuItems: a.menuItems || [],
      productCategories: a.productCategoriesList || [],
      productTypes: a.productTypesList || [],
      floorElements: a.configShopContext?.floorElements || [],
      assignment: a.configShopContext?.assignment || null,
      assignmentItemsByShop: a.configShopContext?.assignmentItemsByShop || null,
      weezeventProducts: a.weezeventProducts || [],
    })
  })
}
