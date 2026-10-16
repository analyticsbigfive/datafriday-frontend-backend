import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import {
  buildIntegrationClause,
  buildMatchClause,
  EventAggregationSqlInput,
  insertMinuteBasketAgg,
  isUnscopedRangeWindow,
} from './event-aggregation.queries';
import { EventWindowResolverService } from './event-window-resolver.service';
import { SpaceIntegrationScopeService } from './space-integration-scope.service';
import { EventDayFields } from '../../shared/utils/event-window.util';
import { EventSourceResolverService } from './event-source-resolver.service';
import { sourceDeleteWhere } from './event-source-routing';

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
    private readonly sourceResolver: EventSourceResolverService,
  ) {}

  async replaceForEvent(deleteWhere: Prisma.SpaceBasketMinuteAggWhereInput, sqlInput: EventAggregationSqlInput): Promise<number> {
    await this.prisma.spaceBasketMinuteAgg.deleteMany({ where: deleteWhere });
    return insertMinuteBasketAgg(this.prisma, sqlInput);
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

    // ADR_MULTI_SOURCE : une passe pour la source historique (job sans intégration) puis une par
    // source déclarée ; chaque passe supprime selon la règle unique (jamais les lignes d'une autre source).
    const declaredByEvent = await this.sourceResolver.loadDeclared(tenantId, events.map((e) => e.id), spaceIntegrationIds);

    let rows = 0;
    const skipped: string[] = [];
    for (const event of events) {
      const declared = declaredByEvent.get(event.id) ?? [];
      const passes: Array<string | undefined> = [undefined, ...declared.map((d) => d.integrationId)];
      for (const jobIntegrationId of passes) {
        const decision = this.sourceResolver.decide({
          event, jobIntegrationId, declared, spaceTimezone, seasonContainerIds, allSpaceEvents, spaceIntegrationIds,
        });
        if (decision.status === 'no-source') continue;
        const { plan } = decision;
        // Sans intégration mappée, une fenêtre de dates seule agrégerait tout le tenant (BUG-384-02).
        if (isUnscopedRangeWindow(plan.clauseIntegrationId, plan.window, plan.fallbackIntegrationIds)) {
          skipped.push(event.id);
          break;
        }
        const sqlInput: EventAggregationSqlInput = {
          tenantId,
          spaceId,
          eventId: event.id,
          integrationClause: buildIntegrationClause(plan.clauseIntegrationId, plan.window, plan.fallbackIntegrationIds),
          matchClause: buildMatchClause(plan.window, seasonContainerIds),
        };
        try {
          // eslint-disable-next-line no-await-in-loop -- events reconstruits un par un : grosses requêtes SQL, charge base bornée
          rows += await this.replaceForEvent(
            sourceDeleteWhere(plan, { tenantId, spaceId, weezeventEventId: event.id }, undefined), sqlInput,
          );
        } catch (err) {
          this.logger.warn(`Basket backfill failed for event ${event.id} (space ${spaceId}): ${(err as Error).message}`);
          skipped.push(event.id);
          break;
        }
      }
    }
    return { events: events.length - skipped.length, rows, skipped };
  }
}
