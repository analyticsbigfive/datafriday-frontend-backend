import { LiveEventWindowService } from './live-event-window.service';
import { LiveAggregationTriggerService } from './live-aggregation-trigger.service';
import { EventSalesSourceService } from '../../../event-sales-sources/event-sales-source.service';

/** Fabriques des services Live du banc de caractérisation S0 (seules à évoluer si un constructeur change). */
export function createLiveWindowService(prisma: any): LiveEventWindowService {
    // Aucune source déclarée : espaces 100 % Weezevent / Digifood (source historique dérivée).
    const salesSources = new EventSalesSourceService({ eventSalesSource: { findMany: async () => [] } } as any);
    return new LiveEventWindowService(prisma, salesSources);
}

export function createLiveTriggerService(prisma: any, queue: any, redis: any): LiveAggregationTriggerService {
    return new LiveAggregationTriggerService(prisma, queue, redis);
}
