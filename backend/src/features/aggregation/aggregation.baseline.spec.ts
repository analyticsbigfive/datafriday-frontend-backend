import {
  BASELINE_SPACE,
  BASELINE_SPACES,
  BASELINE_TENANT,
  BaselineMode,
  BaselineProvider,
  baselineBullJob,
  baselineEvent,
  createBaselineHarness,
} from './aggregation.baseline.harness';

/**
 * S0 (ADR_MULTI_SOURCE) : caractérisation du comportement ACTUEL pour un espace 100 % Weezevent
 * et un espace 100 % Digifood. Chaque scénario fige le journal ordonné des suppressions
 * (`where` exacts), du SQL normalisé et de ses paramètres, des écritures Redis, du rollup et des
 * mises en file. Ces snapshots ne doivent PAS changer avec le code multi-source : sans source
 * explicite, tout est identique à l'octet.
 */
const PROVIDERS: BaselineProvider[] = ['weezevent', 'digifood'];
const MODES: BaselineMode[] = ['exact', 'integration-range', 'container-range', 'range'];

describe('Baseline agrégation (S0, ne pas modifier)', () => {
  for (const provider of PROVIDERS) {
    const space = BASELINE_SPACES[provider];
    describe(`espace 100 % ${provider}`, () => {
      for (const mode of MODES) {
        for (const withJobIntegration of [true, false]) {
          const label = `${mode}, job ${withJobIntegration ? 'avec' : 'sans'} integrationId`;
          const jobIntegration = withJobIntegration ? space.integrationId : undefined;

          it(`rebuild complet : ${label}`, async () => {
            const h = createBaselineHarness(space, [baselineEvent(space, mode)]);
            const result = await h.aggregation.executeProcessEvents(baselineBullJob(jobIntegration));
            expect({
              statuses: result.results.map((r: any) => [r.status, r.error, r.integrationId]),
              log: h.log,
            }).toMatchSnapshot();
          });

          it(`job minutes live : ${label}`, async () => {
            const h = createBaselineHarness(space, [baselineEvent(space, mode)]);
            const result = await h.live.execute(baselineBullJob(jobIntegration, { type: 'process-event-minutes' }));
            expect({ minutesProcessed: result.minutesProcessed, errors: result.errors, log: h.log }).toMatchSnapshot();
          });
        }
      }

      it('rebuild de deux events du même espace (modes différents) dans un même job', async () => {
        const second = { ...baselineEvent(space, 'range'), id: 'evt-2', name: 'Evt 2' };
        const h = createBaselineHarness(space, [baselineEvent(space, 'exact'), second]);
        await h.aggregation.executeProcessEvents(baselineBullJob(space.integrationId, { eventIds: ['evt-1', 'evt-2'] }));
        expect(h.log).toMatchSnapshot();
      });

      it('backfill des paniers', async () => {
        const h = createBaselineHarness(space, [baselineEvent(space, 'integration-range'), { ...baselineEvent(space, 'exact'), id: 'evt-2' }]);
        const result = await h.basket.backfillSpace(BASELINE_TENANT, BASELINE_SPACE);
        expect({ result, log: h.log }).toMatchSnapshot();
      });

      it('balayage de fin de resynchronisation, avec et sans integrationId', async () => {
        const h = createBaselineHarness(space, []);
        const startedAt = new Date('2026-09-12T18:00:00Z');
        await h.syncStale.purge(BASELINE_TENANT, BASELINE_SPACE, space.integrationId, startedAt, [{ eventId: 'evt-9', date: '2026-09-12' }]);
        await h.syncStale.purge(BASELINE_TENANT, BASELINE_SPACE, undefined, startedAt, []);
        expect(h.log).toMatchSnapshot();
      });

      it('exclusion d\'un event (skipEvent)', async () => {
        const h = createBaselineHarness(space, [baselineEvent(space, 'exact')]);
        h.prisma.$transaction = jest.fn(async (ops: any[]) => Promise.all(ops));
        h.prisma.aggregationJobLog.create = jest.fn();
        await h.aggregation.skipEvent(BASELINE_TENANT, BASELINE_SPACE, 'evt-1');
        expect(h.log).toMatchSnapshot();
      });

      it('synchronize : balayage après reconstruction', async () => {
        const h = createBaselineHarness(space, [baselineEvent(space, 'integration-range')]);
        h.prisma.spaceRevenueMinuteAgg.aggregate = jest.fn(async () => ({ _sum: { revenueHt: 1, transactionsCount: 1, itemsCount: 1 }, _count: 1 }));
        await h.aggregation.executeSynchronize(baselineBullJob(space.integrationId, { type: 'synchronize' }));
        expect(h.log).toMatchSnapshot();
      });
    });
  }
});
