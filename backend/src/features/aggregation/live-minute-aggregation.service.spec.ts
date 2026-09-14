import { LiveMinuteAggregationService } from './live-minute-aggregation.service';
import { EventWindowResolverService } from './event-window-resolver.service';
import { EventRollupService } from './event-rollup.service';
import { liveWatermarkKey } from '../../shared/constants/live-aggregation';

const sqlText = (sql: any): string => (sql?.strings ?? []).join('?');

describe('LiveMinuteAggregationService (BUG-379-02)', () => {
    const event = {
        id: 'pfc-lyon',
        name: 'PFC-Lyon',
        eventDate: new Date('2026-09-12T00:00:00Z'),
        eventStartDate: new Date('2026-09-12T00:00:00Z'),
        eventEndDate: new Date('2026-09-12T00:00:00Z'),
        eventEndTime: '23:50',
        weezeventEventId: null,
        integrationId: 'pfc',
        calculatedAt: new Date('2026-09-12T16:00:00Z'),
        ticketsScanned: null,
        ticketsSold: null,
    };
    const minute1 = new Date('2026-09-12T17:01:00Z');
    const minute2 = new Date('2026-09-12T17:03:00Z');

    let prisma: any;
    let redis: any;
    let store: Map<string, unknown>;
    let service: LiveMinuteAggregationService;

    const job = (): any => ({ data: { tenantId: 'tenant', spaceId: 'jean-bouin', eventIds: ['pfc-lyon'], integrationId: 'pfc', jobLogId: 'log-1' } });

    beforeEach(() => {
        store = new Map();
        prisma = {
            aggregationJobLog: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ metadata: { trigger: 'live-sync' } }) },
            event: { findMany: jest.fn().mockResolvedValue([event]), update: jest.fn() },
            space: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Europe/Paris' }) },
            salesEvent: { findMany: jest.fn().mockResolvedValue([]) },
            spaceRevenueMinuteAgg: { deleteMany: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _sum: { revenueHt: 100, transactionsCount: 10 } }) },
            spaceRevenueMinuteItemAgg: { deleteMany: jest.fn() },
            $queryRaw: jest.fn(),
            $executeRaw: jest.fn().mockResolvedValue(1),
        };
        redis = {
            get: jest.fn(async (k: string) => store.get(k) ?? null),
            set: jest.fn(async (k: string, v: unknown) => { store.set(k, v); }),
            delete: jest.fn(async (k: string) => { store.delete(k); }),
            has: jest.fn(async (k: string) => store.has(k)),
            deletePattern: jest.fn(),
        };
        // 1er $queryRaw : conteneurs de saison (aucun) ; 2e : minutes touchées.
        prisma.$queryRaw
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { minute: minute1, lastUpdatedAt: new Date('2026-09-12T17:01:30Z') },
                { minute: minute2, lastUpdatedAt: new Date('2026-09-12T17:03:40Z') },
            ]);
        service = new LiveMinuteAggregationService(prisma, redis, new EventWindowResolverService(prisma), new EventRollupService(prisma));
    });

    it('recomputes only the touched minutes and advances the watermark', async () => {
        const result = await service.execute(job());

        expect(result.minutesProcessed).toBe(2);
        expect(prisma.spaceRevenueMinuteAgg.deleteMany).toHaveBeenCalledWith({
            where: { tenantId: 'tenant', spaceId: 'jean-bouin', weezeventEventId: 'pfc-lyon', minute: { in: [minute1, minute2] } },
        });
        expect(prisma.spaceRevenueMinuteItemAgg.deleteMany).toHaveBeenCalledTimes(1);
        // Deux INSERT (minute agg + item agg), jamais la table jour par produit.
        expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
        const inserts = prisma.$executeRaw.mock.calls.map((c: any[]) => sqlText(c[0]));
        expect(inserts[0]).toContain('INSERT INTO "SpaceRevenueMinuteAgg"');
        expect(inserts[0]).toContain(`date_trunc('minute', t."transactionDate") IN (`);
        expect(inserts[1]).toContain('INSERT INTO "SpaceRevenueMinuteItemAgg"');
        expect(inserts.some((s: string) => s.includes('SpaceProductRevenueDailyAgg'))).toBe(false);
        expect(store.get(liveWatermarkKey('pfc-lyon'))).toBe('2026-09-12T17:03:40.000Z');
        expect(prisma.event.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pfc-lyon' } }));
    });

    it('looks for transactions updated since the watermark (with overlap), falling back to calculatedAt', async () => {
        await service.execute(job());
        const touchedQuery = prisma.$queryRaw.mock.calls[1][0];
        expect(sqlText(touchedQuery)).toContain('AND t."updatedAt" > ');
        // calculatedAt 16:00 moins 60 s d'overlap
        expect(touchedQuery.values).toContainEqual(new Date('2026-09-12T15:59:00Z'));
    });

    it('does nothing (no delete, no insert) when no minute was touched', async () => {
        prisma.$queryRaw.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
        const result = await service.execute(job());
        expect(result.minutesProcessed).toBe(0);
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
        expect(redis.deletePattern).not.toHaveBeenCalled();
    });

    it('clears the pending flag at start and preserves metadata.trigger at completion', async () => {
        store.set('live:agg:pending:jean-bouin:pfc', '1');
        await service.execute(job());
        expect(store.has('live:agg:pending:jean-bouin:pfc')).toBe(false);
        const completion = prisma.aggregationJobLog.update.mock.calls.find((c: any[]) => c[0].data.status === 'completed');
        expect(completion[0].data.metadata).toEqual(expect.objectContaining({ trigger: 'live-sync', minutesProcessed: 2, errorCount: 0 }));
    });
});
