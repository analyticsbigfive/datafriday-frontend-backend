import { EventDayFields, resolveEventTransactionWindow } from '../../../shared/utils/event-window.util';
import { posSellableUntil } from '../../guest-pin-access/pos-period';
import type { PosEventListItem } from '../pos.contracts';

/**
 * Statut d'un évènement pour le POS : 'live' dès le début de sa fenêtre de ventes (minuit local du
 * premier jour) et tant que la caisse est vendable (fin réelle + grâce, `posSellableUntil`),
 * 'upcoming' avant, null une fois la caisse fermée (évènement hors liste).
 */
export function posEventStatus(event: EventDayFields, timeZone: string, now: Date = new Date()): PosEventListItem['status'] | null {
  const tz = timeZone || 'Europe/Paris';
  if (now.getTime() >= posSellableUntil(event, tz).getTime()) return null;
  return now.getTime() >= resolveEventTransactionWindow(event, tz).start.getTime() ? 'live' : 'upcoming';
}
