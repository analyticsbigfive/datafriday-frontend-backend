import { AggregationService } from './aggregation.service';
import { LiveMinuteAggregationService } from './live-minute-aggregation.service';
import { EventWindowResolverService } from './event-window-resolver.service';
import { EventRollupService } from './event-rollup.service';
import { SpaceIntegrationScopeService } from './space-integration-scope.service';
import { BasketAggregationService } from './basket-aggregation.service';
import { SyncStaleRowsService } from './sync-stale-rows.service';
import { EventSalesSourceService } from '../event-sales-sources/event-sales-source.service';
import { EventSourceResolverService } from './event-source-resolver.service';

/**
 * Banc des tests de caractérisation (S0 de l'ADR multi-source). Construit les services réels sur
 * des doubles Prisma/Redis qui ENREGISTRENT, dans l'ordre, tout ce qu'ils reçoivent (suppressions,
 * SQL normalisé, écritures Redis, mises en file). Les specs `*.baseline.spec.ts` figent ce journal
 * pour un espace 100 % Weezevent et un espace 100 % Digifood : ils ne doivent jamais être modifiés.
 * Seule cette fabrique évolue quand un service reçoit une dépendance de plus.
 */

export const BASELINE_TENANT = 'tenant-1';
export const BASELINE_SPACE = 'space-1';
export const BASELINE_EVENT_DATE = new Date('2026-09-12T00:00:00Z');
export const BASELINE_MINUTES = [
  { minute: new Date('2026-09-12T17:01:00Z'), lastUpdatedAt: new Date('2026-09-12T17:01:30Z') },
  { minute: new Date('2026-09-12T17:03:00Z'), lastUpdatedAt: new Date('2026-09-12T17:03:40Z') },
];

export type BaselineProvider = 'weezevent' | 'digifood';

export interface BaselineSpace {
  provider: BaselineProvider;
  integrationId: string;
  /** SalesEvent de saison (conteneur) : déclaré sur 5 jours côté Weezevent, provider digifood côté Digifood. */
  containerId: string;
}

export const BASELINE_SPACES: Record<BaselineProvider, BaselineSpace> = {
  weezevent: { provider: 'weezevent', integrationId: 'int-W', containerId: 'season-W' },
  digifood: { provider: 'digifood', integrationId: 'int-D', containerId: 'season-D' },
};

export type BaselineMode = 'exact' | 'integration-range' | 'container-range' | 'range';

/** Event de test pour chaque mode historique de fenêtre (event-window-resolver). */
export function baselineEvent(space: BaselineSpace, mode: BaselineMode): any {
  const base = {
    id: 'evt-1',
    name: 'Evt 1',
    tenantId: BASELINE_TENANT,
    spaceId: BASELINE_SPACE,
    eventDate: BASELINE_EVENT_DATE,
    eventStartDate: BASELINE_EVENT_DATE,
    eventEndDate: BASELINE_EVENT_DATE,
    eventEndTime: '23:50',
    weezeventEventId: null as string | null,
    integrationId: null as string | null,
    calculatedAt: new Date('2026-09-12T16:00:00Z'),
    ticketsScanned: null,
    ticketsSold: null,
  };
  switch (mode) {
    case 'exact':
      return { ...base, weezeventEventId: 'se-1' };
    case 'integration-range':
      return { ...base, integrationId: space.integrationId };
    case 'container-range':
      return { ...base, weezeventEventId: space.containerId };
    default:
      return base;
  }
}

/** Journal ordonné de tout ce que les services écrivent ou lisent en SQL. */
export type BaselineLog = any[];

/** Texte SQL normalisé (espaces repliés) et paramètres d'un Prisma.Sql. */
export function normalizeSql(sql: any): { sql: string; values: unknown[] } {
  const strings = Array.isArray(sql) ? sql : (sql?.strings ?? []);
  const text = strings.join('?').replace(/\s+/g, ' ').trim();
  return { sql: text, values: Array.isArray(sql) ? [] : (sql?.values ?? []) };
}

/** Un horodatage « maintenant » (rebuild) n'est pas déterministe : masqué, les autres sont figés. */
function maskNow(value: unknown): unknown {
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(t) && Math.abs(Date.now() - t) < 60_000 ? '<now>' : value;
}

/** Ligne EventSalesSource de test (sources déclarées, ADR multi-source). */
export interface DeclaredRow {
  eventId: string;
  integrationId: string;
  salesEventId?: string | null;
  windowMode?: string;
  origin?: string;
}

