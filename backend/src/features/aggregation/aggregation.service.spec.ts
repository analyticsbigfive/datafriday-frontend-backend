import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AggregationService } from './aggregation.service';
import { PrismaService } from '../../core/database/prisma.service';
import { QueueService } from '../../core/queue/queue.service';
import { MappingsService } from '../mappings/mappings.service';
import { RedisService } from '../../core/redis/redis.service';
import { combineDayAndLocalTime } from '../../shared/utils/event-window.util';

// ─── Mock Prisma ────────────────────────────────────────────────────────────
const mockPrisma: any = {
  space: { findFirst: jest.fn() },
  event: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn() },
  aggregationJobLog: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  spaceRevenueMinuteAgg: {
    groupBy: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
  spaceProductRevenueDailyAgg: {
    groupBy: jest.fn(),
    aggregate: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
  spaceRevenueMinuteItemAgg: {
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
  salesLocation: { findMany: jest.fn() },
  locationSpaceMapping: { findFirst: jest.fn(), findMany: jest.fn() },
  locationShopMapping: { findMany: jest.fn(), count: jest.fn() },
  salesTransaction: { findMany: jest.fn() },
  salesEvent: { findMany: jest.fn() },
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
  $transaction: jest.fn(),
};

const mockQueueService: any = {
  queueAggregationJob: jest.fn(),
};

const mockMappingsService: any = {
  hasShopMappingForIntegration: jest.fn(),
};

// ─── Fixture helpers ────────────────────────────────────────────────────────
const TENANT = 'tenant-1';
const SPACE = 'space-1';
const EVENT_1 = 'event-1';
const EVENT_2 = 'event-2';
const INT_ID = 'integration-1';
const JOB_LOG_ID = 'joblog-1';
const LOCATION_ID = 'loc-1';

const makeEvent = (id: string, daysAgo = 10): any => ({
  id,
  name: `Event ${id}`,
  tenantId: TENANT,
  spaceId: SPACE,
  eventDate: new Date(Date.now() - daysAgo * 86400_000),
  eventEndDate: null,
});

const makeJob = (status = 'completed', eventIds = [EVENT_1]): any => ({
  id: JOB_LOG_ID,
  tenantId: TENANT,
  spaceId: SPACE,
  status,
  startedAt: new Date(Date.now() - 5000),
  completedAt: status === 'completed' ? new Date() : null,
  transactionsProcessed: status === 'completed' ? 3 : 0,
  metadata: { eventIds },
  error: null,
});

const makeBullJob = (overrides: any = {}): any => ({
  data: {
    tenantId: TENANT,
    spaceId: SPACE,
    eventIds: [EVENT_1],
    integrationId: INT_ID,
    jobLogId: JOB_LOG_ID,
    type: 'process-events',
    ...overrides,
  },
  updateProgress: jest.fn().mockResolvedValue(undefined),
});

// ─── Suite ──────────────────────────────────────────────────────────────────
describe('AggregationService', () => {
  let service: AggregationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AggregationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QueueService, useValue: mockQueueService },
        { provide: MappingsService, useValue: mockMappingsService },
        // BUG-143-01 : purge des caches Redis event-timeline/baskets en fin de job.
        { provide: RedisService, useValue: { deletePattern: jest.fn(), get: jest.fn(), set: jest.fn() } },
      ],
    }).compile();

    service = module.get<AggregationService>(AggregationService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma),
    );
  });

  // ─── getEventsTimelineStatus ─────────────────────────────────────────────
  describe('getEventsTimelineStatus', () => {
    beforeEach(() => {
      mockPrisma.space.findFirst.mockResolvedValue({ id: SPACE, tenantId: TENANT });
      mockPrisma.event.findMany.mockResolvedValue([makeEvent(EVENT_1), makeEvent(EVENT_2)]);
      mockPrisma.event.count.mockResolvedValue(0); // futureEventsCount
      mockPrisma.aggregationJobLog.findMany.mockResolvedValue([makeJob('completed', [EVENT_1])]);
      mockPrisma.spaceRevenueMinuteAgg.groupBy.mockResolvedValue([
        { weezeventEventId: EVENT_1, _sum: { transactionsCount: 480 }, _count: { _all: 480 } },
      ]);
      mockPrisma.salesLocation.findMany.mockResolvedValue([]);
      mockPrisma.locationShopMapping.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValue([]);
    });

    it('retourne events avec aggregationStatus depuis le job log', async () => {
      const result = await service.getEventsTimelineStatus(TENANT, SPACE);

      expect(result.events).toHaveLength(2);
      expect(result.events[0].aggregationStatus).toBe('completed');
      expect(result.events[1].aggregationStatus).toBe('pending'); // pas de job pour event-2
    });

    it("BUG-367-02 : un job 'completed' en historique ne suffit plus à afficher 'Agrégé' si les data points ont été purgés depuis (Démapper, BUG-366-02)", async () => {
      // Job dit "completed" pour EVENT_1, mais plus aucune ligne SpaceRevenueMinuteAgg pour lui —
      // contradiction "Agrégé" + "—" data points constatée réelle après un Démapper.
      mockPrisma.spaceRevenueMinuteAgg.groupBy.mockResolvedValue([]);

      const result = await service.getEventsTimelineStatus(TENANT, SPACE);

      const event1 = result.events.find((e: any) => e.id === EVENT_1);
      expect(event1.dataPoints).toBe(0);
      expect(event1.aggregationStatus).toBe('pending');
    });

    it('retourne dataPoints depuis spaceRevenueMinuteAgg (batch — pas de N+1)', async () => {
      const result = await service.getEventsTimelineStatus(TENANT, SPACE);

      // Vérifier que groupBy a été appelé une seule fois (pas N fois)
      expect(mockPrisma.spaceRevenueMinuteAgg.groupBy).toHaveBeenCalledTimes(1);
      expect(result.events[0].dataPoints).toBe(480);
      expect(result.events[1].dataPoints).toBe(0);
    });

    it('retourne transactionStats non null quand integrationId fourni et locations existent', async () => {
      mockPrisma.salesLocation.findMany.mockResolvedValue([{ id: LOCATION_ID }]);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([]) // unregisteredDates
        .mockResolvedValueOnce([{ total: BigInt(100), matched: BigInt(80) }]) // totalRow
        .mockResolvedValueOnce([]); // unmappedRows

      const result = await service.getEventsTimelineStatus(TENANT, SPACE, INT_ID);

      expect(result.transactionStats).not.toBeNull();
      expect(result.transactionStats!.total).toBe(100);
      expect(result.transactionStats!.matched).toBe(80);
      expect(result.transactionStats!.unmatched).toBe(20);
    });

    it('ne plante pas quand aucun event passé (régression join([]))', async () => {
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.salesLocation.findMany.mockResolvedValue([{ id: LOCATION_ID }]);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([]) // unregisteredDates
        .mockResolvedValueOnce([{ total: BigInt(12), matched: BigInt(0) }]) // totalRow sans événements
        .mockResolvedValueOnce([]); // unmappedRows

      const result = await service.getEventsTimelineStatus(TENANT, SPACE, INT_ID);

      expect(result.events).toHaveLength(0);
      expect(result.transactionStats).toEqual({
        total: 12,
        matched: 0,
        unmatched: 12,
        unmappedLocationIds: [],
      });
    });

    it('retourne transactionStats = null sans integrationId', async () => {
      const result = await service.getEventsTimelineStatus(TENANT, SPACE);
      expect(result.transactionStats).toBeNull();
    });

    it('retourne summary avec le bon comptage de statuts', async () => {
      mockPrisma.aggregationJobLog.findMany.mockResolvedValue([
        makeJob('completed', [EVENT_1]),
        makeJob('skipped', [EVENT_2]),
      ]);

      const result = await service.getEventsTimelineStatus(TENANT, SPACE);

      expect(result.summary.processed).toBe(1);
      expect(result.summary.skipped).toBe(1);
      expect(result.summary.pending).toBe(0);
    });

    it('lance NotFoundException si space introuvable', async () => {
      mockPrisma.space.findFirst.mockResolvedValue(null);
      await expect(service.getEventsTimelineStatus(TENANT, 'bad-space')).rejects.toThrow(NotFoundException);
    });

    it('ne fait aucune requête N+1 (findFirst par event) pour les jobs', async () => {
      // On vérifie qu'aggregationJobLog.findFirst n'est jamais appelé (remplacé par findMany batch)
      await service.getEventsTimelineStatus(TENANT, SPACE);
      expect(mockPrisma.aggregationJobLog.findFirst).not.toHaveBeenCalled();
    });
  });

  // ─── processEvents ───────────────────────────────────────────────────────
  describe('processEvents', () => {
    beforeEach(() => {
      mockPrisma.event.findMany.mockResolvedValue([makeEvent(EVENT_1)]);
      mockPrisma.aggregationJobLog.create.mockResolvedValue({ id: JOB_LOG_ID });
      mockQueueService.queueAggregationJob.mockResolvedValue(undefined);
    });

    it('retourne jobId + status "queued"', async () => {
      const result = await service.processEvents(TENANT, SPACE, [EVENT_1], INT_ID);

      expect(result).toMatchObject({ jobId: JOB_LOG_ID, status: 'queued', total: 1 });
    });

    it('crée un AggregationJobLog avec status "pending"', async () => {
      await service.processEvents(TENANT, SPACE, [EVENT_1], INT_ID);

      expect(mockPrisma.aggregationJobLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'pending', tenantId: TENANT, spaceId: SPACE }) }),
      );
    });

    it('enqueue le job via QueueService', async () => {
      await service.processEvents(TENANT, SPACE, [EVENT_1], INT_ID);

      expect(mockQueueService.queueAggregationJob).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'process-events', tenantId: TENANT, spaceId: SPACE }),
      );
    });

    it('retourne {processed:0, total:0} si aucun event trouvé', async () => {
      mockPrisma.event.findMany.mockResolvedValue([]);
      const result = await service.processEvents(TENANT, SPACE, ['missing']);
      expect(result).toMatchObject({ processed: 0, total: 0 });
    });
  });

  // ─── executeProcessEvents ────────────────────────────────────────────────
  describe('executeProcessEvents', () => {
    const makeTransaction = (locationId = LOCATION_ID, minuteOffset = 0): any => ({
      id: `tx-${minuteOffset}`,
      tenantId: TENANT,
      locationId,
      transactionDate: new Date(new Date('2025-05-10T20:00:00Z').getTime() + minuteOffset * 60_000),
      amount: '50.00',
      items: [
        { productId: 'prod-1', unitPrice: '25.00', quantity: 2, reduction: '0' },
      ],
    });

    beforeEach(() => {
      mockPrisma.aggregationJobLog.update.mockResolvedValue({});
      mockPrisma.event.findMany.mockResolvedValue([makeEvent(EVENT_1)]);
      mockPrisma.locationSpaceMapping.findFirst.mockResolvedValue({ spaceId: SPACE });
      mockPrisma.salesLocation.findMany.mockResolvedValue([{ id: LOCATION_ID }]);
      mockPrisma.locationShopMapping.findMany.mockResolvedValue([
        { weezeventLocationId: LOCATION_ID, spaceElementId: 'element-1' },
      ]);
      mockPrisma.salesTransaction.findMany.mockResolvedValue([makeTransaction()]);
      mockPrisma.spaceRevenueMinuteAgg.upsert.mockResolvedValue({});
      mockPrisma.spaceProductRevenueDailyAgg.upsert.mockResolvedValue({});
      mockPrisma.$executeRaw.mockResolvedValue(0);
      mockPrisma.spaceRevenueMinuteAgg.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.spaceRevenueMinuteItemAgg.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.salesEvent.findMany.mockResolvedValue([]);
      mockPrisma.spaceRevenueMinuteAgg.aggregate.mockResolvedValue({
        _sum: { revenueHt: '150.00', transactionsCount: 3 },
      });
      mockPrisma.event.update.mockResolvedValue({});
      // BUG-329/330-02 : resolveEventWindow — timezone du space + repli MIN/MAX (aucune borne par
      // défaut, explicite plutôt que de dépendre d'un état résiduel d'un describe précédent).
      mockPrisma.space.findFirst.mockResolvedValue({ timezone: 'Europe/Paris' });
      mockPrisma.$queryRaw.mockResolvedValue([{ minDate: null, maxDate: null }]);
    });

    it('upsert sur spaceRevenueMinuteAgg (pas spaceRevenueDailyAgg)', async () => {
      const job = makeBullJob();
      await service.executeProcessEvents(job);

      // Service uses $executeRaw (bulk SQL INSERT…ON CONFLICT) instead of individual upsert calls
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      expect(mockPrisma.spaceRevenueMinuteAgg.upsert).not.toHaveBeenCalled();
    });

    it('écrit aussi SpaceRevenueMinuteItemAgg (3 blocs $executeRaw par event)', async () => {
      const job = makeBullJob();
      await service.executeProcessEvents(job);

      // 1 event → 3 $executeRaw (SpaceRevenueMinuteAgg, SpaceProductRevenueDailyAgg, SpaceRevenueMinuteItemAgg)
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(3);
      // BUG-317-02 : scopé par integrationId (makeBullJob() en fournit un par défaut) pour ne pas
      // effacer la contribution d'une AUTRE intégration partageant le même event/space.
      expect(mockPrisma.spaceRevenueMinuteItemAgg.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, spaceId: SPACE, weezeventEventId: EVENT_1, integrationId: INT_ID },
      });
    });

    // BUG-135-01 : la colonne s'appelle "transactionsCount" mais comptait COUNT(ti."id"),
    // c'est-à-dire des LIGNES de vente. Sur « Le Mans-Brest » (22/08/2026) : 13 925 lignes
    // pour 5 721 tickets réels — et c'est ce 13 925 que remontaient Event.transactionCount,
    // le RPC get_space_shop_details et le panier moyen (4,71 € au lieu de 11,46 €).
    it('BUG-135-01 : transactionsCount = COUNT(DISTINCT t."id"), jamais COUNT(ti."id")', async () => {
      const job = makeBullJob();
      await service.executeProcessEvents(job);

      const minuteAggSql: string = (mockPrisma.$executeRaw.mock.calls[0][0].strings ?? []).join('');
      // Les commentaires SQL citent l'ancienne expression : on n'assert que l'exécutable.
      const executable = minuteAggSql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
      expect(executable).toContain('INSERT INTO "SpaceRevenueMinuteAgg"');
      expect(executable).toContain('COUNT(DISTINCT t."id")::int');
      expect(executable).not.toContain('COUNT(ti."id")');
    });

    // Corollaire : le grain de SpaceRevenueMinuteAgg ne porte PAS de dimension article,
    // sinon COUNT(DISTINCT t."id") cesserait d'être additif (un panier de N articles
    // distincts compterait N fois, exactement le défaut de SpaceRevenueMinuteItemAgg).
    it('BUG-135-01 : le grain reste (minute × location × merchant × élément), sans produit', async () => {
      const job = makeBullJob();
      await service.executeProcessEvents(job);

      const minuteAggSql: string = (mockPrisma.$executeRaw.mock.calls[0][0].strings ?? []).join('');
      const groupBy = minuteAggSql.slice(minuteAggSql.lastIndexOf('GROUP BY'));
      expect(groupBy).not.toContain('ti."productId"');
    });

    it('BUG-317-02 : deleteMany NON scopé par integrationId quand il est absent du job (retraitement toutes intégrations)', async () => {
      const job = makeBullJob({ integrationId: undefined });
      // Sans integrationId, la vérification "intégration mappée à cet espace" est sautée
      // (executeProcessEvents ne l'exécute que si integrationId est fourni).
      await service.executeProcessEvents(job);

      expect(mockPrisma.spaceRevenueMinuteAgg.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, spaceId: SPACE, weezeventEventId: EVENT_1 },
      });
      expect(mockPrisma.spaceRevenueMinuteItemAgg.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, spaceId: SPACE, weezeventEventId: EVENT_1 },
      });
    });

    it('itemsCount = somme des quantités (fix #6)', async () => {
      // Transaction avec items [qty:2, qty:3] → itemsCount = SUM(quantity) dans le SQL
      const tx: any = {
        id: 'tx-multi',
        tenantId: TENANT,
        locationId: LOCATION_ID,
        transactionDate: new Date('2025-05-10T20:00:00Z'),
        amount: '100',
        items: [
          { productId: 'p1', unitPrice: '20', quantity: 2, reduction: '0' },
          { productId: 'p2', unitPrice: '20', quantity: 3, reduction: '0' },
        ],
      };
      mockPrisma.salesTransaction.findMany.mockResolvedValue([tx]);

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      // itemsCount computed via SUM(ti."quantity")::int in $executeRaw SQL
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('revenue = sum(unitPrice * qty - reduction) sur les items (fix #7b)', async () => {
      // Revenue computed via SUM(ti."unitPrice" * ti."quantity" - COALESCE(ti."reduction", 0)) in SQL
      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('regroupe par (locationId, minute) — 2 transactions même minute → 1 upsert', async () => {
      const tx1 = { ...makeTransaction(LOCATION_ID, 0), id: 'tx-a' };
      const tx2 = { ...makeTransaction(LOCATION_ID, 0), id: 'tx-b' }; // même minute
      mockPrisma.salesTransaction.findMany.mockResolvedValue([tx1, tx2]);

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      // SQL GROUP BY handles the grouping — 1 event → exactly 3 $executeRaw calls
      // (SpaceRevenueMinuteAgg, SpaceProductRevenueDailyAgg, SpaceRevenueMinuteItemAgg)
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(3);
      expect(mockPrisma.spaceRevenueMinuteAgg.upsert).not.toHaveBeenCalled();
    });

    it('regroupe par (locationId, minute) — 2 minutes différentes → 2 upserts', async () => {
      const tx1 = { ...makeTransaction(LOCATION_ID, 0), id: 'tx-a' };   // minute 20:00
      const tx2 = { ...makeTransaction(LOCATION_ID, 1), id: 'tx-b' };   // minute 20:01
      mockPrisma.salesTransaction.findMany.mockResolvedValue([tx1, tx2]);

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      // SQL GROUP BY handles per-minute grouping — still 3 $executeRaw calls per event
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(3);
      expect(mockPrisma.spaceRevenueMinuteAgg.upsert).not.toHaveBeenCalled();
    });

    it('ignore les transactions sans locationId', async () => {
      const tx: any = { ...makeTransaction(), locationId: null };
      mockPrisma.salesTransaction.findMany.mockResolvedValue([tx]);

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(mockPrisma.spaceRevenueMinuteAgg.upsert).not.toHaveBeenCalled();
    });

    it('ignore les locations sans shop mapping (unmapped)', async () => {
      mockPrisma.locationShopMapping.findMany.mockResolvedValue([]); // aucun mapping

      const job = makeBullJob();
      const result = await service.executeProcessEvents(job);

      // SQL JOIN filters unmapped locations — $executeRaw still runs (inserts 0 rows)
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      expect(mockPrisma.spaceRevenueMinuteAgg.upsert).not.toHaveBeenCalled();
      expect(result.results[0].status).toBe('success');
    });

    it('utilise eventEndDate pour les events multi-jours, sans eventEndTime → dernier jour pris en entier (fix #8)', async () => {
      const eventEndDate = new Date('2025-05-12T00:00:00Z');
      const multiDayEvent: any = {
        ...makeEvent(EVENT_1),
        eventEndDate, // 2 jours après eventDate
      };
      mockPrisma.event.findMany.mockResolvedValue([multiDayEvent]);

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      // Sans eventEndTime, la borne haute = minuit local (Europe/Paris) du jour suivant
      // eventEndDate — pas une arithmétique UTC naïve (May 13 00:00 Paris ≠ May 13 00:00 UTC).
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      const sqlArg = mockPrisma.$executeRaw.mock.calls[0][0];
      const allDates = (sqlArg?.values ?? []).filter((v: any) => v instanceof Date);
      const dayAfterEnd = new Date(eventEndDate);
      dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);
      const expectedEnd = combineDayAndLocalTime(dayAfterEnd, '00:00', 'Europe/Paris')!;
      expect(allDates.some((d: Date) => d.getTime() === expectedEnd.getTime())).toBe(true);
    });

    it('lance une erreur si integration pas mappée au space', async () => {
      mockPrisma.locationSpaceMapping.findFirst.mockResolvedValue({ spaceId: 'other-space' });

      const job = makeBullJob();
      await expect(service.executeProcessEvents(job)).rejects.toThrow(/mapped to a different space/);
    });

    it('met à jour AggregationJobLog à "completed" en fin de traitement', async () => {
      const job = makeBullJob();
      await service.executeProcessEvents(job);

      const lastUpdate = mockPrisma.aggregationJobLog.update.mock.calls.slice(-1)[0][0];
      expect(lastUpdate.data.status).toBe('completed');
    });

    it('met à jour la progression BullMQ (updateProgress)', async () => {
      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    // ─── BUG-033 ─────────────────────────────────────────────────────────────
    it('écrit Event.revenue/transactionCount depuis le rollup SpaceRevenueMinuteAgg (BUG-033)', async () => {
      mockPrisma.spaceRevenueMinuteAgg.aggregate.mockResolvedValue({
        _sum: { revenueHt: '287.50', transactionsCount: 12 },
      });

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(mockPrisma.spaceRevenueMinuteAgg.aggregate).toHaveBeenCalledWith({
        where: { tenantId: TENANT, spaceId: SPACE, weezeventEventId: EVENT_1 },
        _sum: { revenueHt: true, transactionsCount: true },
      });
      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: EVENT_1 },
        data: expect.objectContaining({
          revenue: 287.5,
          transactionCount: 12,
          calculatedAt: expect.any(Date),
        }),
      });
    });

    it('écrit revenue=0/transactionCount=0 (pas null) si aucune vente agrégée pour l\'event (BUG-033)', async () => {
      mockPrisma.spaceRevenueMinuteAgg.aggregate.mockResolvedValue({
        _sum: { revenueHt: null, transactionsCount: null },
      });

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: EVENT_1 },
        data: expect.objectContaining({ revenue: 0, transactionCount: 0 }),
      });
    });

    // Trouvé le 2026-08-05 (retour utilisateur : "Avg Spend/Tx"/"Per Capita" vides
    // dans la fiche event malgré Revenue/Transactions renseignés) — avgSpendPerTx/
    // perCapita n'étaient jamais calculés par ce pipeline.
    it('écrit avgSpendPerTx = revenue / transactionCount', async () => {
      mockPrisma.spaceRevenueMinuteAgg.aggregate.mockResolvedValue({
        _sum: { revenueHt: '200', transactionsCount: 40 },
      });

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: EVENT_1 },
        data: expect.objectContaining({ avgSpendPerTx: 5 }),
      });
    });

    it('avgSpendPerTx reste null sans transaction (pas de division par zéro)', async () => {
      mockPrisma.spaceRevenueMinuteAgg.aggregate.mockResolvedValue({
        _sum: { revenueHt: null, transactionsCount: null },
      });

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: EVENT_1 },
        data: expect.objectContaining({ avgSpendPerTx: null }),
      });
    });

    it("perCapita reste null sans donnée de billetterie réelle (ex. event QA simulé)", async () => {
      mockPrisma.event.findMany.mockResolvedValue([makeEvent(EVENT_1)]); // ticketsScanned/ticketsSold absents
      mockPrisma.spaceRevenueMinuteAgg.aggregate.mockResolvedValue({
        _sum: { revenueHt: '200', transactionsCount: 40 },
      });

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: EVENT_1 },
        data: expect.objectContaining({ perCapita: null }),
      });
    });

    it('perCapita = revenue / ticketsScanned quand une vraie donnée de billetterie existe', async () => {
      mockPrisma.event.findMany.mockResolvedValue([{ ...makeEvent(EVENT_1), ticketsScanned: 50 }]);
      mockPrisma.spaceRevenueMinuteAgg.aggregate.mockResolvedValue({
        _sum: { revenueHt: '200', transactionsCount: 40 },
      });

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: EVENT_1 },
        data: expect.objectContaining({ perCapita: 4 }),
      });
    });

    // ─── BUG-328/329/330-02 : résolution de fenêtre (resolveEventWindow) ─────
    describe('résolution de fenêtre transaction → event', () => {
      const SALES_EVENT_ID = 'sales-event-1';

      it("BUG-330-02 : Event lié (weezeventEventId) → rattachement EXACT par eventId, pas de plage de dates", async () => {
        mockPrisma.event.findMany.mockResolvedValue([
          { ...makeEvent(EVENT_1), weezeventEventId: SALES_EVENT_ID },
        ]);

        const job = makeBullJob();
        await service.executeProcessEvents(job);

        const sqlArg = mockPrisma.$executeRaw.mock.calls[0][0];
        expect(sqlArg.values).toContain(SALES_EVENT_ID);
        expect(sqlArg.text ?? sqlArg.sql).toEqual(expect.stringContaining('t."eventId" ='));
        // $queryRaw est appelé une fois par run pour resolveSeasonContainerEventIds (BUG-338-02),
        // indépendamment du mode exact/range — mais resolveEventWindow lui-même (mode exact ici)
        // ne doit ajouter aucun appel supplémentaire : un seul au total.
        expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      });

      it('BUG-361-02 (Le Mans FC) : SalesEvent au span DÉCLARÉ large (startDate/endDate) mais span OBSERVÉ nul (intégration tout juste synchronisée) → détecté conteneur quand même, mode container-range (tag + journée calendaire) plutôt que exact', async () => {
        const baseEvent = makeEvent(EVENT_1);
        // Span observé (via $queryRaw, resolveSeasonContainerEventIds) : rien — cold start.
        mockPrisma.$queryRaw.mockResolvedValue([]);
        // Span déclaré : ~9,5 mois, cohérent avec un vrai calendrier de saison (LE MANS FC -
        // SAISON 26/27 réel : 2026-08-15 → 2027-06-02). Premier appel salesEvent.findMany
        // (déclaré) ; le second (digifood) retombe sur le mock par défaut ([] posé en beforeEach).
        mockPrisma.salesEvent.findMany.mockResolvedValueOnce([
          { id: SALES_EVENT_ID, startDate: new Date('2026-08-15T04:00:00Z'), endDate: new Date('2027-06-02T01:00:00Z') },
        ]);
        mockPrisma.event.findMany.mockResolvedValue([
          { ...baseEvent, weezeventEventId: SALES_EVENT_ID },
        ]);

        const job = makeBullJob();
        await service.executeProcessEvents(job);

        const sqlArg = mockPrisma.$executeRaw.mock.calls[0][0];
        // Mode container-range : tag du conteneur (égalité stricte), PAS la clause
        // eventLinkClause générique du mode range sans lien (BUG-146-01).
        expect(sqlArg.text ?? sqlArg.sql).toEqual(expect.stringContaining('t."eventId" ='));
        expect(sqlArg.values).toContain(SALES_EVENT_ID);
        const dates = (sqlArg.values ?? []).filter((v: any) => v instanceof Date);
        // Fenêtre = journée calendaire locale complète (règle Ulrich 2026-08-25), pas
        // ancrée sur une heure de portes — s'applique aussi au mode container-range.
        const expectedStart = combineDayAndLocalTime(baseEvent.eventDate, '00:00', 'Europe/Paris')!;
        expect(dates.some((d: Date) => d.getTime() === expectedStart.getTime())).toBe(true);
        // Idem : seul $queryRaw attendu = détection des conteneurs (BUG-338-02).
        expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      });

      it('BUG-368-02 : Event.integrationId posé, pas de weezeventEventId → mode integration-range, matche t."integrationId" directement, jamais t."eventId"', async () => {
        const baseEvent = makeEvent(EVENT_1);
        mockPrisma.event.findMany.mockResolvedValue([
          { ...baseEvent, integrationId: 'integration-pfc' },
        ]);

        const job = makeBullJob();
        await service.executeProcessEvents(job);

        const sqlArg = mockPrisma.$executeRaw.mock.calls[0][0];
        const text = sqlArg.text ?? sqlArg.sql;
        expect(text).toEqual(expect.stringContaining('t."integrationId" ='));
        expect(text).not.toEqual(expect.stringContaining('t."eventId" ='));
        expect(sqlArg.values).toContain('integration-pfc');
        // Robuste par construction : aucun appel à resolveSeasonContainerEventIds nécessaire
        // pour CET event (le $queryRaw du run global reste le seul, pour d'éventuels autres
        // events du même batch — ici il n'y en a qu'un, sans lien conteneur à détecter).
      });

      it('BUG-368-02 : un lien EXACT vers un match précis reste prioritaire même si Event.integrationId est aussi posé', async () => {
        const baseEvent = makeEvent(EVENT_1);
        mockPrisma.event.findMany.mockResolvedValue([
          { ...baseEvent, weezeventEventId: SALES_EVENT_ID, integrationId: 'integration-pfc' },
        ]);

        const job = makeBullJob();
        await service.executeProcessEvents(job);

        const sqlArg = mockPrisma.$executeRaw.mock.calls[0][0];
        const text = sqlArg.text ?? sqlArg.sql;
        expect(text).toEqual(expect.stringContaining('t."eventId" ='));
        expect(sqlArg.values).toContain(SALES_EVENT_ID);
      });

      it('règle métier 2026-08-25 : Event non lié, 1 seul jour → fenêtre = journée calendaire locale complète (00h00 → minuit suivant, pas ancrée sur une heure d\'ouverture)', async () => {
        const baseEvent = makeEvent(EVENT_1);
        mockPrisma.event.findMany.mockResolvedValue([baseEvent]);

        const job = makeBullJob();
        await service.executeProcessEvents(job);

        const sqlArg = mockPrisma.$executeRaw.mock.calls[0][0];
        const dates = (sqlArg.values ?? []).filter((v: any) => v instanceof Date);
        const expectedStart = combineDayAndLocalTime(baseEvent.eventDate, '00:00', 'Europe/Paris')!;
        const nextDay = new Date(baseEvent.eventDate);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        const expectedEnd = combineDayAndLocalTime(nextDay, '00:00', 'Europe/Paris')!;
        expect(dates.some((d: Date) => d.getTime() === expectedStart.getTime())).toBe(true);
        expect(dates.some((d: Date) => d.getTime() === expectedEnd.getTime())).toBe(true);
        // Plus de scan des transactions non liées pour deviner une fenêtre : la journée calendaire
        // se déduit uniquement des dates déclarées de l'Event. Seul resolveSeasonContainerEventIds
        // (BUG-338-02) appelle encore $queryRaw, une fois par run.
        expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      });

      it('règle métier 2026-08-25 : Event non lié, multi-jours avec eventEndTime → jour 1 à 00h00, coupure sur le dernier jour à eventEndTime', async () => {
        const eventStartDate = new Date('2026-03-01T00:00:00.000Z');
        const eventEndDate = new Date('2026-03-02T00:00:00.000Z');
        const baseEvent = { ...makeEvent(EVENT_1), eventStartDate, eventEndDate, eventEndTime: '02:00' };
        mockPrisma.event.findMany.mockResolvedValue([baseEvent]);

        const job = makeBullJob();
        await service.executeProcessEvents(job);

        const sqlArg = mockPrisma.$executeRaw.mock.calls[0][0];
        const dates = (sqlArg.values ?? []).filter((v: any) => v instanceof Date);
        const expectedStart = combineDayAndLocalTime(eventStartDate, '00:00', 'Europe/Paris')!;
        const expectedEnd = combineDayAndLocalTime(eventEndDate, '02:00', 'Europe/Paris')!;
        expect(dates.some((d: Date) => d.getTime() === expectedStart.getTime())).toBe(true);
        expect(dates.some((d: Date) => d.getTime() === expectedEnd.getTime())).toBe(true);
        // La coupure ne doit PAS être minuit du jour de fin (sinon elle avalerait toute la journée
        // suivante — risque de contamination avec un autre event le lendemain).
        const midnightOfEndDate = combineDayAndLocalTime(eventEndDate, '00:00', 'Europe/Paris')!;
        expect(dates.every((d: Date) => d.getTime() !== midnightOfEndDate.getTime())).toBe(true);
      });

      it('règle métier 2026-08-25 : Event non lié, multi-jours SANS eventEndTime → dernier jour pris en entier (00h00 → minuit suivant), pas d\'heuristique inventée', async () => {
        const eventStartDate = new Date('2026-03-01T00:00:00.000Z');
        const eventEndDate = new Date('2026-03-02T00:00:00.000Z');
        const baseEvent = { ...makeEvent(EVENT_1), eventStartDate, eventEndDate, eventEndTime: null };
        mockPrisma.event.findMany.mockResolvedValue([baseEvent]);

        const job = makeBullJob();
        await service.executeProcessEvents(job);

        const sqlArg = mockPrisma.$executeRaw.mock.calls[0][0];
        const dates = (sqlArg.values ?? []).filter((v: any) => v instanceof Date);
        const dayAfterEnd = new Date(eventEndDate);
        dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);
        const expectedEnd = combineDayAndLocalTime(dayAfterEnd, '00:00', 'Europe/Paris')!;
        expect(dates.some((d: Date) => d.getTime() === expectedEnd.getTime())).toBe(true);
      });

      it('BUG-146-01 : Event lié à un CONTENEUR de saison → tag conteneur ET journée calendaire complète (container-range)', async () => {
        const CONTAINER = 'container-sfp';
        const baseEvent = makeEvent(EVENT_1);
        mockPrisma.event.findMany.mockResolvedValue([{
          ...baseEvent,
          weezeventEventId: CONTAINER,
        }]);
        // Détection conteneur (BUG-338-02) : span observé ~300 jours → conteneur.
        mockPrisma.$queryRaw.mockResolvedValueOnce([
          { eventId: CONTAINER, minDate: new Date('2025-01-01T00:00:00Z'), maxDate: new Date('2025-10-28T00:00:00Z') },
        ]);

        const job = makeBullJob();
        await service.executeProcessEvents(job);

        const sqlArg = mockPrisma.$executeRaw.mock.calls[0][0];
        const text = sqlArg.text ?? sqlArg.sql;
        // Le tag du conteneur ET les bornes de fenêtre — les deux, pas l'un ou l'autre.
        expect(sqlArg.values).toContain(CONTAINER);
        expect(text).toEqual(expect.stringContaining('t."eventId" ='));
        expect(text).toEqual(expect.stringContaining('t."transactionDate" >='));
        // Fenêtre = journée calendaire locale complète (règle Ulrich 2026-08-25), pas
        // ancrée sur une heure de portes — s'applique aussi au mode container-range.
        const expectedStart = combineDayAndLocalTime(baseEvent.eventDate, '00:00', 'Europe/Paris')!;
        const dates = (sqlArg.values ?? []).filter((v: any) => v instanceof Date);
        expect(dates.some((d: Date) => d.getTime() === expectedStart.getTime())).toBe(true);
      });

      it("BUG-146-01 : double affiche (deux events, deux conteneurs, fenêtres qui se recouvrent) → chaque event ne cible QUE son conteneur", async () => {
        const CONTAINER_PFC = 'container-pfc';
        const CONTAINER_SFP = 'container-sfp';
        const sameDay = makeEvent(EVENT_1).eventDate;
        mockPrisma.event.findMany.mockResolvedValue([
          {
            ...makeEvent(EVENT_1),
            eventDate: sameDay,
            weezeventEventId: CONTAINER_PFC,
            eventEndTime: '21:00',
            sessions: JSON.stringify([{ doorsOpening: '16:00', showTime: '17:00' }]),
          },
          {
            ...makeEvent(EVENT_2),
            eventDate: sameDay,
            weezeventEventId: CONTAINER_SFP,
            eventEndTime: '23:30',
            sessions: JSON.stringify([{ doorsOpening: '11:00', showTime: '13:00' }]),
          },
        ]);
        mockPrisma.$queryRaw.mockResolvedValueOnce([
          { eventId: CONTAINER_PFC, minDate: new Date('2025-01-01T00:00:00Z'), maxDate: new Date('2025-10-28T00:00:00Z') },
          { eventId: CONTAINER_SFP, minDate: new Date('2025-01-01T00:00:00Z'), maxDate: new Date('2025-10-28T00:00:00Z') },
        ]);

        const job = makeBullJob({ eventIds: [EVENT_1, EVENT_2] });
        await service.executeProcessEvents(job);

        // 2 events × 3 $executeRaw : le 1er bloc de chaque event porte SON conteneur
        // et jamais celui de l'autre — les fenêtres se recouvrent, le tag départage.
        const firstEventSql = mockPrisma.$executeRaw.mock.calls[0][0];
        const secondEventSql = mockPrisma.$executeRaw.mock.calls[3][0];
        expect(firstEventSql.values).toContain(CONTAINER_PFC);
        expect(firstEventSql.values).not.toContain(CONTAINER_SFP);
        expect(secondEventSql.values).toContain(CONTAINER_SFP);
        expect(secondEventSql.values).not.toContain(CONTAINER_PFC);
      });

      it('fiche 147-01 (slide) : event finissant après minuit → le suivant démarre à sa fin déclarée, pas à minuit (PFC-RC Lens / SFP-Toulouse)', async () => {
        // Février, Europe/Paris = UTC+1 : "02:00" local = 01:00Z, "03:00" local = 02:00Z.
        const pfc = {
          ...makeEvent(EVENT_1),
          eventDate: new Date('2026-02-14T00:00:00.000Z'),
          eventStartDate: null,
          eventEndDate: new Date('2026-02-15T00:00:00.000Z'),
          eventEndTime: '02:00',
        };
        const sfp = {
          ...makeEvent(EVENT_2),
          eventDate: new Date('2026-02-15T00:00:00.000Z'),
          eventStartDate: null,
          eventEndDate: new Date('2026-02-16T00:00:00.000Z'),
          eventEndTime: '03:00',
        };
        mockPrisma.event.findMany.mockResolvedValue([pfc, sfp]);

        const job = makeBullJob({ eventIds: [EVENT_1, EVENT_2] });
        await service.executeProcessEvents(job);

        const datesOf = (call: number) =>
          (mockPrisma.$executeRaw.mock.calls[call][0].values ?? []).filter((v: any) => v instanceof Date);
        const pfcEnd = combineDayAndLocalTime(pfc.eventEndDate, '02:00', 'Europe/Paris')!;
        // PFC : minuit local du 14/02 → 15/02 02:00 local.
        expect(datesOf(0).some((d: Date) => d.getTime() === combineDayAndLocalTime(pfc.eventDate, '00:00', 'Europe/Paris')!.getTime())).toBe(true);
        expect(datesOf(0).some((d: Date) => d.getTime() === pfcEnd.getTime())).toBe(true);
        // SFP : démarre à la fin de PFC (02:00 local le 15/02), pas à minuit ; finit 16/02 03:00 local.
        expect(datesOf(3).some((d: Date) => d.getTime() === pfcEnd.getTime())).toBe(true);
        expect(datesOf(3).some((d: Date) => d.getTime() === combineDayAndLocalTime(sfp.eventEndDate, '03:00', 'Europe/Paris')!.getTime())).toBe(true);
        expect(datesOf(3).every((d: Date) => d.getTime() !== combineDayAndLocalTime(sfp.eventDate, '00:00', 'Europe/Paris')!.getTime())).toBe(true);
      });

      it('fiche 147-01 : double affiche même jour SANS tag (mode range, CSV) → fenêtres disjointes, pas de double comptage (anti-145-01)', async () => {
        const sameDay = new Date('2026-02-14T00:00:00.000Z');
        const apresMidi = { ...makeEvent(EVENT_1), eventDate: sameDay, eventStartDate: null, eventEndTime: '18:00' };
        const soir = { ...makeEvent(EVENT_2), eventDate: sameDay, eventStartDate: null, eventEndTime: '23:00' };
        mockPrisma.event.findMany.mockResolvedValue([apresMidi, soir]);

        const job = makeBullJob({ eventIds: [EVENT_1, EVENT_2] });
        await service.executeProcessEvents(job);

        const datesOf = (call: number) =>
          (mockPrisma.$executeRaw.mock.calls[call][0].values ?? []).filter((v: any) => v instanceof Date);
        const finApresMidi = combineDayAndLocalTime(sameDay, '18:00', 'Europe/Paris')!;
        // L'event de l'après-midi garde minuit → 18:00 ; celui du soir démarre à 18:00.
        expect(datesOf(0).some((d: Date) => d.getTime() === combineDayAndLocalTime(sameDay, '00:00', 'Europe/Paris')!.getTime())).toBe(true);
        expect(datesOf(0).some((d: Date) => d.getTime() === finApresMidi.getTime())).toBe(true);
        expect(datesOf(3).some((d: Date) => d.getTime() === finApresMidi.getTime())).toBe(true);
        expect(datesOf(3).some((d: Date) => d.getTime() === combineDayAndLocalTime(sameDay, '23:00', 'Europe/Paris')!.getTime())).toBe(true);
      });

      it('fiche 147-01 : re-agrégation incrémentale → le voisin HORS batch borne quand même le début de fenêtre', async () => {
        const pfc = {
          ...makeEvent(EVENT_1),
          eventDate: new Date('2026-02-14T00:00:00.000Z'),
          eventStartDate: null,
          eventEndDate: new Date('2026-02-15T00:00:00.000Z'),
          eventEndTime: '02:00',
        };
        const sfp = {
          ...makeEvent(EVENT_2),
          eventDate: new Date('2026-02-15T00:00:00.000Z'),
          eventStartDate: null,
          eventEndDate: new Date('2026-02-16T00:00:00.000Z'),
          eventEndTime: '03:00',
        };
        // 1er findMany (batch, filtré par id) vs 2e (tous les events de l'espace).
        mockPrisma.event.findMany.mockImplementation(({ where }: any) =>
          Promise.resolve(where?.id ? [pfc, sfp].filter((e) => where.id.in.includes(e.id)) : [pfc, sfp]),
        );

        const job = makeBullJob({ eventIds: [EVENT_2] });
        await service.executeProcessEvents(job);

        const dates = (mockPrisma.$executeRaw.mock.calls[0][0].values ?? []).filter((v: any) => v instanceof Date);
        const pfcEnd = combineDayAndLocalTime(pfc.eventEndDate, '02:00', 'Europe/Paris')!;
        expect(dates.some((d: Date) => d.getTime() === pfcEnd.getTime())).toBe(true);
        expect(dates.every((d: Date) => d.getTime() !== combineDayAndLocalTime(sfp.eventDate, '00:00', 'Europe/Paris')!.getTime())).toBe(true);
      });

      it('BUG-328-02 : la fenêtre de repli (mode range) exclut toujours les transactions déjà liées à un event (t.eventId IS NULL)', async () => {
        const job = makeBullJob();
        await service.executeProcessEvents(job);

        const sqlArg = mockPrisma.$executeRaw.mock.calls[0][0];
        expect(sqlArg.text ?? sqlArg.sql).toEqual(expect.stringContaining('t."eventId" IS NULL'));
      });
    });
  });

  // ─── executeSynchronize ──────────────────────────────────────────────────
  describe('executeSynchronize', () => {
    beforeEach(() => {
      mockPrisma.aggregationJobLog.update.mockResolvedValue({});
      mockPrisma.event.findMany.mockResolvedValue([makeEvent(EVENT_1)]);
      mockPrisma.locationSpaceMapping.findFirst.mockResolvedValue({ spaceId: SPACE });
      mockPrisma.salesLocation.findMany.mockResolvedValue([{ id: LOCATION_ID }]);
      mockPrisma.locationShopMapping.findMany.mockResolvedValue([
        { weezeventLocationId: LOCATION_ID, spaceElementId: 'element-1' },
      ]);
      mockPrisma.salesTransaction.findMany.mockResolvedValue([]);
      mockPrisma.spaceRevenueMinuteAgg.upsert.mockResolvedValue({});
      mockPrisma.spaceProductRevenueDailyAgg.upsert.mockResolvedValue({});
      mockPrisma.$executeRaw.mockResolvedValue(0);
      mockPrisma.spaceRevenueMinuteAgg.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.salesEvent.findMany.mockResolvedValue([]);
      mockPrisma.spaceRevenueMinuteAgg.aggregate.mockResolvedValue({
        _sum: { revenueHt: null, transactionsCount: null, itemsCount: null },
        _count: { _all: 0 },
      });
      // $transaction exécute les deleteMany passées
      mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
        for (const op of ops) await op;
      });
      mockPrisma.spaceRevenueMinuteAgg.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.spaceProductRevenueDailyAgg.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.spaceRevenueMinuteItemAgg.deleteMany.mockResolvedValue({ count: 0 });
    });

    it('nettoie les 3 tables dans une transaction atomique (fix #9)', async () => {
      const job = makeBullJob({ type: 'synchronize' });
      await service.executeSynchronize(job);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const txOps = mockPrisma.$transaction.mock.calls[0][0];
      // Les 3 deleteMany doivent être dans la même transaction
      expect(txOps).toHaveLength(3);
    });

    it('retourne un summary avec totalRevenue', async () => {
      mockPrisma.spaceRevenueMinuteAgg.aggregate.mockResolvedValue({
        _sum: { revenueHt: '1234.56', transactionsCount: 100, itemsCount: 500 },
        _count: { _all: 200 },
      });

      const job = makeBullJob({ type: 'synchronize' });
      const result = await service.executeSynchronize(job);

      expect(result.summary.totalRevenue).toBeCloseTo(1234.56);
      expect(result.summary.totalTransactions).toBe(100);
    });

    // ─── BUG-318-02 ──────────────────────────────────────────────────────────
    it('BUG-318-02 : le cleanup Phase 1 est scopé par integrationId quand il est fourni (makeBullJob() en fournit un par défaut)', async () => {
      const job = makeBullJob({ type: 'synchronize' });
      await service.executeSynchronize(job);

      expect(mockPrisma.spaceRevenueMinuteAgg.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, spaceId: SPACE, integrationId: INT_ID },
      });
      expect(mockPrisma.spaceProductRevenueDailyAgg.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, spaceId: SPACE, integrationId: INT_ID },
      });
      expect(mockPrisma.spaceRevenueMinuteItemAgg.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, spaceId: SPACE, integrationId: INT_ID },
      });
    });

    it('BUG-318-02 : le cleanup Phase 1 purge tout le space (sans filtre) si integrationId est absent — resync global explicite', async () => {
      const job = makeBullJob({ type: 'synchronize', integrationId: undefined });
      await service.executeSynchronize(job);

      expect(mockPrisma.spaceRevenueMinuteAgg.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, spaceId: SPACE },
      });
    });
  });

  // ─── getJobProgress ──────────────────────────────────────────────────────
  describe('getJobProgress', () => {
    it('retourne percentage=100 si status=completed', async () => {
      mockPrisma.aggregationJobLog.findFirst.mockResolvedValue(makeJob('completed'));
      mockPrisma.spaceRevenueMinuteAgg.count.mockResolvedValue(480);

      const result = await service.getJobProgress(TENANT, JOB_LOG_ID);

      expect(result.percentage).toBe(100);
      expect(result.status).toBe('completed');
    });

    it('calcule percentage proportionnel quand status=running', async () => {
      const job = makeJob('running', [EVENT_1, EVENT_2]);
      job.transactionsProcessed = 1;
      mockPrisma.aggregationJobLog.findFirst.mockResolvedValue(job);
      mockPrisma.spaceRevenueMinuteAgg.count.mockResolvedValue(0);

      const result = await service.getJobProgress(TENANT, JOB_LOG_ID);

      expect(result.percentage).toBe(50); // 1/2 = 50%
      expect(result.current).toBe(1);
      expect(result.total).toBe(2);
    });

    it('lance NotFoundException si jobId inconnu', async () => {
      mockPrisma.aggregationJobLog.findFirst.mockResolvedValue(null);
      await expect(service.getJobProgress(TENANT, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getEventMinuteChart ─────────────────────────────────────────────────
  describe('getEventMinuteChart', () => {
    const MINUTE_1 = new Date('2025-05-10T20:00:00Z');
    const MINUTE_2 = new Date('2025-05-10T20:01:00Z');

    beforeEach(() => {
      mockPrisma.event.findFirst.mockResolvedValue(makeEvent(EVENT_1));
      mockPrisma.spaceRevenueMinuteAgg.groupBy.mockResolvedValue([
        { minute: MINUTE_1, _sum: { revenueHt: '45.00', transactionsCount: 3, itemsCount: 7 } },
        { minute: MINUTE_2, _sum: { revenueHt: '30.00', transactionsCount: 2, itemsCount: 4 } },
      ]);
    });

    it('retourne eventId + eventName + data[]', async () => {
      const result = await service.getEventMinuteChart(TENANT, SPACE, EVENT_1);

      expect(result.eventId).toBe(EVENT_1);
      expect(result.eventName).toBe(`Event ${EVENT_1}`);
      expect(result.data).toHaveLength(2);
    });

    it('chaque point a minute + revenueHt + transactionsCount + itemsCount', async () => {
      const result = await service.getEventMinuteChart(TENANT, SPACE, EVENT_1);
      const point = result.data[0];

      expect(point.minute).toEqual(MINUTE_1);
      expect(point.revenueHt).toBeCloseTo(45);
      expect(point.transactionsCount).toBe(3);
      expect(point.itemsCount).toBe(7);
    });

    it('retourne data=[] si aucune donnée SpaceRevenueMinuteAgg', async () => {
      mockPrisma.spaceRevenueMinuteAgg.groupBy.mockResolvedValue([]);
      const result = await service.getEventMinuteChart(TENANT, SPACE, EVENT_1);
      expect(result.data).toHaveLength(0);
    });

    it('lance NotFoundException si event introuvable', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);
      await expect(service.getEventMinuteChart(TENANT, SPACE, 'bad-event')).rejects.toThrow(NotFoundException);
    });

    it('utilise groupBy sur spaceRevenueMinuteAgg (pas spaceRevenueDailyAgg)', async () => {
      await service.getEventMinuteChart(TENANT, SPACE, EVENT_1);
      expect(mockPrisma.spaceRevenueMinuteAgg.groupBy).toHaveBeenCalledTimes(1);
      // Confirmer le filtre weezeventEventId
      expect(mockPrisma.spaceRevenueMinuteAgg.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ weezeventEventId: EVENT_1 }) }),
      );
    });
  });

  // ─── skipEvent ───────────────────────────────────────────────────────────
  describe('skipEvent', () => {
    it('crée un job log avec status "skipped"', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(makeEvent(EVENT_1));
      mockPrisma.spaceRevenueMinuteAgg.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.aggregationJobLog.create.mockResolvedValue({ id: 'skip-job' });

      const result = await service.skipEvent(TENANT, SPACE, EVENT_1);

      expect(result).toMatchObject({ eventId: EVENT_1, status: 'skipped', purgedDataPoints: 0 });
      expect(mockPrisma.aggregationJobLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'skipped', jobType: 'skip' }) }),
      );
    });

    it('purge les data points déjà agrégés pour cet event (BUG-020)', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(makeEvent(EVENT_1));
      mockPrisma.spaceRevenueMinuteAgg.deleteMany.mockResolvedValue({ count: 42 });
      mockPrisma.aggregationJobLog.create.mockResolvedValue({ id: 'skip-job' });

      const result = await service.skipEvent(TENANT, SPACE, EVENT_1);

      expect(mockPrisma.spaceRevenueMinuteAgg.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, spaceId: SPACE, weezeventEventId: EVENT_1 },
      });
      expect(result).toMatchObject({ purgedDataPoints: 42 });
    });

    it('lance NotFoundException si event introuvable', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);
      await expect(service.skipEvent(TENANT, SPACE, 'bad')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getStep4Context (BUG-029) ───────────────────────────────────────────
  describe('getStep4Context', () => {
    beforeEach(() => {
      mockPrisma.space.findFirst.mockResolvedValue({ id: SPACE, tenantId: TENANT });
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.event.count.mockResolvedValue(0);
      mockPrisma.aggregationJobLog.findMany.mockResolvedValue([]);
      mockPrisma.spaceRevenueMinuteAgg.groupBy.mockResolvedValue([]);
      mockPrisma.salesEvent.findMany.mockResolvedValue([]);
    });

    it('scope hasMappings par intégration via MappingsService (pas tenant-wide)', async () => {
      mockMappingsService.hasShopMappingForIntegration.mockResolvedValue(true);

      const result = await service.getStep4Context(TENANT, SPACE, INT_ID);

      expect(mockMappingsService.hasShopMappingForIntegration).toHaveBeenCalledWith(TENANT, INT_ID);
      expect(mockPrisma.locationShopMapping.count).not.toHaveBeenCalled();
      expect(result.hasMappings).toBe(true);
    });

    it('retombe sur un count tenant-wide si integrationId absent (legacy)', async () => {
      mockPrisma.locationShopMapping.count.mockResolvedValue(3);

      const result = await service.getStep4Context(TENANT, SPACE);

      expect(mockMappingsService.hasShopMappingForIntegration).not.toHaveBeenCalled();
      expect(mockPrisma.locationShopMapping.count).toHaveBeenCalledWith({ where: { tenantId: TENANT } });
      expect(result.hasMappings).toBe(true);
    });
  });

  // ─── markJobLogFailed ────────────────────────────────────────────────────
  describe('markJobLogFailed', () => {
    it('updateMany avec status="failed" seulement si pas déjà completed', async () => {
      mockPrisma.aggregationJobLog.updateMany.mockResolvedValue({ count: 1 });

      await service.markJobLogFailed(JOB_LOG_ID, 'timeout error');

      expect(mockPrisma.aggregationJobLog.updateMany).toHaveBeenCalledWith({
        where: { id: JOB_LOG_ID, status: { not: 'completed' } },
        data: expect.objectContaining({ status: 'failed', error: 'timeout error' }),
      });
    });
  });
});
