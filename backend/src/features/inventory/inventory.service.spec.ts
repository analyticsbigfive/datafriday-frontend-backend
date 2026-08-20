import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { LogisticsService } from '../logistics/logistics.service';
import { PrismaService } from '../../core/database/prisma.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSnapshot(overrides = {}) {
  return {
    id: 'snap-1',
    tenantId: 'tenant-1',
    spaceId: 'space-1',
    eventId: 'event-1',
    inventoryCounts: { 'shop-1': { 'item-1': { packedUnits: 2, looseUnits: 3 } } },
    createdBy: 'user-1',
    createdAt: new Date('2026-06-18T10:00:00Z'),
    updatedAt: new Date('2026-06-18T10:00:00Z'),
    ...overrides,
  };
}

function makeCount(overrides = {}) {
  return {
    id: 'cnt-1',
    tenantId: 'tenant-1',
    spaceId: 'space-1',
    eventId: 'event-1',
    shopId: 'shop-1',
    itemId: 'item-1',
    packedUnits: 4,
    looseUnits: 1,
    isCounted: true,
    storageLocation: 'Zone A',
    countingStatus: 'counted',
    discardedQuantity: 0,
    discardedReason: null,
    countedBy: 'user-1',
    createdAt: new Date('2026-06-18T12:00:00Z'),
    updatedAt: new Date('2026-06-18T12:00:00Z'),
    ...overrides,
  };
}

// ── Mock QueueService ─────────────────────────────────────────────────────────
// LogisticsService n'enfile un job que dans `scheduleAggregation` (:2040), jamais
// sur les chemins d'attendus exercés ici — un stub suffit.

const mockQueueService = {
  queueAggregationJob: jest.fn().mockResolvedValue(undefined),
};