export function createBaselineHarness(space: BaselineSpace, events: any[], declared: DeclaredRow[] = []) {
  const log: BaselineLog = [];
  const redisStore = new Map<string, unknown>();

  const deleteMany = (table: string) =>
    jest.fn(async (arg: any) => {
      log.push({ op: 'deleteMany', table, where: arg?.where });
      return { count: 0 };
    });

  const prisma: any = {
    aggregationJobLog: {
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ metadata: {} }),
    },
    event: {
      findMany: jest.fn(async () => events),
      findFirst: jest.fn(async () => events[0] ?? null),
      update: jest.fn(async (arg: any) => {
        log.push({ op: 'event.update', where: arg.where, data: { ...arg.data, calculatedAt: '<now>' } });
      }),
    },
    space: { findFirst: jest.fn(async () => ({ timezone: 'Europe/Paris' })) },
    salesEvent: {
      findMany: jest.fn(async (arg: any) => {
        const where = arg?.where ?? {};
        if (where.OR) {
          // Présences à synchroniser : un SalesEvent du jour pour l'intégration de l'espace.
          return [{ externalId: 'ext-1', integrationId: space.integrationId, startDate: BASELINE_EVENT_DATE }];
        }
        if (where.startDate) {
          return space.provider === 'weezevent'
            ? [{ id: space.containerId, startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z') }]
            : [];
        }
        if (where.metadata) return space.provider === 'digifood' ? [{ id: space.containerId }] : [];
        return [];
      }),
    },
    // Aucune source déclarée : espaces 100 % Weezevent / Digifood (source historique dérivée).
    eventSalesSource: {
      findMany: jest.fn(async (arg: any) => {
        const where = arg?.where ?? {};
        const rows = declared.map((d) => ({
          eventId: d.eventId,
          integrationId: d.integrationId,
          salesEventId: d.salesEventId ?? null,
          windowMode: d.windowMode ?? 'sales-event-range',
          origin: d.origin ?? 'pos',
        }));
        if (where.eventId?.in) return rows.filter((r) => where.eventId.in.includes(r.eventId));
        if (where.salesEventId) return rows.filter((r) => r.salesEventId && r.origin !== 'auto');
        return rows;
      }),
    },
    locationSpaceMapping: {
      // Les intégrations des sources déclarées sont mappées à l'espace (invariant ADR 4.0).
      findMany: jest.fn(async () => [space.integrationId, ...declared.map((d) => d.integrationId)].map((salesLocationId) => ({ salesLocationId }))),
      findFirst: jest.fn(async () => ({ spaceId: BASELINE_SPACE })),
    },
    spaceRevenueMinuteAgg: {
      deleteMany: deleteMany('SpaceRevenueMinuteAgg'),
      aggregate: jest.fn(async (arg: any) => {
        log.push({ op: 'rollup', where: arg.where });
        return { _sum: { revenueHt: 100, transactionsCount: 10, itemsCount: 20 }, _count: 1 };
      }),
    },
    spaceRevenueMinuteItemAgg: { deleteMany: deleteMany('SpaceRevenueMinuteItemAgg') },
    spaceProductRevenueDailyAgg: { deleteMany: deleteMany('SpaceProductRevenueDailyAgg') },
    spaceBasketMinuteAgg: { deleteMany: deleteMany('SpaceBasketMinuteAgg') },
    $queryRaw: jest.fn(async (sql: any) => {
      const n = normalizeSql(sql);
      log.push({ op: '$queryRaw', ...n });
      if (n.sql.includes('MIN(t."transactionDate")')) return [];
      if (n.sql.includes('SELECT NOW()') || n.sql.toLowerCase().includes('now()')) return [{ now: new Date('2026-09-12T18:00:00Z') }];
      return BASELINE_MINUTES;
    }),
    $executeRaw: jest.fn(async (sql: any) => {
      log.push({ op: '$executeRaw', ...normalizeSql(sql) });
      return 1;
    }),
  };

  const redis: any = {
    get: jest.fn(async (key: string) => (redisStore.has(key) ? redisStore.get(key) : null)),
    set: jest.fn(async (key: string, value: unknown, opts?: any) => {
      redisStore.set(key, value);
      log.push({ op: 'redis.set', key, ttl: opts?.ttl ?? opts, ...(String(key).startsWith('live:agg:watermark') ? { value: maskNow(value) } : {}) });
    }),
    delete: jest.fn(async (key: string) => {
      redisStore.delete(key);
      log.push({ op: 'redis.delete', key });
    }),
    has: jest.fn(async (key: string) => redisStore.has(key)),
    deletePattern: jest.fn(async (pattern: string) => {
      log.push({ op: 'redis.deletePattern', pattern });
    }),
  };

  const queue: any = {
    queueAggregationJob: jest.fn(async (data: any) => {
      log.push({ op: 'queueAggregationJob', data });
      return { id: 'bull-1' };
    }),
    queueWeezeventSyncType: jest.fn(async (...args: any[]) => {
      log.push({ op: 'queueWeezeventSyncType', args });
    }),
  };

  const salesSources = new EventSalesSourceService(prisma);
  const windowResolver = new EventWindowResolverService(prisma, redis, salesSources);
  const sourceResolver = new EventSourceResolverService(windowResolver, salesSources);
  const rollup = new EventRollupService(prisma);
  const scope = new SpaceIntegrationScopeService(prisma);
  const basket = new BasketAggregationService(prisma, windowResolver, scope, sourceResolver);
  const syncStale = new SyncStaleRowsService(prisma);
  const aggregation = new AggregationService(prisma, queue, redis, windowResolver, rollup, scope, basket, syncStale, sourceResolver);
  const live = new LiveMinuteAggregationService(prisma, redis, windowResolver, rollup, scope, basket, sourceResolver);

  return { prisma, redis, queue, log, redisStore, aggregation, live, basket, syncStale, windowResolver };
}

export function baselineBullJob(integrationId: string | undefined, extra: Record<string, unknown> = {}): any {
  return {
    data: {
      tenantId: BASELINE_TENANT,
      spaceId: BASELINE_SPACE,
      eventIds: ['evt-1'],
      integrationId,
      jobLogId: 'log-1',
      type: 'process-events',
      ...extra,
    },
    updateProgress: jest.fn().mockResolvedValue(undefined),
  };
}
