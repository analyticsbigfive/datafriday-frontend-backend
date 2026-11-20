// Portée des modifications what-if de l'outil Forecast (drawer Comparaison).
//
// Module pur : « tous les events affichés » (défaut, passés compris) ou « seulement les events
// prédits ». Un event prédit est un event dont les records portent `isPredictive: true`
// (prédictions du moteur ou scénarios Event Predict) ; un event passé garde son réel.

export const FORECAST_SCOPES = Object.freeze({ ALL: 'all', PREDICTED: 'predicted' })

export const SCOPE_DEFAULT = FORECAST_SCOPES.ALL

/** Toute valeur inconnue ou absente retombe sur « tous les events ». */
export function normalizeScope(value) {
  return value === FORECAST_SCOPES.PREDICTED ? FORECAST_SCOPES.PREDICTED : FORECAST_SCOPES.ALL
}

/** Vrai si les modifications ne doivent toucher que les events prédits. */
export function isPredictedOnly(scope) {
  return normalizeScope(scope) === FORECAST_SCOPES.PREDICTED
}

/** Vrai si le record appartient à un event prédit. */
export function isPredictedRecord(record) {
  return !!record && record.isPredictive === true
}
