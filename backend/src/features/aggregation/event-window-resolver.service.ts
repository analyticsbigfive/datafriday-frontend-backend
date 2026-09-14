import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { EventDayFields, resolveEventTransactionWindow } from '../../shared/utils/event-window.util';
import { EventWindow } from './event-aggregation-sql';

// BUG-338-02 : même seuil que resolveEventSalesScope (spaces.service.ts). Un SalesEvent dont
// les transactions liées s'étalent sur plus de 2 jours est un conteneur de saison, pas un match.
const MAX_EVENT_SPAN_DAYS = 2;

export interface WindowedEvent {
  id: string;
  eventDate: Date;
  eventStartDate: Date | null;
  eventEndDate: Date | null;
  eventEndTime: string | null;
  weezeventEventId: string | null;
  integrationId: string | null;
}

/** Résolution partagée (rebuild complet et jobs live par minute) de la fenêtre d'un event. */
@Injectable()
export class EventWindowResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * BUG-338-02 / BUG-361-02 / BUG-372-02 : conteneurs de saison du tenant, détectés par span
   * observé des transactions OU span déclaré du SalesEvent, plus les sites Digifood.
   */
  async resolveSeasonContainerEventIds(tenantId: string): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<Array<{ eventId: string; minDate: Date; maxDate: Date }>>(Prisma.sql`
      SELECT t."eventId", MIN(t."transactionDate") AS "minDate", MAX(t."transactionDate") AS "maxDate"
      FROM "WeezeventTransaction" t
      WHERE t."tenantId" = ${tenantId}
        AND t."eventId" IS NOT NULL
        AND t."deletedAt" IS NULL
      GROUP BY t."eventId"
    `);
    const spanMs = MAX_EVENT_SPAN_DAYS * 86_400_000;
    const containerIds = new Set(
      rows.filter((r) => new Date(r.maxDate).getTime() - new Date(r.minDate).getTime() > spanMs).map((r) => r.eventId),
    );

    const declaredSpanEvents = await this.prisma.salesEvent.findMany({
      where: { tenantId, startDate: { not: null }, endDate: { not: null } },
      select: { id: true, startDate: true, endDate: true },
    });
    declaredSpanEvents
      .filter((e) => e.endDate!.getTime() - e.startDate!.getTime() > spanMs)
      .forEach((e) => containerIds.add(e.id));

    const digifoodEvents = await this.prisma.salesEvent.findMany({
      where: { tenantId, metadata: { path: ['provider'], equals: 'digifood' } },
      select: { id: true },
    });
    digifoodEvents.forEach((e) => containerIds.add(e.id));

    return containerIds;
  }

  /**
   * Lien exact vers un match précis > `integration-range` (Event.integrationId) >
   * `container-range` (lien conteneur, legacy) > `range` (fenêtre seule).
   */
  resolveEventWindow(
    event: WindowedEvent,
    spaceTimezone: string,
    seasonContainerIds: ReadonlySet<string>,
    allSpaceEvents: ReadonlyArray<EventDayFields>,
  ): EventWindow {
    const isContainerLink = !!event.weezeventEventId && seasonContainerIds.has(event.weezeventEventId);
    if (event.weezeventEventId && !isContainerLink) {
      return { mode: 'exact', salesEventId: event.weezeventEventId };
    }
    const { start, end } = resolveEventTransactionWindow(event, spaceTimezone, allSpaceEvents);
    if (event.integrationId) {
      return { mode: 'integration-range', integrationId: event.integrationId, start, end };
    }
    return isContainerLink
      ? { mode: 'container-range', salesEventId: event.weezeventEventId as string, start, end }
      : { mode: 'range', start, end };
  }
}
