import { computed, effectScope } from 'vue'
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
// BUG-284 : singleton au niveau module — avant, chaque site d'appel recevait un
// `computed` NEUF (3 instances : AnalyseView + les 2 useAnalyseItemRecords), donc
// 3 constructions du contexte et 3 jeux de mémos (`matchMemo`/`categoryMatchMemo`)
// payés en parallèle à chaque invalidation du catalogue. Le docblock promettait
// déjà un contexte UNIQUE ; le store étant un singleton global (importé ici en
// module), le computed peut l'être aussi — mêmes valeurs, amortissement 1×.
let _sharedCtx = null
// Scope DÉTACHÉ : un computed créé pendant le setup d'un composant serait arrêté
// au démontage de ce composant — le singleton deviendrait figé après une première
// navigation. Le scope détaché vit avec l'app, comme le store.
const _detachedScope = effectScope(true)

export function useReconciliationContext() {
  if (!_sharedCtx) {
    _sharedCtx = _detachedScope.run(() => computed(() => {
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
    }))
  }
  return _sharedCtx
}