// Job Scheduler BullMQ des runs d'auto-simulation QA (11_LIVE.md) — aucun chemin exercé
// ici ne le touche, un stub suffit (même raison que mockQueueService ci-dessus).
const mockSimulationQueue = {
  upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
  removeJobScheduler: jest.fn().mockResolvedValue(true),
};

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockPrisma = {
  inventorySnapshot: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  inventoryCount: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  // getLatestBySpace dénormalise eventName via event.findFirst (ajout postérieur
  // à cette spec — son absence faisait jeter TypeError, 3 tests cassés).
  event: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  // Pre-event expected (BUG-232) : rejeu des mouvements + résolution unitsPerPack
  // (chaîne MarketPrice → MenuComponent → MenuItem, via LogisticsService réel).
  space: {
    findFirst: jest.fn().mockResolvedValue({ id: 'space-1' }),
  },
  stockMovement: {
    findMany: jest.fn().mockResolvedValue([]),
    // getExpectedStockIndex (état Logistic) : premier mouvement = ancre de
    // dérivation des ventes quand aucun reset n'existe. null = pas d'ancre.
    findFirst: jest.fn().mockResolvedValue(null),
  },
  // Attendus = état Logistic (décision JLH 2026-08-20) : niveaux du registre.
  stockLevel: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  stockReconciliation: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    delete: jest.fn(),
  },
  spaceElement: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  menuItem: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  marketPrice: {
    findFirst: jest.fn().mockResolvedValue(null),
    // resolveInventoryUnitsPerPack (BUG-239) : conditionnement du référentiel
    // INVENTAIRE, résolu en lot par nom d'article.
    findMany: jest.fn().mockResolvedValue([]),
  },
  menuComponent: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // jest.clearAllMocks() efface aussi les mockResolvedValue par défaut — on
    // les repose pour les mocks « toujours vides ».
    mockPrisma.event.findFirst.mockResolvedValue(null);
    mockPrisma.space.findFirst.mockResolvedValue({ id: 'space-1' });
    mockPrisma.stockMovement.findMany.mockResolvedValue([]);
    mockPrisma.stockMovement.findFirst.mockResolvedValue(null);
    mockPrisma.stockLevel.findMany.mockResolvedValue([]);
    mockPrisma.spaceElement.findMany.mockResolvedValue([]);
    mockPrisma.menuItem.findMany.mockResolvedValue([]);
    mockPrisma.menuItem.findFirst.mockResolvedValue(null);
    mockPrisma.marketPrice.findFirst.mockResolvedValue(null);
    mockPrisma.marketPrice.findMany.mockResolvedValue([]);
    mockPrisma.menuComponent.findFirst.mockResolvedValue(null);
    mockPrisma.menuComponent.findMany.mockResolvedValue([]);
    mockPrisma.stockReconciliation.findMany.mockResolvedValue([]);
    mockPrisma.stockReconciliation.findFirst.mockResolvedValue(null);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        // LogisticsService RÉEL (normalizeLevel + resolveUnitsPerPackForItemKey) :
        // c'est précisément sa sémantique de casse de pack qu'on veut rejouer.
        // QueueService stubé : aucun chemin exercé ici n'enfile de job.
        {
          provide: LogisticsService,
          useValue: new LogisticsService(mockPrisma as any, mockQueueService as any, mockSimulationQueue as any, {} as any, {
            hasFullAccess: () => true,
            getAccessibleSpaceIds: async () => 'ALL',
          } as any),
        },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── getBySpaceAndEvent ──────────────────────────────────────────────────────

  describe('getBySpaceAndEvent', () => {
    it('prioritise InventoryCount rows over snapshot when both exist', async () => {
      const snap = makeSnapshot();
      const count = makeCount();
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(snap);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([count]);

      const result = await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1');

      // Le résultat doit être construit depuis les counts, pas le blob snapshot
      expect(result.inventoryCounts).toEqual({
        'shop-1': {
          'item-1': {
            itemId: 'item-1',
            packedUnits: 4,
            looseUnits: 1,
            isCounted: true,
            storageLocation: 'Zone A',
            countingStatus: 'counted',
          },
        },
      });
      expect(result.spaceId).toBe('space-1');
      expect(result.eventId).toBe('event-1');
    });

    it('falls back to snapshot when no InventoryCount rows exist', async () => {
      const snap = makeSnapshot();
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(snap);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([]);

      const result = await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1');

      expect(result).toEqual(snap);
    });

    it('returns empty state (not 404) when neither snapshot nor counts exist', async () => {
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([]);

      const result = await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1');

      expect(result.id).toBeNull();
      expect(result.inventoryCounts).toEqual({});
      expect(result.spaceId).toBe('space-1');
      expect(result.eventId).toBe('event-1');
    });

    it('skips counts with null shopId in buildInventoryCounts', async () => {
      const countNoShop = makeCount({ shopId: null });
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([countNoShop]);

      const result = await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1');

      // counts sans shopId ne peuvent pas être adressés par le front — on les ignore
      expect(result.inventoryCounts).toEqual({});
    });

    it('falls back to the snapshot when ALL counts have null shopId (fix 2026-07-18)', async () => {
      // Avant le fix : l'early-return « counts.length > 0 » servait
      // inventoryCounts: {} en ignorant un snapshot pourtant présent →
      // inventaire affiché vide malgré des données sauvegardées.
      const snapshot = makeSnapshot();
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(snapshot);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([
        makeCount({ id: 'c1', shopId: null }),
        makeCount({ id: 'c2', shopId: null, itemId: 'item-2' }),
      ]);

      const result = await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1');

      expect(result).toEqual(snapshot);
    });

    it('groups multiple counts by shopId correctly', async () => {
      const c1 = makeCount({ id: 'c1', shopId: 'shop-A', itemId: 'item-1', packedUnits: 2, looseUnits: 0 });
      const c2 = makeCount({ id: 'c2', shopId: 'shop-A', itemId: 'item-2', packedUnits: 0, looseUnits: 5 });
      const c3 = makeCount({ id: 'c3', shopId: 'shop-B', itemId: 'item-1', packedUnits: 1, looseUnits: 1 });
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([c1, c2, c3]);

      const result = await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1');

      expect(Object.keys(result.inventoryCounts)).toHaveLength(2);
      expect(result.inventoryCounts['shop-A']['item-1'].packedUnits).toBe(2);
      expect(result.inventoryCounts['shop-A']['item-2'].looseUnits).toBe(5);
      expect(result.inventoryCounts['shop-B']['item-1'].packedUnits).toBe(1);
    });
  });

  // ── getLatestBySpace ────────────────────────────────────────────────────────

  describe('getLatestBySpace', () => {
    it('returns null when no data exists', async () => {
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(null);
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);

      const result = await service.getLatestBySpace('space-1', 'tenant-1');
      expect(result).toBeNull();
    });

    it('returns snapshot when no counts exist', async () => {
      const snap = makeSnapshot();
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(null);
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(snap);

      const result = await service.getLatestBySpace('space-1', 'tenant-1');
      // eventName : dénormalisation additive (event.findFirst mocké → null ici).
      expect(result).toEqual({ ...snap, eventName: null });
    });

    it('returns counts-based response when count is newer than snapshot', async () => {
      const snap = makeSnapshot({ createdAt: new Date('2026-06-18T10:00:00Z') });
      const latestCount = makeCount({ updatedAt: new Date('2026-06-18T12:00:00Z') });
      const allCounts = [latestCount];

      mockPrisma.inventoryCount.findFirst.mockResolvedValue(latestCount);
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(snap);
      mockPrisma.inventoryCount.findMany.mockResolvedValue(allCounts);

      const result = await service.getLatestBySpace('space-1', 'tenant-1');

      expect(result.eventId).toBe(latestCount.eventId);
      expect(result.inventoryCounts['shop-1']).toBeDefined();
    });

    it('returns snapshot when snapshot is newer than counts', async () => {
      const snap = makeSnapshot({ createdAt: new Date('2026-06-18T14:00:00Z') });
      const latestCount = makeCount({ updatedAt: new Date('2026-06-18T10:00:00Z') });

      mockPrisma.inventoryCount.findFirst.mockResolvedValue(latestCount);
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(snap);

      const result = await service.getLatestBySpace('space-1', 'tenant-1');
      // eventName : dénormalisation additive (event.findFirst mocké → null ici).
      expect(result).toEqual({ ...snap, eventName: null });
    });
  });

  // ── upsertInventory ─────────────────────────────────────────────────────────

  describe('upsertInventory', () => {
    it('creates a new InventorySnapshot (append-only)', async () => {
      const snap = makeSnapshot();
      mockPrisma.inventorySnapshot.create.mockResolvedValue(snap);

      const dto = {
        spaceId: 'space-1',
        eventId: 'event-1',
        inventoryCounts: { 'shop-1': { 'item-1': { packedUnits: 2, looseUnits: 0 } } },
      };
      const result = await service.upsertInventory(dto, 'tenant-1', 'user-1');

      expect(mockPrisma.inventorySnapshot.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          spaceId: 'space-1',
          eventId: 'event-1',
          inventoryCounts: dto.inventoryCounts,
          createdBy: 'user-1',
          kind: null, // dto sans kind → null (discrimination pre/post-event, commit 6491562)
        },
      });
      expect(result).toEqual(snap);
    });

    it('handles null eventId gracefully', async () => {
      const snap = makeSnapshot({ eventId: null });
      mockPrisma.inventorySnapshot.create.mockResolvedValue(snap);

      await service.upsertInventory({ spaceId: 'space-1', inventoryCounts: {} }, 'tenant-1');

      expect(mockPrisma.inventorySnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventId: null }) }),
      );
    });
  });

  // ── saveInventoryCounts ─────────────────────────────────────────────────────

  describe('saveInventoryCounts', () => {
    const dto = {
      spaceId: 'space-1',
      eventId: 'event-1',
      shopId: 'shop-1',
      itemId: 'item-1',
      packedUnits: 3,
      looseUnits: 1,
      isCounted: false,
      storageLocation: null,
      countingStatus: 'pending',
    };

    it('creates a new row when no existing count found', async () => {
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(null);
      const created = makeCount({ packedUnits: 3, looseUnits: 1 });
      mockPrisma.inventoryCount.create.mockResolvedValue(created);

      const result = await service.saveInventoryCounts(dto, 'tenant-1', 'user-1');

      expect(mockPrisma.inventoryCount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          spaceId: 'space-1',
          eventId: 'event-1',
          shopId: 'shop-1',
          itemId: 'item-1',
          packedUnits: 3,
          looseUnits: 1,
          isCounted: false,
          countingStatus: 'pending',
          countedBy: 'user-1',
        }),
      });
      expect(mockPrisma.inventoryCount.update).not.toHaveBeenCalled();
      expect(result).toEqual(created);
    });

    it('updates existing row when count already exists', async () => {
      const existing = makeCount({ id: 'cnt-existing' });
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(existing);
      const updated = { ...existing, packedUnits: 3, looseUnits: 1, isCounted: false };
      mockPrisma.inventoryCount.update.mockResolvedValue(updated);

      const result = await service.saveInventoryCounts(dto, 'tenant-1', 'user-1');

      expect(mockPrisma.inventoryCount.update).toHaveBeenCalledWith({
        where: { id: 'cnt-existing' },
        data: expect.objectContaining({ packedUnits: 3, looseUnits: 1, isCounted: false }),
      });
      expect(mockPrisma.inventoryCount.create).not.toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it('handles null eventId and shopId in findFirst lookup', async () => {
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryCount.create.mockResolvedValue(makeCount());

      await service.saveInventoryCounts(
        { spaceId: 'space-1', itemId: 'item-1', packedUnits: 0, looseUnits: 0, isCounted: false },
        'tenant-1',
      );

      expect(mockPrisma.inventoryCount.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ eventId: null, shopId: null }),
      });
    });

    it('defaults countingStatus to "pending" when not provided', async () => {
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryCount.create.mockResolvedValue(makeCount());

      await service.saveInventoryCounts(
        { spaceId: 'space-1', itemId: 'item-1', packedUnits: 0, looseUnits: 0, isCounted: false },
        'tenant-1',
      );

      expect(mockPrisma.inventoryCount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ countingStatus: 'pending' }),
        }),
      );
    });

    it('TOCTOU : rattrape P2002 (save concurrent) et met à jour la ligne gagnante (fix 2026-07-18)', async () => {
      // Deux saves concurrents : les deux voient existing=null. Le nôtre perd la
      // course au create → violation d'unicité P2002 (index unique NULLS NOT
      // DISTINCT, cf. prisma/sql/2026-07-18_...) → fallback update de la ligne créée
      // par le gagnant, au lieu de propager une 500 (ou, avant l'index, de créer
      // un DOUBLON silencieux).
      const winner = makeCount({ id: 'cnt-winner' });
      mockPrisma.inventoryCount.findFirst
        .mockResolvedValueOnce(null)        // lookup initial : rien
        .mockResolvedValueOnce(winner);     // re-lookup après P2002 : ligne du gagnant
      const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      mockPrisma.inventoryCount.create.mockRejectedValue(p2002);
      const updated = { ...winner, packedUnits: 3 };
      mockPrisma.inventoryCount.update.mockResolvedValue(updated);

      const result = await service.saveInventoryCounts(dto, 'tenant-1', 'user-1');

      expect(mockPrisma.inventoryCount.update).toHaveBeenCalledWith({
        where: { id: 'cnt-winner' },
        data: expect.objectContaining({ packedUnits: 3 }),
      });
      expect(result).toEqual(updated);
    });

    it('propage toute erreur de create qui n\'est pas P2002', async () => {
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryCount.create.mockRejectedValue(new Error('db down'));

      await expect(service.saveInventoryCounts(dto, 'tenant-1')).rejects.toThrow('db down');
      expect(mockPrisma.inventoryCount.update).not.toHaveBeenCalled();
    });
  });

  // ── Pre-event expected : rejeu normalisé (BUG-232) ──────────────────────────

  // ── Attendus = état Logistic « en l'état » (décision JLH 2026-08-20) ────────
  // L'attendu des deux écrans = ce que l'écran Logistic affiche au chargement
  // (StockLevel − ventes dérivées, clamp ≥ 0), re-découpé dans la taille de
  // paquet de l'INVENTAIRE (BUG-239). Dans ces tests : pas de reset ni de premier
  // mouvement → ancre de ventes nulle → l'état Logistic = les niveaux bruts.

  describe('getPreEventBaseline (attendus = état Logistic)', () => {
    const targetEvent = { id: 'event-next' };

    function wireEvent() {
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.id ? targetEvent : null),
      );
    }

    /** spaceElement.findMany sert 2 lookups : getSpaceElementIds (where.OR) et la
     *  dénormalisation des noms de la réconciliation. Dispatch par forme du where. */
    function wireElements(ids: string[], named: Array<{ id: string; name: string }> = []) {
      mockPrisma.spaceElement.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.OR ? ids.map((id) => ({ id })) : named),
      );
    }

    /** menuItem.findMany sert 2 lookups : menuItemIdByNormName (sans where.id) et
     *  resolveInventoryUnitsPerPack (where.id.in). Dispatch par forme du where. */
    function wireCatalog(items: Array<{ id: string; name: string; inventoryNumberOfUnits?: number }>) {
      mockPrisma.menuItem.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id
            ? items.map(({ id, name, inventoryNumberOfUnits }) => ({
                id,
                name,
                inventoryNumberOfUnits: inventoryNumberOfUnits ?? 1,
              }))
            : items.map(({ id, name }) => ({ id, name })),
        ),
      );
    }

    it("re-découpe l'état Logistic dans la taille de paquet de l'INVENTAIRE (BUG-239)", async () => {
      wireEvent();
      wireElements(['shop-1']);
      wireCatalog([{ id: 'item-beer', name: 'Biere', inventoryNumberOfUnits: 24 }]);
      // Registre Logistic : 2 packs de 12 — l'écran d'inventaire compte en packs de 24.
      mockPrisma.stockLevel.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Biere', packedUnits: 2, looseUnits: 0, unitsPerPack: 12 },
      ]);

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      expect(result.source).toBe('logistic-live');
      expect(result.expected['shop-1']['item-beer']).toEqual({ packed: 1, loose: 0, units: 24, unitsPerPack: 24 });
      // Compat ancien front : la clé `baseline` reste truthy (gate `baseline?.baseline`).
      expect(result.baseline).toEqual({});
      expect(result.previousEvent).toBeNull();
    });

    it("conditionnement d'inventaire inconnu : canaux packed/loose conservés, pas de total fabriqué", async () => {
      wireEvent();
      wireElements(['shop-1']);
      wireCatalog([{ id: 'item-fut', name: 'Fût 30L' }]); // inventoryNumberOfUnits 1 ≡ pas de facteur paquet
      mockPrisma.stockLevel.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Fût 30L', packedUnits: 3, looseUnits: 0.5, unitsPerPack: null },
      ]);

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      expect(result.expected['shop-1']['item-fut']).toEqual({ packed: 3, loose: 0.5, units: null, unitsPerPack: null });
    });

    it('niveau Logistic non joignable au référentiel compté : ignoré mais SURFACÉ', async () => {
      wireEvent();
      wireElements(['shop-1']);
      wireCatalog([{ id: 'item-beer', name: 'Biere' }]);
      mockPrisma.stockLevel.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Nom Inconnu Total', packedUnits: 9, looseUnits: 0, unitsPerPack: null },
      ]);

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      expect(result.expected).toEqual({});
      expect(result.unjoinedItemKeys).toEqual(['Nom Inconnu Total']);
    });

    it("niveaux d'éléments disparus (delete+recreate config) : exclus, comme sur l'écran Logistic", async () => {
      wireEvent();
      wireElements(['shop-1']);
      wireCatalog([{ id: 'item-beer', name: 'Biere' }]);
      mockPrisma.stockLevel.findMany.mockResolvedValue([
        { elementId: 'shop-fantome', itemKey: 'Biere', packedUnits: 4, looseUnits: 0, unitsPerPack: null },
      ]);

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      expect(result.expected).toEqual({});
    });

    it('createPreEventReconciliation : mêmes attendus que le GET, article hors registre → « — »', async () => {
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.id ? { id: 'event-next', name: 'Prochain match' } : null),
      );
      wireElements(['shop-1'], [{ id: 'shop-1', name: 'Buvette 1' }]);
      wireCatalog([
        { id: 'item-choco', name: 'Barre chocolatée', inventoryNumberOfUnits: 5 },
        { id: 'item-ghost', name: 'Carotte râpée' },
      ]);
      mockPrisma.stockLevel.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Barre chocolatée', packedUnits: 2, looseUnits: 4, unitsPerPack: 5 },
      ]);
      // Compté : le chocolat suivi par la Logistique, la carotte jamais approvisionnée.
      mockPrisma.inventoryCount.findMany.mockResolvedValue([
        makeCount({ eventId: 'event-next', shopId: 'shop-1', itemId: 'item-choco', packedUnits: 2, looseUnits: 3 }),
        makeCount({ id: 'cnt-2', eventId: 'event-next', shopId: 'shop-1', itemId: 'item-ghost', packedUnits: 1, looseUnits: 0 }),
      ]);
      mockPrisma.stockReconciliation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'reco-1', ...data }),
      );

      const reco = await service.createPreEventReconciliation('space-1', 'event-next', 'tenant-1', 'user-1');

      const choco = (reco.lines as any[]).find((l: any) => l.itemKey === 'item-choco');
      expect(choco.expectedPacked).toBe(2);
      expect(choco.expectedLoose).toBe(4);
      expect(choco.expectedUnits).toBe(14);
      expect(choco.deltaPacked).toBe(0);
      expect(choco.deltaLoose).toBe(-1);
      // Jamais suivi par la Logistique : « — » (null), jamais 0 fabriqué.
      const ghost = (reco.lines as any[]).find((l: any) => l.itemKey === 'item-ghost');
      expect(ghost.expectedPacked).toBeNull();
      expect(ghost.deltaPacked).toBeNull();
      expect(ghost.countedPacked).toBe(1);
      expect((reco.meta as any).baseline).toEqual({ source: 'logistic-live', asOf: expect.any(Date) });
    });
  });

  describe('getPostEventBaseline (état Logistic + movementUnits de la fenêtre du match)', () => {
    const targetEvent = {
      id: 'event-1',
      name: 'Match A',
      eventDate: new Date('2026-07-10T18:00:00Z'),
      eventEndDate: new Date('2026-07-10T23:00:00Z'),
    };

    beforeEach(() => {
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.id ? targetEvent : null),
      );
      mockPrisma.spaceElement.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.OR ? [{ id: 'shop-1' }] : []),
      );
      mockPrisma.menuItem.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id
            ? [{ id: 'item-beer', name: 'Biere', inventoryNumberOfUnits: 1 }]
            : [{ id: 'item-beer', name: 'Biere' }],
        ),
      );
    });

    /** Comptage pre-event de CE match : borne basse de la fenêtre movementUnits. */
    function wirePreEventSnapshot(at: Date | null) {
      mockPrisma.inventorySnapshot.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.kind === 'pre-event' && at
            ? makeSnapshot({ eventId: targetEvent.id, kind: 'pre-event', createdAt: at })
            : null,
        ),
      );
    }

    it('attendu = état Logistic (ventes déjà déduites, clamp ≥ 0) ; movementUnits = net de la fenêtre', async () => {
      wirePreEventSnapshot(new Date('2026-07-09T10:00:00Z'));
      mockPrisma.stockLevel.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Biere', packedUnits: 7, looseUnits: 0, unitsPerPack: null },
      ]);
      mockPrisma.stockMovement.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Biere', menuItemId: 'item-beer', packedDelta: 2, looseDelta: 0 },
      ]);

      const result = await service.getPostEventBaseline('space-1', 'event-1', 'tenant-1');

      expect(result.source).toBe('logistic-live');
      expect(result.expectedUnits['shop-1']['item-beer']).toBe(7);
      expect(result.movementUnits['shop-1']['item-beer']).toBe(2);
      expect(result.anchorEvent).toBeNull();
      expect(result.salesUnjoined).toBeNull();
    });

    it('fenêtre movementUnits : du comptage pre-event à eventEndDate + 1 j, SALE exclus', async () => {
      const preAt = new Date('2026-07-09T10:00:00Z');
      wirePreEventSnapshot(preAt);
      mockPrisma.stockLevel.findMany.mockResolvedValue([]);
      mockPrisma.stockMovement.findMany.mockResolvedValue([]);

      await service.getPostEventBaseline('space-1', 'event-1', 'tenant-1');

      const { where } = mockPrisma.stockMovement.findMany.mock.calls[0][0];
      expect(where.createdAt).toEqual({ gt: preAt, lt: new Date('2026-07-11T23:00:00Z') });
      expect(where.reason).toEqual({ notIn: ['SALE'] });
    });

    it("sans comptage pre-event : la fenêtre démarre à eventDate — et l'attendu, lui, existe toujours", async () => {
      wirePreEventSnapshot(null);
      mockPrisma.stockLevel.findMany.mockResolvedValue([]);
      mockPrisma.stockMovement.findMany.mockResolvedValue([]);

      const result = await service.getPostEventBaseline('space-1', 'event-1', 'tenant-1');

      const { where } = mockPrisma.stockMovement.findMany.mock.calls[0][0];
      expect(where.createdAt.gt).toEqual(targetEvent.eventDate);
      // Plus de « — » faute d'ancre : l'état Logistic est la référence.
      expect(result.expected).toEqual({});
    });

    it('event hors espace/tenant : 404', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);

      await expect(
        service.getPostEventBaseline('space-1', 'event-autre', 'tenant-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPreEventInventory — repli match précédent (BUG-241)', () => {
    it('exclut les événements simulés du repli (décision JLH 2026-08-20)', async () => {
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) => {
        if (where?.id) return Promise.resolve({ id: 'event-next', eventDate: new Date('2026-08-29T00:00:00Z') });
        if (where?.eventDate) return Promise.resolve({ id: 'event-real', name: 'Vrai match' });
        return Promise.resolve(null);
      });
      mockPrisma.inventorySnapshot.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.kind === 'post-event' && where?.eventId === 'event-real'
            ? makeSnapshot({ eventId: 'event-real', kind: 'post-event' })
            : null,
        ),
      );

      const result = await service.getPreEventInventory('space-1', 'event-next', 'tenant-1');

      expect(result.source).toBe('previous-post-event');
      // Le lookup du match précédent porte le filtre : un « [Simulé] » (outil QA)
      // ne peut plus capter le repli du pré-remplissage.
      const prevCall = mockPrisma.event.findFirst.mock.calls.find(([arg]: any) => arg?.where?.eventDate);
      expect(prevCall[0].where.isSimulated).toBe(false);
    });
  });

  // ── BUG-233 : expurgation des attendus pour les non-porteurs ────────────────

  describe('expurgation des attendus (BUG-233, canSeeExpected=false)', () => {
    const preDoc = {
      id: 'reco-pre',
      eventId: 'event-1',
      eventName: 'Match A',
      kind: 'pre-event',
      createdAt: new Date('2026-07-01T10:00:00Z'),
      createdBy: 'user-1',
      lines: [
        {
          elementId: 'shop-1',
          elementName: 'Buvette 1',
          itemKey: 'item-1',
          itemName: 'Coca',
          expectedPacked: 19,
          expectedLoose: 14,
          countedPacked: 19,
          countedLoose: 12,
          deltaPacked: 0,
          deltaLoose: -2,
        },
      ],
    };
    const postDoc = {
      id: 'reco-post',
      eventId: 'event-0',
      eventName: 'Match B',
      kind: 'post-event',
      createdAt: new Date('2026-06-01T10:00:00Z'),
      createdBy: 'user-1',
      lines: [{ elementId: 'shop-1', itemKey: 'item-1', soldUnits: 380, countedUnits: 85, missingUnits: 3 }],
    };

    it('listInventoryReconciliations : lignes pre-event expurgées (expected ET delta), post-event intactes', async () => {
      mockPrisma.stockReconciliation.findMany.mockResolvedValue([preDoc, postDoc]);

      const docs = await service.listInventoryReconciliations('space-1', 'tenant-1', false);

      const pre = docs.find((d: any) => d.id === 'reco-pre');
      // Attendus ET deltas retirés (delta seul suffirait à reconstruire :
      // expected = counted − delta). Le compté et les identités restent.
      expect(pre.lines[0]).toEqual({
        elementId: 'shop-1',
        elementName: 'Buvette 1',
        itemKey: 'item-1',
        itemName: 'Coca',
        countedPacked: 19,
        countedLoose: 12,
      });
      // Post-event : lignes fournies par le client, aucune donnée cachée → intactes.
      const post = docs.find((d: any) => d.id === 'reco-post');
      expect(post.lines).toEqual(postDoc.lines);
    });

    it('listInventoryReconciliations : porteur de la permission → documents complets', async () => {
      mockPrisma.stockReconciliation.findMany.mockResolvedValue([preDoc]);

      const docs = await service.listInventoryReconciliations('space-1', 'tenant-1', true);

      expect(docs[0].lines[0].expectedPacked).toBe(19);
      expect(docs[0].lines[0].deltaLoose).toBe(-2);
    });

    it('createPreEventReconciliation : réponse expurgée mais document PERSISTÉ complet', async () => {
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.id ? { id: 'event-next', name: 'Prochain match' } : null),
      );
      // Attendus = état Logistic (décision JLH 2026-08-20) : le registre porte
      // 3 packs + 2 vrac — les lignes persistées doivent les refléter.
      mockPrisma.stockLevel.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Barre chocolatée', packedUnits: 3, looseUnits: 2, unitsPerPack: null },
      ]);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([
        makeCount({ eventId: 'event-next', shopId: 'shop-1', itemId: 'item-choco', packedUnits: 2, looseUnits: 3 }),
      ]);
      mockPrisma.menuItem.findMany.mockResolvedValue([{ id: 'item-choco', name: 'Barre chocolatée' }]);
      // Dispatch spaceElement : ids d'espace (where.OR) vs dénormalisation des noms.
      mockPrisma.spaceElement.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.OR ? [{ id: 'shop-1' }] : [{ id: 'shop-1', name: 'Buvette 1' }]),
      );
      mockPrisma.stockReconciliation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'reco-1', ...data }),
      );

      const reco = await service.createPreEventReconciliation(
        'space-1',
        'event-next',
        'tenant-1',
        'user-1',
        false, // appelant SANS front.fb.preInventoryExpected
      );

      // Réponse : ni attendus ni deltas, compté conservé.
      const line = (reco.lines as any[])[0];
      expect(line.expectedPacked).toBeUndefined();
      expect(line.expectedLoose).toBeUndefined();
      expect(line.deltaPacked).toBeUndefined();
      expect(line.deltaLoose).toBeUndefined();
      expect(line.countedPacked).toBe(2);
      // Base : le document créé porte les lignes COMPLÈTES (l'expurgation ne
      // concerne que la réponse).
      const persisted = mockPrisma.stockReconciliation.create.mock.calls[0][0].data;
      expect((persisted.lines as any[])[0].expectedPacked).toBe(3);
    });
  });

  // ── Suppression d'un document (repartir de zéro) ────────────────────────────

  describe('deleteInventoryReconciliation', () => {
    it('supprime un document pre/post-event du space', async () => {
      mockPrisma.stockReconciliation.findFirst.mockResolvedValue({ id: 'reco-1', kind: 'post-event' });
      mockPrisma.stockReconciliation.delete.mockResolvedValue({ id: 'reco-1' });

      const result = await service.deleteInventoryReconciliation('space-1', 'reco-1', 'tenant-1');

      expect(mockPrisma.stockReconciliation.findFirst).toHaveBeenCalledWith({
        where: { id: 'reco-1', tenantId: 'tenant-1', spaceId: 'space-1', kind: { in: ['post-event', 'pre-event'] } },
        select: { id: true },
      });
      expect(mockPrisma.stockReconciliation.delete).toHaveBeenCalledWith({ where: { id: 'reco-1' } });
      expect(result).toEqual({ id: 'reco-1', deleted: true });
    });

    it('404 sur un document inconnu ou hors périmètre (reset logistique kind null protégé)', async () => {
      mockPrisma.stockReconciliation.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteInventoryReconciliation('space-1', 'reco-logistic', 'tenant-1'),
      ).rejects.toThrow('not found');
      expect(mockPrisma.stockReconciliation.delete).not.toHaveBeenCalled();
    });
  });
  // ── Phase de comptage pre/post (BUG-237) ────────────────────────────────────

  describe('getBySpaceAndEvent — phase de comptage (BUG-237)', () => {
    const preSnapshotAt = new Date('2026-07-24T10:00:00Z');

    /** Snapshot pre-event présent = comptage d'avant-match clôturé. */
    function wirePreSnapshot() {
      mockPrisma.inventorySnapshot.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.kind === 'pre-event' ? { createdAt: preSnapshotAt, kind: 'pre-event' } : null,
        ),
      );
    }

    it('phase post : une ligne figée AVANT la clôture du pre-event redevient « à compter »', async () => {
      wirePreSnapshot();
      mockPrisma.inventoryCount.findMany.mockResolvedValue([
        makeCount({
          updatedAt: new Date('2026-07-24T09:00:00Z'),
          isCounted: true,
          countingStatus: 'counted',
        }),
      ]);

      const result = await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1', 'post-event');
      const line = result.inventoryCounts['shop-1']['item-1'];

      // Valeurs conservées (proposition utile au recomptage)…
      expect(line.packedUnits).toBe(4);
      expect(line.looseUnits).toBe(1);
      // …mais PAS la validation : sinon l'écran s'ouvre « 100 % compté » et un
      // seul clic archive un post-event égal au comptage d'avant-match.
      expect(line.isCounted).toBe(false);
      expect(line.countingStatus).toBe('pending');
      expect(line.carriedFromPreEvent).toBe(true);
    });

    it('phase post : une ligne modifiée APRÈS la clôture du pre-event reste comptée', async () => {
      wirePreSnapshot();
      mockPrisma.inventoryCount.findMany.mockResolvedValue([
        makeCount({
          updatedAt: new Date('2026-07-24T12:00:00Z'),
          isCounted: true,
          countingStatus: 'counted',
        }),
      ]);

      const line = (await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1', 'post-event'))
        .inventoryCounts['shop-1']['item-1'];

      expect(line.isCounted).toBe(true);
      expect(line.countingStatus).toBe('counted');
      expect(line.carriedFromPreEvent).toBeUndefined();
    });

    it('sans phase (appelants historiques) : comportement inchangé', async () => {
      wirePreSnapshot();
      mockPrisma.inventoryCount.findMany.mockResolvedValue([
        makeCount({ updatedAt: new Date('2026-07-24T09:00:00Z'), isCounted: true }),
      ]);

      const line = (await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1'))
        .inventoryCounts['shop-1']['item-1'];

      expect(line.isCounted).toBe(true);
      expect(line.carriedFromPreEvent).toBeUndefined();
    });

    it('phase post sans snapshot pre-event : rien à requalifier', async () => {
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([
        makeCount({ updatedAt: new Date('2026-07-24T09:00:00Z'), isCounted: true }),
      ]);

      const line = (await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1', 'post-event'))
        .inventoryCounts['shop-1']['item-1'];

      expect(line.isCounted).toBe(true);
    });
  });

  // ── Taille de paquet unique de bout en bout (BUG-239) ───────────────────────

  describe('computeLogisticExpected — conditionnement inventaire vs logistique (BUG-239)', () => {
    beforeEach(() => {
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.id ? { id: 'event-next', name: 'Match cible' } : null),
      );
      mockPrisma.spaceElement.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.OR ? [{ id: 'shop-1' }] : [{ id: 'shop-1', name: 'Buvette' }]),
      );
      // Référentiel INVENTAIRE : carton de 24 (fiche menu item). Le registre
      // Logistic, lui, est tenu en packs de 12 (unitsPerPack du niveau).
      mockPrisma.menuItem.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id
            ? [{ id: 'item-coke', name: 'Coca-Cola CAN 33cl', inventoryNumberOfUnits: 24 }]
            : [{ id: 'item-coke', name: 'Coca-Cola CAN 33cl' }],
        ),
      );
    });

    it("un niveau tenu en packs de 12 se re-découpe en cartons de 24 à l'écran", async () => {
      mockPrisma.stockLevel.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Coca-Cola CAN 33cl', packedUnits: 11, looseUnits: 0, unitsPerPack: 12 },
      ]);

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      // 11 × 12 = 132 unités, re-découpées dans l'unité de l'ÉCRAN (24) :
      // 5 cartons + 12 en vrac. Additionner des packs de tailles différentes
      // donnait 11 « packs » légendés « cartons de 24 » (bug d'origine).
      expect(result.expected['shop-1']['item-coke']).toEqual({
        packed: 5,
        loose: 12,
        units: 132,
        unitsPerPack: 24,
      });
    });

    it('le vrac du registre est reporté dans le total en unités avant re-découpage', async () => {
      mockPrisma.stockLevel.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Coca-Cola CAN 33cl', packedUnits: 9, looseUnits: 6, unitsPerPack: 12 },
      ]);

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      // 9 × 12 + 6 = 114 = 4 cartons de 24 + 18.
      expect(result.expected['shop-1']['item-coke']).toEqual({
        packed: 4,
        loose: 18,
        units: 114,
        unitsPerPack: 24,
      });
    });

    it('les lignes de réconciliation pre-event portent le conditionnement du calcul', async () => {
      mockPrisma.stockLevel.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Coca-Cola CAN 33cl', packedUnits: 10, looseUnits: 0, unitsPerPack: 12 },
      ]);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([]);
      // Comptage pre-event en cours (fusion `getBySpaceAndEvent`) : snapshot non kindé.
      mockPrisma.inventorySnapshot.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.eventId === 'event-next' && !where?.kind
            ? makeSnapshot({
                eventId: 'event-next',
                inventoryCounts: { 'shop-1': { 'item-coke': { packedUnits: 4, looseUnits: 20 } } },
              })
            : null,
        ),
      );
      mockPrisma.stockReconciliation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'reco-1', ...data }),
      );

      const doc: any = await service.createPreEventReconciliation('space-1', 'event-next', 'tenant-1');
      const line = doc.lines[0];

      expect(line.unitsPerPack).toBe(24);
      expect(line.expectedUnits).toBe(120); // 10 packs de 12 = 120 unités
      expect(line.countedUnits).toBe(116); // 4 × 24 + 20
      expect(line.deltaUnits).toBe(-4); // compté − attendu
    });
  });



  // ── Stock de départ du post-event : repli scopé et tracé (BUG-241) ──────────

  describe('getPreEventInventory — provenance du stock de départ (BUG-241)', () => {
    const target = { id: 'event-N', eventDate: new Date('2026-07-20T18:00:00Z') };

    it("comptage d'avant-match du MÊME event : source 'pre-event'", async () => {
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.id ? target : null),
      );
      mockPrisma.inventorySnapshot.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.kind === 'pre-event'
            ? makeSnapshot({ id: 'snap-pre', eventId: 'event-N', kind: 'pre-event' })
            : null,
        ),
      );

      const result: any = await service.getPreEventInventory('space-1', 'event-N', 'tenant-1');

      expect(result.source).toBe('pre-event');
      expect(result.id).toBe('snap-pre');
    });

    it('sans pre-event : repli sur le post-event du match PRÉCÉDENT, tracé', async () => {
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) => {
        if (where?.id) return Promise.resolve(target);
        if (where?.eventDate?.lt) return Promise.resolve({ id: 'event-N-1', name: 'Match précédent' });
        return Promise.resolve(null);
      });
      mockPrisma.inventorySnapshot.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.kind === 'post-event' && where?.eventId === 'event-N-1'
            ? makeSnapshot({ id: 'snap-prev', eventId: 'event-N-1', kind: 'post-event' })
            : null,
        ),
      );

      const result: any = await service.getPreEventInventory('space-1', 'event-N', 'tenant-1');

      expect(result.source).toBe('previous-post-event');
      expect(result.id).toBe('snap-prev');
      expect(result.previousEvent).toEqual({ id: 'event-N-1', name: 'Match précédent' });
    });

    it('ne pioche PLUS un snapshot quelconque du space (bascule silencieuse interdite)', async () => {
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.id ? target : null),
      );
      // Ni pre-event de N, ni post-event du match précédent → null, et surtout
      // pas « le dernier snapshot du space avant le jour du match ».
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);

      expect(await service.getPreEventInventory('space-1', 'event-N', 'tenant-1')).toBeNull();
    });
  });

  // ── Contexte de fabrication archivé (BUG-238) ───────────────────────────────

  describe('createPostEventReconciliation — meta', () => {
    it('archive la provenance du stock de départ et les ventes non rattachées', async () => {
      mockPrisma.event.findFirst.mockResolvedValue({ id: 'event-1', name: 'Match' });
      mockPrisma.stockReconciliation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'reco-1', ...data }),
      );

      await service.createPostEventReconciliation(
        'space-1',
        {
          eventId: 'event-1',
          lines: [],
          preEventSource: 'previous-post-event',
          salesUnjoined: { shopNames: ['Buvette Nord'], itemNames: [], units: 42 },
          countedProgress: [80, 128],
        } as any,
        'tenant-1',
      );

      const { data } = mockPrisma.stockReconciliation.create.mock.calls[0][0];
      expect(data.meta).toEqual({
        baseline: { source: 'previous-post-event' },
        salesUnjoined: { shopNames: ['Buvette Nord'], itemNames: [], units: 42 },
        countedProgress: [80, 128],
        // Q35/explosion des ventes (develop 4e0c5fa) : provenance des ventes
        // archivée — null quand le client ne l'a pas fournie.
        salesSource: null,
      });
    });
  });
});
