import { EventDayFields, resolveEventTransactionWindow } from '../../shared/utils/event-window.util';
import { LiveEventWindowService } from '../weezevent/services/live/live-event-window.service';

/**
 * Période de vente de la caisse POS (PLAN.md décision 10, Q86).
 *
 * - Ouverture : jamais déduite de l'évènement. La caisse est utilisable dès son démarrage
 *   (▶ du directeur), y compris avant l'ouverture des portes. Pas d'ouverture automatique.
 * - Fermeture : fin RÉELLE de l'évènement (heure de fin saisie, sinon minuit local, même règle
 *   que le pre-event et la ventilation) PLUS la grâce du Live (`LiveEventWindowService.GRACE_MS`,
 *   3 h). Pourquoi la même grâce : le Live n'agrège un évènement que jusqu'à sa fin + 3 h. Une
 *   vente POS encaissée après cette limite ne remonterait plus dans le Live, et fermer la caisse
 *   à la fin pile couperait le dernier service (ticket en cours, rush de fin de match, clôture de
 *   caisse). Les deux bornes restent ainsi alignées : tant que la caisse vend, le Live suit.
 */
export function posSellableUntil(event: EventDayFields, timeZone: string): Date {
  const { end } = resolveEventTransactionWindow(event, timeZone || 'Europe/Paris');
  return new Date(end.getTime() + LiveEventWindowService.GRACE_MS);
}

/** L'évènement est-il encore vendable en caisse à `now` ? */
export function isPosEventSellable(event: EventDayFields, timeZone: string, now: Date = new Date()): boolean {
  return now.getTime() < posSellableUntil(event, timeZone).getTime();
}
