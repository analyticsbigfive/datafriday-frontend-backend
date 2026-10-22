import { combineDayAndLocalTime, EventDayFields, resolveDoorsOpenAt } from '../../shared/utils/event-window.util';
import { EventReference } from './cost-tracking.types';

/**
 * Instant de référence d'un event pour choisir la version de coût en vigueur : l'ouverture des
 * portes si elle est saisie, sinon minuit local du jour de l'event (PLAN §3, ADR lot 0). Un
 * changement fait le jour du match sans heure d'ouverture ne s'applique donc qu'au match suivant.
 */
export function resolveEventReference(event: EventDayFields, timeZone: string): EventReference {
  const doors = resolveDoorsOpenAt(event, timeZone);
  if (doors) return { at: doors, source: 'doors_open' };
  const day = new Date((event.eventStartDate ?? event.eventDate) as any);
  const midnight = combineDayAndLocalTime(day, '00:00', timeZone);
  return { at: midnight ?? day, source: 'midnight' };
}

/** Minuit local (fuseau du space) d'un jour calendaire ancré à minuit UTC. */
export function localMidnightOf(day: Date, timeZone: string): Date {
  return combineDayAndLocalTime(day, '00:00', timeZone) ?? day;
}
