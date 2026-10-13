import { PrismaService } from '../../core/database/prisma.service';
import { inventoryWindowPeriod } from '../guest-pin-access/inventory-window-period';

/**
 * Statut « Brouillon » de la réconciliation post-event (retour Bertrand 2026-10-13 : elle
 * ne doit plus être en brouillon après l'Arrêt ou une fois l'événement passé).
 *
 * Brouillon = le comptage post-event du match peut encore évoluer :
 *  - fenêtre post-event ouverte, ou au moins un PDV rouvert un par un (accès PIN actif) ;
 *    sans fenêtre (comptage staff seul), seule la règle suivante s'applique ;
 *  - ET l'événement n'est pas passé : aucun événement suivant de l'espace n'a commencé
 *    (ouverture de son post-event : portes, sinon minuit local du jour).
 *
 * « Passé » n'est pas une heure de fin : les post-events se comptent souvent les jours
 * suivants (SFP-Montpellier du 10/10 compté jusqu'au 13/10), une borne horaire aurait
 * figé des documents en cours de comptage. Le match suivant, lui, clôt le cycle.
 *
 * Calculé à la reconstruction ET à la lecture de la liste : plusieurs chemins ferment la
 * fenêtre sans reconstruire le document (fenêtre remplacée par le match suivant, cron,
 * « Update Logistic »), et l'événement devient passé sans qu'aucune écriture n'ait lieu.
 */
export async function loadPostEventDraftStates(
  prisma: PrismaService,
  tenantId: string,
  spaceId: string,
  eventIds: string[],
  now: Date = new Date(),
): Promise<Map<string, boolean>> {
  const states = new Map<string, boolean>();
  const ids = [...new Set(eventIds)];
  if (!ids.length) return states;

  const [space, targets, windows] = await Promise.all([
    prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { timezone: true } }),
    prisma.event.findMany({ where: { tenantId, spaceId, id: { in: ids } }, select: EVENT_DAY_SELECT }),
    prisma.inventoryWindow.findMany({
      where: { tenantId, spaceId, eventId: { in: ids }, phase: 'post-event' },
      select: { id: true, eventId: true, status: true },
    }),
  ]);
  const timeZone = space?.timezone || 'Europe/Paris';

  const closedWindowIds = windows.filter((w) => w.status !== 'open').map((w) => w.id);
  const active = closedWindowIds.length
    ? await prisma.guestPinAccess.findMany({
        where: { tenantId, windowId: { in: closedWindowIds }, status: 'active' },
        select: { windowId: true },
        distinct: ['windowId'],
      })
    : [];
  const windowsWithActiveAccess = new Set(active.map((a) => a.windowId));
  const liveByEvent = new Map<string, boolean>();
  for (const w of windows) {
    liveByEvent.set(w.eventId, w.status === 'open' || windowsWithActiveAccess.has(w.id));
  }

  // Événements suivants déjà commencés : ceux dont le jour est entre le plus ancien match
  // concerné et demain (fuseaux), comparés à l'instant d'ouverture de leur post-event.
  const opensAt = (e: EventDay) => inventoryWindowPeriod(e, 'post-event', timeZone).opensAt;
  const earliest = targets.reduce<Date | null>((min, e) => {
    const d = new Date(e.eventDate);
    return !min || d < min ? d : min;
  }, null);
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const candidates = earliest
    ? await prisma.event.findMany({
        where: { tenantId, spaceId, eventDate: { gte: earliest, lte: tomorrow } },
        select: EVENT_DAY_SELECT,
      })
    : [];
  const startedOpenings = candidates
    .map((e) => ({ id: e.id, at: opensAt(e) }))
    .filter((c): c is { id: string; at: Date } => !!c.at && c.at <= now);

  for (const e of targets) {
    const own = opensAt(e);
    const passed = !!own && startedOpenings.some((c) => c.id !== e.id && c.at > own);
    states.set(e.id, (liveByEvent.get(e.id) ?? true) && !passed);
  }
  return states;
}

const EVENT_DAY_SELECT = {
  id: true,
  eventDate: true,
  eventStartDate: true,
  eventEndDate: true,
  eventEndTime: true,
  sessions: true,
} as const;

type EventDay = {
  id: string;
  eventDate: Date;
  eventStartDate: Date | null;
  eventEndDate: Date | null;
  eventEndTime: string | null;
  sessions: unknown;
};
