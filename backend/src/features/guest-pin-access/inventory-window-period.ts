import {
  EventDayFields,
  combineDayAndLocalTime,
  resolveDoorsOpenAt,
  resolveEventTransactionWindow,
} from '../../shared/utils/event-window.util';

export type InventoryWindowPhase = 'pre-event' | 'post-event';

/** Phases d'inventaire (comptage par PDV). Une fenêtre `InventoryWindow` peut aussi
 *  porter la phase `ventilation` (accès PIN des logisticiens, chantier
 *  logistic_ventilation) : tout chemin propre à l'inventaire doit filtrer sur cette
 *  liste, sinon une fenêtre de ventilation serait prise pour un inventaire. */
export const INVENTORY_PHASES: InventoryWindowPhase[] = ['pre-event', 'post-event'];
export const VENTILATION_PHASE = 'ventilation';

export function isInventoryPhase(phase: string | null | undefined): phase is InventoryWindowPhase {
  return phase === 'pre-event' || phase === 'post-event';
}

/** Où en est la période d'une fenêtre à un instant donné. */
export type InventoryWindowPeriodState = 'not-yet' | 'open' | 'over';

export interface InventoryWindowPeriod {
  /** null = ouvrable dès maintenant. */
  opensAt: Date | null;
  /** null = aucune fermeture automatique (post-event : clôturé par l'utilisateur). */
  closesAt: Date | null;
}

/**
 * Période pendant laquelle une fenêtre invité (PIN) peut exister, règle Ulrich 2026-09-28
 * (incident Stade Jean Bouin, SFP-Lyon 26/09) :
 *
 *  - pre-event : ouvrable et PIN générable à tout moment jusqu'à la FIN RÉELLE de l'event
 *    (heure de fin saisie, sinon minuit local). Retour Bertrand 2026-10-07 : après
 *    l'ouverture des portes, le pre-event reste disponible PDV par PDV (réouverture
 *    manuelle), chaque PDV s'arrêtant seul à sa première vente (InventoryCycleCronService).
 *    Remplace la fermeture aux portes (règle 2026-09-29).
 *  - post-event : ouvrable dès l'ouverture des portes (sans heure renseignée : dès minuit
 *    local le jour du match), SANS fermeture automatique : c'est l'utilisateur qui clôture
 *    (« Update Logistic », qui ferme la fenêtre et pousse le comptage). Décision Ulrich
 *    2026-09-28, revenue sur une première version fermée à l'heure de fin de l'event.
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
    return { opensAt: null, closesAt: resolveEventTransactionWindow(event, tz).end };
  }
  const doorsOpenAt = resolveDoorsOpenAt(event, tz);
  const startDay = new Date((event.eventStartDate ?? event.eventDate) as any);
  const dayStart = combineDayAndLocalTime(startDay, '00:00', tz) ?? startDay;
  return { opensAt: doorsOpenAt ?? dayStart, closesAt: null };
}

export function inventoryWindowPeriodState(
  period: InventoryWindowPeriod,
  now: Date = new Date(),
): InventoryWindowPeriodState {
  if (period.opensAt && now < period.opensAt) return 'not-yet';
  if (period.closesAt && now >= period.closesAt) return 'over';
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
  // Seul le pre-event a une fin ('over') : le post-event n'est jamais fermé par la période.
  return period.closesAt
    ? `${label} est clôturé depuis l'ouverture des portes (${formatLocal(period.closesAt, timeZone)}).`
    : `${label} est clôturé.`;
}
