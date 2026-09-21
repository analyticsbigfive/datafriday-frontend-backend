import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import {
  buildIntegrationClause,
  buildMatchClause,
  EventAggregationSqlInput,
  insertMinuteBasketAggSql,
  isUnscopedRangeWindow,
} from './event-aggregation-sql';
import { EventWindowResolverService } from './event-window-resolver.service';
import { SpaceIntegrationScopeService } from './space-integration-scope.service';
import { EventDayFields } from '../../shared/utils/event-window.util';

/**
 * Écriture de SpaceBasketMinuteAgg (paniers pré-agrégés de l'Analyse).
 *
 * - `replaceForEvent` : brique des deux pipelines (rebuild complet, live à la minute), appelée
 *   avec la MÊME purge scopée et le MÊME sqlInput (fenêtre, intégration, minutes) que les
 *   tables minute existantes, pour que paniers et timeline décrivent le même périmètre.
 * - `backfillSpace` : remplissage initial d'un espace déjà agrégé, sans rejouer tout le rebuild
 *   (script scripts/backfill-basket-agg.ts). Même résolution de fenêtre que executeProcessEvents.
 */
@Injectable()
export class BasketAggregationService {
  private readonly logger = new Logger(BasketAggregationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly windowResolver: EventWindowResolverService,
    private readonly spaceIntegrationScope: SpaceIntegrationScopeService,
  ) {}

  async replaceForEvent(deleteWhere: Prisma.SpaceBasketMinuteAggWhereInput, sqlInput: EventAggregationSqlInput): Promise<number> {
    await this.prisma.spaceBasketMinuteAgg.deleteMany({ where: deleteWhere });
    return this.prisma.$executeRaw(insertMinuteBasketAggSql(sqlInput));
  }

  async backfillSpace(tenantId: string, spaceId: string): Promise<{ events: number; rows: number; skipped: string[] }> {
    const [space, events, spaceIntegrationIds, seasonContainerIds] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { timezone: true } }),
      this.prisma.event.findMany({
        where: { tenantId, spaceId },
        select: { id: true, eventDate: true, eventStartDate: true, eventEndDate: true, eventEndTime: true, weezeventEventId: true, integrationId: true },
        orderBy: { eventDate: 'asc' },
      }),
      this.spaceIntegrationScope.resolve(tenantId, spaceId),
      this.windowResolver.resolveSeasonContainerEventIds(tenantId),
    ]);
    const spaceTimezone = space?.timezone || 'Europe/Paris';
    const allSpaceEvents: EventDayFields[] = events;

    let rows = 0;
    const skipped: string[] = [];
    for (const event of events) {
      const window = this.windowResolver.resolveEventWindow(event, spaceTimezone, seasonContainerIds, allSpaceEvents);
      // Sans intégration mappée, une fenêtre de dates seule agrégerait tout le tenant (BUG-384-02).
      if (isUnscopedRangeWindow(undefined, window, spaceIntegrationIds)) {
        skipped.push(event.id);
        continue;
      }
      const sqlInput: EventAggregationSqlInput = {
        tenantId,
        spaceId,
        eventId: event.id,
        integrationClause: buildIntegrationClause(undefined, window, spaceIntegrationIds),
        matchClause: buildMatchClause(window, seasonContainerIds),
      };
      try {
        rows += await this.replaceForEvent({ tenantId, spaceId, weezeventEventId: event.id }, sqlInput);
      } catch (err) {
        this.logger.warn(`Basket backfill failed for event ${event.id} (space ${spaceId}): ${(err as Error).message}`);
        skipped.push(event.id);
      }
    }
    return { events: events.length - skipped.length, rows, skipped };
  }
}
