// Arrivée sur Commandes depuis Event Predict (?event=&from=predict) alors que l'écran est déjà
// vivant (route keepAlive) : la sélection et la commande chargée datent de la visite précédente.
// Pur, testable sans monter SpaceRestockView.

/**
 * Que faire de l'état vivant quand on arrive pour `eventId` ?
 *  - 'ignore'  : pas d'event, ou event non sélectionnable (match passé / sans prédiction) ;
 *  - 'keep'    : l'event est déjà la seule sélection, la commande éventuelle lui correspond ;
 *  - 'switch'  : une autre sélection est active : détacher la commande chargée / en
 *                modification et sélectionner l'event (jamais écrire dessus).
 *
 * @param {{ eventId: string|null, selectedEventIds: Array, listedIds: Set<string> }} p
 */
export function predictArrivalAction({ eventId, selectedEventIds = [], listedIds = new Set() } = {}) {
  if (!eventId || !listedIds.has(eventId)) return 'ignore'
  const only = selectedEventIds.length === 1 && String(selectedEventIds[0]) === String(eventId)
  return only ? 'keep' : 'switch'
}
