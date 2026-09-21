import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { EventDayFields, resolveEventTransactionWindow } from '../../shared/utils/event-window.util';
import { EventWindow } from './event-aggregation-sql';

// BUG-338-02 : même seuil que resolveEventSalesScope (spaces.service.ts). Un SalesEvent dont
// les transactions liées s'étalent sur plus de 2 jours est un conteneur de saison, pas un match.
const MAX_EVENT_SPAN_DAYS = 2;

// Cache des conteneurs de saison par tenant. Le span observé d'un event ne peut que croître
// (un conteneur le reste), et un event ne devient conteneur qu'après 2 jours de ventes : un
// retard de 10 min est sans effet visible. Sans cache, la requête span tournait à chaque job
// live à la minute (seq scan des 2M de transactions du tenant, 22 s de moyenne, 1er
// consommateur disque de la base mesuré le 2026-09-21).
const SEASON_CONTAINER_CACHE_PREFIX = 'season-containers';
const SEASON_CONTAINER_CACHE_TTL_SEC = 10 * 60;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * BUG-338-02 / BUG-361-02 / BUG-372-02 : conteneurs de saison du tenant, détectés par span
   * observé des transactions OU span déclaré du SalesEvent, plus les sites Digifood.
   * Résultat mis en cache 10 min par tenant (voir SEASON_CONTAINER_CACHE_*).
   */
  async resolveSeasonContainerEventIds(tenantId: string): Promise<Set<string>> {
    const cached = await this.redis.get<string[]>(tenantId, SEASON_CONTAINER_CACHE_PREFIX);
    if (Array.isArray(cached)) return new Set(cached);

    const ids = await this.computeSeasonContainerEventIds(tenantId);
    await this.redis.set(tenantId, [...ids], { prefix: SEASON_CONTAINER_CACHE_PREFIX, ttl: SEASON_CONTAINER_CACHE_TTL_SEC });
    return ids;
  }

  private async computeSeasonContainerEventIds(tenantId: string): Promise<Set<string>> {
    // Index couvrant WeezeventTransaction(tenantId, eventId, transactionDate, deletedAt) :
    // index-only scan trié par eventId, plus de seq scan de la table.
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
