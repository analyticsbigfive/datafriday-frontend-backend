/**
 * useForecastPastScenario : case « Events passés : scénario Event Predict » de l'outil Prévision.
 * Par défaut les events passés montrent leurs ventes réelles ; cochée, ils montrent leur scénario
 * Event Predict. La règle de calcul vit dans le store (regeneratePredictions) et dans
 * utils/forecastPastScenario.
 *
 * @param {Object} p
 * @param {import('vue').Ref<boolean>} p.isPredict  Vrai dans l'outil Prévision.
 * @param {import('vue').Ref<Array>} p.events  Events affichés (après filtres).
 * @returns {{ showToggle: import('vue').ComputedRef<boolean>,
 *   usePastScenario: import('vue').ComputedRef<boolean>,
 *   setUsePastScenario: (value: boolean) => void }}
 */
import { computed, unref } from 'vue'
import store from '@/store'

export function useForecastPastScenario({ isPredict, events }) {
  const usePastScenario = computed(() => store.state.analyse.forecastPastUseScenario === true)

  // La case n'a de sens que s'il existe au moins un event passé affiché avec un scénario.
  const showToggle = computed(() => {
    if (!unref(isPredict)) return false
    const withScenario = new Set(store.state.analyse.forecastPastScenarioEventIds || [])
    if (!withScenario.size) return false
    return (unref(events) || []).some((e) => withScenario.has(e?.id))
  })

  function setUsePastScenario(value) {
    store.dispatch('analyse/setForecastPastUseScenario', value === true)
  }

  return { showToggle, usePastScenario, setUsePastScenario }
}
