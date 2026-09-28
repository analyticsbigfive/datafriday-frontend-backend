import { Prisma, PrismaClient } from '@prisma/client';
import { EVENT_OVER_LOOKBACK_MS, isEventOver } from './event-window.util';

type EventReader = Pick<PrismaClient, 'event'>;

/**
 * Nombre d'events TERMINÉS (cf. isEventOver) par espace, pour `where`. Les events de plus de
 * EVENT_OVER_LOOKBACK_MS sont comptés en base ; les plus récents sont évalués avec leur heure
 * de fin et le fuseau de leur espace. Remplace `event.count({ eventDate: { lte: now } })`,
 * qui comptait le match du jour comme passé dès minuit.
 */
export async function countEndedEventsBySpace(
  prisma: EventReader,
  where: Prisma.EventWhereInput,
  now: Date = new Date(),
): Promise<Map<string | null, number>> {
  const lookback = new Date(now.getTime() - EVENT_OVER_LOOKBACK_MS);
  const [old, recent] = await Promise.all([
    prisma.event.groupBy({
      by: ['spaceId'],
      where: { AND: [where, { eventDate: { lt: lookback } }] },
      _count: true,
    }),
    prisma.event.findMany({
      where: { AND: [where, { eventDate: { gte: lookback, lte: now } }] },
      select: {
        spaceId: true,
        eventDate: true,
        eventStartDate: true,
        eventEndDate: true,
        eventEndTime: true,
        space: { select: { timezone: true } },
      },
    }),
  ]);
  const counts = new Map<string | null, number>();
  for (const row of old) counts.set(row.spaceId, (counts.get(row.spaceId) ?? 0) + row._count);
  for (const e of recent) {
    if (!isEventOver(e, e.space?.timezone || 'Europe/Paris', now)) continue;
    counts.set(e.spaceId, (counts.get(e.spaceId) ?? 0) + 1);
  }
  return counts;
}
