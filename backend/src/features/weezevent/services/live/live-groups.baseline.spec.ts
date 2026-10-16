import { LiveEventWindowService } from './live-event-window.service';
import { createLiveTriggerService, createLiveWindowService } from './live-groups.baseline.harness';

/**
 * S0 (ADR_MULTI_SOURCE) : caractérisation du Live pour un espace 100 % Weezevent et un espace
 * 100 % Digifood (groupes par (espace, intégration), intégrations en direct, clés Redis du
 * déclencheur, jobs mis en file). À ne pas modifier : sans source explicite la sortie est identique.
 */
const NOW = new Date('2026-09-12T17:30:00Z');

const candidate = (over: Record<string, unknown>) => ({
  id: 'evt',
  tenantId: 'tenant',
  spaceId: 'space-1',
  eventDate: new Date('2026-09-12T00:00:00Z'),
  eventStartDate: new Date('2026-09-12T00:00:00Z'),
  eventEndDate: new Date('2026-09-12T00:00:00Z'),
  eventEndTime: '23:50',
  integrationId: null as string | null,
  space: { timezone: 'Europe/Paris' },
  weezeventEvent: null as { integrationId: string } | null,
  ...over,
});

describe('Baseline Live (S0, ne pas modifier)', () => {
  const scenarios: Record<string, any[]> = {
    'espace 100 % Weezevent (Event.integrationId et SalesEvent lié)': [
      candidate({ id: 'a', integrationId: 'int-W' }),
      candidate({ id: 'b', weezeventEvent: { integrationId: 'int-W2' } }),
      candidate({ id: 'c', integrationId: 'int-W' }),
    ],
    'espace 100 % Digifood': [
      candidate({ id: 'd', integrationId: 'int-D' }),
      candidate({ id: 'e', integrationId: 'int-D' }),
    ],
    'event sans intégration connue': [candidate({ id: 'f' }), candidate({ id: 'g', spaceId: 'space-2', integrationId: 'int-W' })],
  };

  for (const [label, rows] of Object.entries(scenarios)) {
    it(`findLiveEvents, groupes et intégrations en direct : ${label}`, async () => {
      const prisma: any = {
        event: { findMany: jest.fn().mockResolvedValue(rows) },
        integration: { findMany: jest.fn().mockResolvedValue([{ id: 'all-1' }, { id: 'all-2' }]) },
      };
      const service = createLiveWindowService(prisma);
      const live = await service.findLiveEvents(NOW);
      const groups = LiveEventWindowService.groupBySpaceAndIntegration(live);
      const ids = await service.findLiveIntegrationIds(live);
      expect({ live, groups, ids: [...ids].sort(), integrationQuery: prisma.integration.findMany.mock.calls }).toMatchSnapshot();
    });
  }

  it('déclencheur : clés Redis, jobs mis en file et journaux, groupe Weezevent et groupe Digifood', async () => {
    const log: any[] = [];
    const store = new Map<string, unknown>();
    const redis: any = {
      has: jest.fn(async (k: string) => store.has(k)),
      get: jest.fn(async (k: string) => store.get(k) ?? null),
      set: jest.fn(async (k: string, _v: unknown, o: any) => {
        store.set(k, 1);
        log.push({ op: 'redis.set', key: k, ttl: o?.ttl });
      }),
      delete: jest.fn(async (k: string) => {
        store.delete(k);
        log.push({ op: 'redis.delete', key: k });
      }),
    };
    const queue: any = { queueAggregationJob: jest.fn(async (d: any) => log.push({ op: 'queue', data: d })) };
    const prisma: any = {
      event: { findMany: jest.fn().mockResolvedValue([{ eventDate: new Date('2026-09-12T00:00:00Z') }]) },
      aggregationJobLog: {
        create: jest.fn(async (a: any) => {
          log.push({ op: 'jobLog.create', data: a.data });
          return { id: 'log-1' };
        }),
      },
    };
    const trigger = createLiveTriggerService(prisma, queue, redis);
    const weez = { tenantId: 'tenant', spaceId: 'space-1', integrationId: 'int-W', eventIds: ['a', 'c'] };
    const digi = { tenantId: 'tenant', spaceId: 'space-1', integrationId: 'int-D', eventIds: ['d'] };
    const first = await trigger.queueMinuteAggregation(weez, 'live-sync');
    const coalesced = await trigger.queueMinuteAggregation(weez, 'webhook-live');
    const other = await trigger.queueMinuteAggregation(digi, 'live-sync');
    await trigger.queueFullRebuild(weez, 'live-reconciliation');
    expect({ first, coalesced, other, log }).toMatchSnapshot();
  });
});
