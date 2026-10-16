import {
  BASELINE_SPACES,
  baselineBullJob,
  baselineEvent,
  createBaselineHarness,
} from './aggregation.baseline.harness';

/**
 * ADR_MULTI_SOURCE S3 / S4 / S5 : évènement mixte (source historique Weezevent + source déclarée
 * « caisse »). Un job d'une source n'efface jamais les lignes d'une autre, chaque source a son
 * watermark, et un évènement 100 % source déclarée est ignoré sans erreur par le job historique.
 */
const W = BASELINE_SPACES.weezevent;
const POS = 'int-POS';
const POS_DECLARED = [{ eventId: 'evt-1', integrationId: POS, salesEventId: 'se-pos', windowMode: 'sales-event-range', origin: 'pos' }];

const deletes = (log: any[]) => log.filter((l) => l.op === 'deleteMany' && l.where.weezeventEventId === 'evt-1');
const inserts = (log: any[]) => log.filter((l) => l.op === '$executeRaw' && l.sql.includes('INSERT INTO'));

describe('Agrégation multi-source : évènement mixte', () => {
  describe('rebuild complet', () => {
    it('job de la source historique : ses suppressions épargnent les lignes de la source déclarée', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')], POS_DECLARED);
      await h.aggregation.executeProcessEvents(baselineBullJob(W.integrationId));
      const del = deletes(h.log);
      expect(del.length).toBeGreaterThan(0);
      for (const d of del) {
        expect(d.where.AND).toEqual([{ OR: [{ integrationId: null }, { integrationId: { notIn: [POS] } }] }]);
      }
    });

    it('job de la source déclarée : supprime exactement ses lignes (integrationId = source), jamais celles de l\'autre', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')], POS_DECLARED);
      await h.aggregation.executeProcessEvents(baselineBullJob(POS));
      for (const d of deletes(h.log)) {
        expect(d.where).toEqual({ tenantId: 'tenant-1', spaceId: 'space-1', weezeventEventId: 'evt-1', integrationId: POS });
      }
    });

    it('job de la source déclarée : INSERT sur le SalesEvent de la source, fenêtre de dates et garde d\'intégration', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')], POS_DECLARED);
      await h.aggregation.executeProcessEvents(baselineBullJob(POS));
      const ins = inserts(h.log);
      expect(ins).toHaveLength(4);
      for (const i of ins) {
        expect(i.sql).toContain('t."eventId" = ? AND t."transactionDate" >=');
        expect(i.sql).toContain('AND t."integrationId" = ?');
        expect(i.values).toContain('se-pos');
        expect(i.values).toContain(POS);
        expect(i.values).not.toContain(W.integrationId);
      }
    });

    it('la source déclarée a son watermark, la source historique garde la clé d\'avant', async () => {
      const mixed = () => createBaselineHarness(W, [baselineEvent(W, 'integration-range')], POS_DECLARED);
      const pos = mixed();
      await pos.aggregation.executeProcessEvents(baselineBullJob(POS));
      expect(pos.log.filter((l) => l.op === 'redis.set' && String(l.key).startsWith('live:agg:watermark')).map((l) => l.key))
        .toEqual([`live:agg:watermark:evt-1:${POS}`]);
      const historic = mixed();
      await historic.aggregation.executeProcessEvents(baselineBullJob(W.integrationId));
      expect(historic.log.filter((l) => l.op === 'redis.set' && String(l.key).startsWith('live:agg:watermark')).map((l) => l.key))
        .toEqual(['live:agg:watermark:evt-1']);
    });

    it('pas de synchro des présences pour une source déclarée', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')], POS_DECLARED);
      await h.aggregation.executeProcessEvents(baselineBullJob(POS));
      expect(h.queue.queueWeezeventSyncType).not.toHaveBeenCalled();
    });

    it('évènement en fenêtre de dates seule : le repli ANY(...) du job historique n\'inclut JAMAIS l\'intégration d\'une source déclarée', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'range')], POS_DECLARED);
      await h.aggregation.executeProcessEvents(baselineBullJob(undefined));
      const ins = inserts(h.log);
      expect(ins).toHaveLength(4);
      ins.forEach((i) => {
        expect(i.values).toContainEqual([W.integrationId]);
        expect(JSON.stringify(i.values)).not.toContain(POS);
      });
    });

    it('évènement 100 % source déclarée vu par le job historique sans intégration : ignoré sans erreur, aucune écriture', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'range')], POS_DECLARED);
      h.prisma.locationSpaceMapping.findMany = jest.fn(async () => [{ salesLocationId: POS }]);
      const result = await h.aggregation.executeProcessEvents(baselineBullJob(undefined));
      expect(result.results[0]).toMatchObject({ status: 'no-source' });
      expect(deletes(h.log)).toEqual([]);
      expect(inserts(h.log)).toEqual([]);
    });

    it('évènement 100 % source déclarée : le job de cette source s\'exécute normalement', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'range')], POS_DECLARED);
      const result = await h.aggregation.executeProcessEvents(baselineBullJob(POS));
      expect(result.results[0]).toMatchObject({ status: 'success' });
      expect(inserts(h.log)).toHaveLength(4);
    });

    it('deux intégrations de même nature sur un évènement : chaque job protège l\'autre', async () => {
      const second = [{ eventId: 'evt-1', integrationId: 'int-W2', salesEventId: 'se-w2', windowMode: 'sales-event-range', origin: 'manual' }];
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')], second);
      await h.aggregation.executeProcessEvents(baselineBullJob(W.integrationId));
      await h.aggregation.executeProcessEvents(baselineBullJob('int-W2'));
      const del = deletes(h.log);
      const historicDeletes = del.slice(0, del.length / 2);
      const secondDeletes = del.slice(del.length / 2);
      historicDeletes.forEach((d) => expect(d.where.AND[0].OR[1]).toEqual({ integrationId: { notIn: ['int-W2'] } }));
      secondDeletes.forEach((d) => expect(d.where.integrationId).toBe('int-W2'));
    });

    it('SalesEvent lié déjà déclaré comme source : la dérivation l\'ignore (pas de double job)', async () => {
      const event = { ...baselineEvent(W, 'exact'), weezeventEventId: 'se-pos' };
      const h = createBaselineHarness(W, [event], POS_DECLARED);
      const result = await h.aggregation.executeProcessEvents(baselineBullJob(undefined));
      expect(result.results[0]).toMatchObject({ status: 'no-source' });
    });

    it('source déclarée dont l\'intégration n\'est pas mappée à l\'espace : ignorée', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')], POS_DECLARED);
      h.prisma.locationSpaceMapping.findMany = jest.fn(async () => [{ salesLocationId: W.integrationId }]);
      await h.aggregation.executeProcessEvents(baselineBullJob(W.integrationId));
      // Aucune protection : la source non mappée n'existe pas pour ce job (delete historique).
      deletes(h.log).forEach((d) => expect(d.where.AND).toBeUndefined());
    });
  });

  describe('jobs minutes du Live', () => {
    it('la source déclarée repart de ses propres minutes (pas de Event.calculatedAt) et avance SON watermark', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')], POS_DECLARED);
      await h.live.execute(baselineBullJob(POS, { type: 'process-event-minutes' }));
      const touched = h.log.find((l) => l.op === '$queryRaw' && l.sql.includes('MAX(t."updatedAt")'));
      expect(touched.sql).not.toContain('"updatedAt" >');
      const marks = h.log.filter((l) => l.op === 'redis.set' && String(l.key).startsWith('live:agg:watermark'));
      expect(marks.map((m) => m.key)).toEqual([`live:agg:watermark:evt-1:${POS}`]);
    });

    it('la source historique garde la clé et le repli d\'avant, et protège les lignes de l\'autre source', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')], POS_DECLARED);
      await h.live.execute(baselineBullJob(W.integrationId, { type: 'process-event-minutes' }));
      const touched = h.log.find((l) => l.op === '$queryRaw' && l.sql.includes('MAX(t."updatedAt")'));
      expect(touched.sql).toContain('"updatedAt" >');
      expect(h.log.filter((l) => l.op === 'redis.set' && String(l.key).startsWith('live:agg:watermark')).map((l) => l.key))
        .toEqual(['live:agg:watermark:evt-1']);
      deletes(h.log).forEach((d) => expect(d.where.AND[0].OR[1]).toEqual({ integrationId: { notIn: [POS] } }));
    });

    it('le watermark d\'une source n\'influence pas l\'autre : une vente antérieure au watermark de l\'autre est ré-agrégée', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')], POS_DECLARED);
      // La source historique a déjà avancé très loin.
      h.redisStore.set('live:agg:watermark:evt-1', '2026-09-12T23:00:00.000Z');
      await h.live.execute(baselineBullJob(POS, { type: 'process-event-minutes' }));
      const touched = h.log.find((l) => l.op === '$queryRaw' && l.sql.includes('MAX(t."updatedAt")'));
      // Aucune borne `updatedAt >` : la caisse recalcule tout, malgré le watermark de l'autre.
      expect(touched.sql).not.toContain('"updatedAt" >');
    });

    it('évènement 100 % source déclarée vu par le job historique : 0 minute, aucune écriture', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'range')], POS_DECLARED);
      h.prisma.locationSpaceMapping.findMany = jest.fn(async () => [{ salesLocationId: POS }]);
      const result = await h.live.execute(baselineBullJob(undefined, { type: 'process-event-minutes' }));
      expect(result.minutesProcessed).toBe(0);
      expect(inserts(h.log)).toEqual([]);
    });
  });

  describe('entrées manuelles et balayage', () => {
    it('un clic « Agréger » met aussi en file un job par source déclarée', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')], POS_DECLARED);
      h.prisma.aggregationJobLog.create = jest.fn(async () => ({ id: 'log-x' }));
      const res: any = await h.aggregation.processEvents('tenant-1', 'space-1', ['evt-1'], W.integrationId);
      expect(res.extraJobIds).toEqual(['log-x']);
      const queued = h.queue.queueAggregationJob.mock.calls.map((c: any[]) => c[0]);
      expect(queued.map((q: any) => q.integrationId)).toEqual([W.integrationId, POS]);
      expect(queued[1]).toMatchObject({ type: 'process-events', eventIds: ['evt-1'] });
    });

    it('sans source déclarée, aucun job supplémentaire', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')]);
      h.prisma.aggregationJobLog.create = jest.fn(async () => ({ id: 'log-x' }));
      const res: any = await h.aggregation.processEvents('tenant-1', 'space-1', ['evt-1'], W.integrationId);
      expect(res.extraJobIds).toBeUndefined();
      expect(h.queue.queueAggregationJob).toHaveBeenCalledTimes(1);
    });

    it('le balayage de resynchronisation sans integrationId épargne les lignes des sources déclarées', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')], POS_DECLARED);
      await h.syncStale.purge('tenant-1', 'space-1', undefined, new Date('2026-09-12T18:00:00Z'), [], [POS]);
      const sweeps = h.log.filter((l) => l.op === 'deleteMany');
      expect(sweeps).toHaveLength(4);
      sweeps.forEach((s) => expect(s.where.AND).toEqual([{ OR: [{ integrationId: null }, { integrationId: { notIn: [POS] } }] }]));
    });

    it('le balayage scopé par integrationId reste inchangé', async () => {
      const h = createBaselineHarness(W, [], POS_DECLARED);
      await h.syncStale.purge('tenant-1', 'space-1', POS, new Date('2026-09-12T18:00:00Z'), [], [POS]);
      h.log.filter((l) => l.op === 'deleteMany').forEach((s) => {
        expect(s.where.integrationId).toBe(POS);
        expect(s.where.AND).toBeUndefined();
      });
    });

    it('backfill des paniers : une passe par source, suppression protégée puis scopée', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'integration-range')], POS_DECLARED);
      await h.basket.backfillSpace('tenant-1', 'space-1');
      const del = h.log.filter((l) => l.op === 'deleteMany' && l.table === 'SpaceBasketMinuteAgg');
      expect(del).toHaveLength(2);
      expect(del[0].where.AND[0].OR[1]).toEqual({ integrationId: { notIn: [POS] } });
      expect(del[1].where).toEqual({ tenantId: 'tenant-1', spaceId: 'space-1', weezeventEventId: 'evt-1', integrationId: POS });
    });
  });

  describe('conteneurs de saison', () => {
    it('un SalesEvent déclaré source n\'est jamais un conteneur, même si ses ventes s\'étalent', async () => {
      const h = createBaselineHarness(W, [baselineEvent(W, 'range')], [
        { eventId: 'evt-1', integrationId: POS, salesEventId: 'season-W', origin: 'pos' },
      ]);
      // season-W est déclaré conteneur par les données Weezevent du banc : la déclaration l'exclut.
      const containers = await h.windowResolver.resolveSeasonContainerEventIds('tenant-1');
      expect(containers.has('season-W')).toBe(false);
    });
  });
});
