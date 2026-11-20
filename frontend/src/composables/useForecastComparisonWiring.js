/**
 * useForecastComparisonWiring : câblage de l'outil Forecast (Predict d'Analyse) au drawer
 * Comparaison, sans rendu. AnalyseView ne fait qu'instancier ce composable et relayer ses
 * valeurs au drawer et au moteur.
 *
 * Il fournit :
 * - `catalogById` : menuItemId (chaîne) vers Menu Item, pour la liste d'options et le moteur ;
 * - `form` : le brouillon des modifications (useForecastModificationsForm), qui vit dans AnalyseView
 *   pour survivre à la fermeture du drawer ;
 * - `drawerForm` : `form` en Forecast, null sinon (le drawer garde alors son formulaire classique) ;
 * - `baseValues` : { transformationRate, perCapita, basket } du rapport principal, pour les curseurs ;
 * et applique la règle de changement d'outil : le drawer se ferme, le brouillon est vidé en quittant
 * Forecast, et un modèle appliqué qui ne correspond plus à l'outil (Forecast en Analyse, ou
 * comparaison classique en Forecast) est oublié pour ne jamais rouvrir un rapport étranger.
 *
 * @param {Object} p
 * @param {import('vue').Ref<string>} p.toolbox  Outil courant du workspace ('analyse', 'predict', ...).
 * @param {Object} p.comparison  Retour de useComparisonDrawer.
 * @param {import('vue').Ref<Array>} p.articleRecords  Records au grain article du principal.
 * @param {import('vue').Ref<Array>} p.menuItems  Catalogue Menu Item de l'espace.
 * @param {import('vue').Ref<string|null>} [p.spaceId]
 * @param {import('vue').Ref<object|null>} [p.mainSnapshot]  Snapshot du principal (chips) ou null.
 */
import { computed, unref, watch } from 'vue'
import { useForecastModificationsForm } from '@/composables/useForecastModificationsForm'
import { isForecastModel } from '@/utils/comparisonForecastModel'

export const FORECAST_TOOLBOX = 'predict'

const asNumber = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function useForecastComparisonWiring({
  toolbox, comparison, articleRecords, menuItems, spaceId = null, mainSnapshot = null,
}) {
  const isForecast = computed(() => unref(toolbox) === FORECAST_TOOLBOX)

  const catalogById = computed(
    () => new Map((unref(menuItems) || []).map((m) => [String(m.id), m])),
  )

  const form = useForecastModificationsForm({ articleRecords, catalogById, spaceId })
  const drawerForm = computed(() => (isForecast.value ? form : null))

  // Valeurs de départ des curseurs : puces du principal (nombre brut ou null). En Predict la
  // transformation et le panier peuvent être null : le curseur n'affiche alors que le pourcentage.
  const baseValues = computed(() => {
    const chips = unref(mainSnapshot)?.chips || {}
    return {
      transformationRate: asNumber(chips.transferRate),
      perCapita: asNumber(chips.perCapita),
      basket: asNumber(chips.avgTransaction),
    }
  })

  watch(() => unref(toolbox), (now, before) => {
    if (comparison.open.value) comparison.closeDrawer()
    if (before === FORECAST_TOOLBOX) form.clear()
    // Un modèle Forecast n'a de sens qu'en Forecast, une comparaison classique que hors Forecast.
    const applied = comparison.applied.value
    if (applied && isForecastModel(applied) !== (now === FORECAST_TOOLBOX)) {
      comparison.applied.value = null
      comparison.showForm()
    }
  })

  return { isForecast, catalogById, form, drawerForm, baseValues }
}
