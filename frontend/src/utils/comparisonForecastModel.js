/**
 * Modèle appliqué « Forecast » de la comparaison : { kind: 'forecast', modifications: [...] }.
 *
 * Volontairement HORS de COMPARISON_KINDS (utils/comparisonFormModel) : ce n'est pas un type
 * de comparaison saisi dans le formulaire, mais un modèle appliqué par l'outil Forecast
 * d'Analyse. Le comparé est alors le principal passé par le moteur de modifications what-if,
 * sans aucune requête API.
 */

export const FORECAST_KIND = 'forecast'

/** Vrai si la saisie de comparaison est un modèle Forecast appliqué. */
export function isForecastModel(model) {
  return !!model && typeof model === 'object' && model.kind === FORECAST_KIND
}
