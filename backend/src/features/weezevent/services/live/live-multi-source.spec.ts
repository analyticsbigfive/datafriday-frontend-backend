import { LiveEvent, LiveEventWindowService } from './live-event-window.service';
import { LiveAggregationTriggerService } from './live-aggregation-trigger.service';

/**
 * ADR_MULTI_SOURCE S6 : Live d'un évènement à sources déclarées (historique Weezevent + caisse).
 * Deux groupes (un par source), un évènement 100 % déclaré ne met plus en direct les intégrations
 * Weezevent du tenant, une vente d'une source ne déclenche pas le groupe de l'autre.
 */
const base = (over: Partial<LiveEvent>): LiveEvent => ({
  id: 'evt', tenantId: 'tenant', spaceId: 'space-1', integrationId: null,
  windowStart: new Date('2026-09-11T22:00:00Z'), windowEnd: new Date('2026-09-12T21:50:00Z'), graceEnd: new Date('2026-09-13T00:50:00Z'),
  ...over,
});
const mixed = base({ id: 'mixed', integrationId: 'int-W', sourceIntegrationIds: ['int-POS'] });
const posOnly = base({ id: 'pos-only', integrationId: null, sourceIntegrationIds: ['int-POS'], declaredOnly: true });

describe('Live multi-source', () => {
  it('évènement mixte : un groupe par source, la source déclarée est marquée', () => {
    expect(LiveEventWindowService.groupBySpaceAndIntegration([mixed])).toEqual([
      { tenantId: 'tenant', spaceId: 'space-1', integrationId: 'int-W', eventIds: ['mixed'] },
      { tenantId: 'tenant', spaceId: 'space-1', integrationId: 'int-POS', eventIds: ['mixed'], declaredEventIds: ['mixed'] },
    ]);
  });

  it('évènement 100 % déclaré : un seul groupe (la source), jamais de groupe sans intégration', () => {
    expect(LiveEventWindowService.groupBySpaceAndIntegration([posOnly])).toEqual([
      { tenantId: 'tenant', spaceId: 'space-1', integrationId: 'int-POS', eventIds: ['pos-only'], declaredEventIds: ['pos-only'] },
    ]);
  });

  it('évènements sans source déclarée : sortie identique à l\'existant (aucune clé en plus)', () => {
    expect(LiveEventWindowService.groupBySpaceAndIntegration([base({ id: 'a', integrationId: 'int-W' }), base({ id: 'b' })])).toEqual([
      { tenantId: 'tenant', spaceId: 'space-1', integrationId: 'int-W', eventIds: ['a'] },
      { tenantId: 'tenant', spaceId: 'space-1', integrationId: null, eventIds: ['b'] },
    ]);
  });

  it('une vente de la source historique ne déclenche que son groupe, une vente de la caisse que le sien', () => {
    expect(LiveEventWindowService.groupsForIntegration([mixed, posOnly], 'int-W', 'tenant').map((g) => g.integrationId)).toEqual(['int-W']);
    expect(LiveEventWindowService.groupsForIntegration([mixed, posOnly], 'int-POS', 'tenant').map((g) => [g.integrationId, g.eventIds])).toEqual([['int-POS', ['mixed', 'pos-only']]]);
  });

  it('un évènement sans intégration connue reste déclenché par toute intégration du tenant, pas un évènement 100 % déclaré', () => {
    const unknown = base({ id: 'unknown' });
    expect(LiveEventWindowService.groupsForIntegration([unknown, posOnly], 'int-W', 'tenant').map((g) => g.eventIds)).toEqual([['unknown']]);
    expect(LiveEventWindowService.groupsForIntegration([unknown], 'int-W', 'other-tenant')).toEqual([]);
  });

  it('findLiveIntegrationIds : un évènement 100 % déclaré ne met pas en direct toutes les intégrations Weezevent du tenant', async () => {
    const prisma: any = { integration: { findMany: jest.fn().mockResolvedValue([{ id: 'all-1' }]) } };
    const service = new LiveEventWindowService(prisma, {} as any);
    const ids = await service.findLiveIntegrationIds([posOnly, mixed]);
    expect([...ids].sort()).toEqual(['int-POS', 'int-W']);
    expect(prisma.integration.findMany).not.toHaveBeenCalled();
  });

  it('findLiveEvents ajoute les sources déclarées des seuls évènements en direct (une lecture)', async () => {
    const candidate = (id: string, over: Record<string, unknown>) => ({
      id, tenantId: 'tenant', spaceId: 'space-1', eventDate: new Date('2026-09-12T00:00:00Z'), eventStartDate: new Date('2026-09-12T00:00:00Z'),
      eventEndDate: new Date('2026-09-12T00:00:00Z'), eventEndTime: '23:50', integrationId: null, space: { timezone: 'Europe/Paris' }, weezeventEvent: null, ...over,
    });
    const prisma: any = {
      event: { findMany: jest.fn().mockResolvedValue([candidate('mixed', { integrationId: 'int-W' }), candidate('pos-only', {}), candidate('plain', { integrationId: 'int-X' })]) },
    };
    const sources: any = {
      listActiveForEvents: jest.fn().mockResolvedValue(new Map([
        ['mixed', [{ integrationId: 'int-POS' }]],
        ['pos-only', [{ integrationId: 'int-POS' }]],
      ])),
    };
    const live = await new LiveEventWindowService(prisma, sources).findLiveEvents(new Date('2026-09-12T17:30:00Z'));
    expect(sources.listActiveForEvents).toHaveBeenCalledTimes(1);
    expect(live.find((e) => e.id === 'mixed')).toMatchObject({ sourceIntegrationIds: ['int-POS'] });
    expect(live.find((e) => e.id === 'mixed')?.declaredOnly).toBeUndefined();
    expect(live.find((e) => e.id === 'pos-only')).toMatchObject({ sourceIntegrationIds: ['int-POS'], declaredOnly: true });
    expect(live.find((e) => e.id === 'plain')).not.toHaveProperty('sourceIntegrationIds');
  });

  describe('déclencheur : coalescence et reconstruction par source', () => {
    const setup = () => {
      const store = new Map<string, unknown>();
      const redis: any = {
        has: jest.fn(async (k: string) => store.has(k)),
        get: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
        set: jest.fn(async (k: string, v: unknown) => { store.set(k, v); }),
        delete: jest.fn(async (k: string) => { store.delete(k); }),
      };
      const queue: any = { queueAggregationJob: jest.fn() };
      const prisma: any = { event: { findMany: jest.fn().mockResolvedValue([]) }, aggregationJobLog: { create: jest.fn().mockResolvedValue({ id: 'log' }) } };
      return { store, queue, trigger: new LiveAggregationTriggerService(prisma, queue, redis) };
    };

    it('deux sources du même espace = deux clés de coalescence indépendantes, deux jobs', async () => {
      const { trigger, queue } = setup();
      const [weez, pos] = LiveEventWindowService.groupBySpaceAndIntegration([mixed]);
      expect(await trigger.queueMinuteAggregation(weez, 'live-sync')).toBe(true);
      expect(await trigger.queueMinuteAggregation(pos, 'live-sync')).toBe(true);
      expect(await trigger.queueMinuteAggregation(pos, 'live-sync')).toBe(false);
      expect(queue.queueAggregationJob.mock.calls.map((c: any[]) => c[0].integrationId)).toEqual(['int-W', 'int-POS']);
    });

    it('clé de reconstruction : historique inchangée, source déclarée suffixée', async () => {
      const { trigger, store } = setup();
      const [weez, pos] = LiveEventWindowService.groupBySpaceAndIntegration([mixed]);
      await trigger.queueFullRebuild(weez, 'live-reconciliation');
      await trigger.queueFullRebuild(pos, 'live-reconciliation');
      expect([...store.keys()].sort()).toEqual(['live:agg:full:mixed', 'live:agg:full:mixed:int-POS']);
      expect(await trigger.lastFullRebuildAt('mixed')).toBeInstanceOf(Date);
      expect(await trigger.lastFullRebuildAt('mixed', 'int-POS')).toBeInstanceOf(Date);
      expect(await trigger.lastFullRebuildAt('other', 'int-POS')).toBeNull();
    });
  });
});
