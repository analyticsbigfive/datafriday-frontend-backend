import {
  EventDayFields,
  combineDayAndLocalTime,
  resolveDoorsOpenAt,
  resolveEventTransactionWindow,
  resolvePreEventDeadline,
} from '../../shared/utils/event-window.util';

export type InventoryWindowPhase = 'pre-event' | 'post-event';

/** Où en est la période d'une fenêtre à un instant donné. */
export type InventoryWindowPeriodState = 'not-yet' | 'open' | 'over';

export interface InventoryWindowPeriod {
  /** null = ouvrable dès maintenant (pre-event : aucune borne basse). */
  opensAt: Date | null;
  closesAt: Date;
}

/**
 * Période pendant laquelle une fenêtre invité (PIN) peut exister, règle Ulrich 2026-09-28
 * (incident Stade Jean Bouin, SFP-Lyon 26/09) :
 *
 *  - pre-event : ouvrable et PIN générable jusqu'à l'ouverture des portes, fermée à cet
 *    instant. Sans heure d'ouverture des portes renseignée : jusqu'à la fin de l'event.
 *  - post-event : ouvrable dès l'ouverture des portes, fermée à l'heure de fin de l'event
 *    (`eventEndTime` sur le jour de fin, sinon minuit local suivant). Sans heure
 *    d'ouverture des portes : dès minuit local le jour du match.
 *
 * `eventDate` est un jour ancré à minuit UTC, jamais une heure : le comparer à `now`
 * faisait passer le match du jour pour « passé » dès 00:00.
 */
export function inventoryWindowPeriod(
  event: EventDayFields,
  phase: InventoryWindowPhase,
  timeZone: string,
): InventoryWindowPeriod {
  const tz = timeZone || 'Europe/Paris';
  if (phase === 'pre-event') {
    return { opensAt: null, closesAt: resolvePreEventDeadline(event, tz) };
  }
  const doorsOpenAt = resolveDoorsOpenAt(event, tz);
  const eventEnd = resolveEventTransactionWindow(event, tz).end;
  const startDay = new Date((event.eventStartDate ?? event.eventDate) as any);
  const dayStart = combineDayAndLocalTime(startDay, '00:00', tz) ?? startDay;
  return { opensAt: doorsOpenAt ?? dayStart, closesAt: eventEnd };
}

export function inventoryWindowPeriodState(
  period: InventoryWindowPeriod,
  now: Date = new Date(),
): InventoryWindowPeriodState {
  if (period.opensAt && now < period.opensAt) return 'not-yet';
  if (now >= period.closesAt) return 'over';
  return 'open';
}

const formatLocal = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: timeZone || 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);

/** Message affiché au directeur quand l'ouverture ou le PIN est refusé hors période. */
export function periodRefusalMessage(
  phase: InventoryWindowPhase,
  state: InventoryWindowPeriodState,
  period: InventoryWindowPeriod,
  timeZone: string,
): string {
  const label = phase === 'pre-event' ? "L'inventaire pré-événement" : "L'inventaire post-événement";
  if (state === 'not-yet' && period.opensAt) {
    return `${label} ouvre à l'ouverture des portes (${formatLocal(period.opensAt, timeZone)}).`;
  }
  return phase === 'pre-event'
    ? `${label} est clôturé depuis l'ouverture des portes (${formatLocal(period.closesAt, timeZone)}).`
    : `${label} est clôturé depuis la fin de l'événement (${formatLocal(period.closesAt, timeZone)}).`;
}
