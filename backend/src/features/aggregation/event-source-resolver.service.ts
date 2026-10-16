import { Injectable, Logger } from '@nestjs/common';
import { EventDayFields, resolveEventTransactionWindow } from '../../shared/utils/event-window.util';
import { DeclaredSalesSource } from '../event-sales-sources/event-sales-source.types';
import { EventSalesSourceService } from '../event-sales-sources/event-sales-source.service';
import { EventWindowResolverService, WindowedEvent } from './event-window-resolver.service';
import { JobSourceDecision, routeJobSource } from './event-source-routing';

/**
 * Résolveur générique des sources de ventes d'un évènement (ADR_MULTI_SOURCE 4.2). Enveloppe
 * `EventWindowResolverService.resolveEventWindow` (source historique dérivée, code inchangé) et
 * y ajoute les sources déclarées dans EventSalesSource, sans jamais tester le nom d'un logiciel.
 */
@Injectable()
export class EventSourceResolverService {
  private readonly logger = new Logger(EventSourceResolverService.name);

  constructor(
    private readonly windowResolver: EventWindowResolverService,
    private readonly salesSources: EventSalesSourceService,
  ) {}

  /**
   * Sources déclarées des évènements, une seule lecture par job. Invariant ADR 4.0 : une source
   * dont l'intégration n'est pas mappée à l'espace est ignorée (et signalée).
   */
  async loadDeclared(
    tenantId: string,
    eventIds: ReadonlyArray<string>,
    spaceIntegrationIdsOrLoader: ReadonlyArray<string> | (() => Promise<ReadonlyArray<string>>),
  ): Promise<Map<string, DeclaredSalesSource[]>> {
    const all = await this.salesSources.listActiveByEvent(tenantId, eventIds);
    const mapped = new Map<string, DeclaredSalesSource[]>();
    if (!all.size) return mapped;
    // Chargeur paresseux : sans source déclarée (cas général), aucune lecture de mapping de plus.
    const spaceIntegrationIds =
      typeof spaceIntegrationIdsOrLoader === 'function' ? await spaceIntegrationIdsOrLoader() : spaceIntegrationIdsOrLoader;
    for (const [eventId, sources] of all) {
      const kept = sources.filter((s) => {
        const ok = spaceIntegrationIds.includes(s.integrationId);
        if (!ok) this.logger.warn(`Source ${s.integrationId} de l'évènement ${eventId} ignorée : intégration non mappée à l'espace`);
        return ok;
      });
      if (kept.length) mapped.set(eventId, kept);
    }
    return mapped;
  }

  /** Décide quelle source un job (clé = son integrationId) exécute pour cet évènement. */
  decide(input: {
    event: WindowedEvent;
    jobIntegrationId: string | undefined;
    declared: ReadonlyArray<DeclaredSalesSource>;
    spaceTimezone: string;
    seasonContainerIds: ReadonlySet<string>;
    allSpaceEvents: ReadonlyArray<EventDayFields>;
    spaceIntegrationIds: ReadonlyArray<string>;
  }): JobSourceDecision {
    const { event, spaceTimezone, allSpaceEvents } = input;
    const derivedWindow = this.windowResolver.resolveEventWindow(event, spaceTimezone, input.seasonContainerIds, allSpaceEvents);
    return routeJobSource({
      jobIntegrationId: input.jobIntegrationId,
      declared: input.declared,
      spaceIntegrationIds: input.spaceIntegrationIds,
      derivedWindow,
      dateRange: () => resolveEventTransactionWindow(event, spaceTimezone, allSpaceEvents),
    });
  }
}
