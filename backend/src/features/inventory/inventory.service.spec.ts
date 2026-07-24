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
        { provide: LogisticsService, useValue: new LogisticsService(mockPrisma as any) },
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

  describe('getPreEventBaseline (attendus normalisés, BUG-232)', () => {
    const previousEvent = { id: 'event-prev', name: 'Concert précédent' };
    const targetEvent = { id: 'event-next' };

    /** event.findFirst sert 2 lookups distincts : l'event cible (where.id) et
     *  l'event précédent (where.eventDate). Dispatch par forme du where. */
    function wireEvents() {
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) => {
        if (where?.id) return Promise.resolve(targetEvent);
        if (where?.eventDate) return Promise.resolve(previousEvent);
        return Promise.resolve(null);
      });
    }

    function wireBaselineSnapshot(inventoryCounts: any) {
      mockPrisma.inventorySnapshot.findFirst.mockImplementation(({ where }: any) => {
        if (where?.kind === 'post-event') {
          return Promise.resolve(makeSnapshot({ eventId: previousEvent.id, kind: 'post-event', inventoryCounts }));
        }
        return Promise.resolve(null);
      });
    }

    it('repro barre chocolatée : un retrait de vrac casse un pack au lieu de produire un négatif', async () => {
      wireEvents();
      // Post-event précédent : 3 packs, 2 en vrac. unitsPerPack = 5 (MenuItem).
      wireBaselineSnapshot({ 'shop-1': { 'item-choco': { packedUnits: 3, looseUnits: 2 } } });
      mockPrisma.stockMovement.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Barre chocolatée', menuItemId: 'item-choco', packedDelta: 0, looseDelta: -3 },
      ]);
      mockPrisma.menuItem.findFirst.mockResolvedValue({ inventoryNumberOfUnits: 5 });

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      // Somme brute (buggée) : loose 2-3 = -1. Normalisé : emprunt d'1 pack →
      // packed 2, loose -1+5 = 4. Jamais de négatif.
      expect(result.expected['shop-1']['item-choco']).toEqual({ packed: 2, loose: 4, units: null, unitsPerPack: null });
      expect(result.baseline).toEqual({ 'shop-1': { 'item-choco': { packedUnits: 3, looseUnits: 2 } } });
      expect(result.unjoinedItemKeys).toEqual([]);
    });

    it('rejeu séquentiel ≠ somme finale : un clamp intermédiaire ne réapparaît pas', async () => {
      wireEvents();
      // 0 pack, 2 vrac, pas d'unitsPerPack résoluble → pas de casse possible.
      wireBaselineSnapshot({ 'shop-1': { 'item-x': { packedUnits: 0, looseUnits: 2 } } });
      mockPrisma.stockMovement.findMany.mockResolvedValue([
        // A : retrait -4 → raw -2, clampé à 0 (comme la Logistique non-stricte).
        { elementId: 'shop-1', itemKey: 'X', menuItemId: 'item-x', packedDelta: 0, looseDelta: -4 },
        // B : ajout +3 → 3. Somme brute (buggée) : 2-4+3 = 1.
        { elementId: 'shop-1', itemKey: 'X', menuItemId: 'item-x', packedDelta: 0, looseDelta: 3 },
      ]);

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      expect(result.expected['shop-1']['item-x']).toEqual({ packed: 0, loose: 3, units: null, unitsPerPack: null });
    });

    it('mouvement non joignable : ignoré mais SURFACÉ dans unjoinedItemKeys', async () => {
      wireEvents();
      wireBaselineSnapshot({ 'shop-1': { 'item-beer': { packedUnits: 1, looseUnits: 0 } } });
      mockPrisma.stockMovement.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Nom Inconnu Total', menuItemId: null, packedDelta: 99, looseDelta: 9 },
      ]);
      mockPrisma.menuItem.findMany.mockResolvedValue([]); // aucun nom ne matche

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      expect(result.expected['shop-1']['item-beer']).toEqual({ packed: 1, loose: 0, units: null, unitsPerPack: null });
      expect(result.unjoinedItemKeys).toEqual(['Nom Inconnu Total']);
    });

    it('test théorique combiné : Barre chocolatée + Budweiser fût — attendus alignés sur la Logistique', async () => {
      wireEvents();
      // Post-event précédent : chocolat 3 boîtes + 2 vrac ; Budweiser 3 fûts + 0 vrac.
      wireBaselineSnapshot({
        'shop-1': {
          'item-choco': { packedUnits: 3, looseUnits: 2 },
          'item-bud': { packedUnits: 3, looseUnits: 0 },
        },
      });
      mockPrisma.stockMovement.findMany.mockResolvedValue([
        // Chocolat : retrait de 3 unités en vrac (upp 5/boîte via MenuItem).
        { elementId: 'shop-1', itemKey: 'Barre chocolatée', menuItemId: 'item-choco', packedDelta: 0, looseDelta: -3 },
        // Budweiser : tirage d'un demi-fût (upp 1 via MarketPrice — fût = unité).
        { elementId: 'shop-1', itemKey: 'Budweiser Fût 30L', menuItemId: 'item-bud', packedDelta: 0, looseDelta: -0.5 },
        // Livraison saisie sous le nom court « Budweiser Fût » (le référentiel
        // porte « Budweiser Fût 30L ») : sans menuItemId, la jointure par nom
        // échoue — cas réel de saisie Logistic abrégée.
        { elementId: 'shop-1', itemKey: 'Budweiser Fût', menuItemId: null, packedDelta: 1, looseDelta: 0 },
      ]);
      mockPrisma.marketPrice.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.itemName?.equals === 'Budweiser Fût 30L' ? { packedUnits: 1 } : null),
      );
      mockPrisma.menuItem.findFirst.mockResolvedValue({ inventoryNumberOfUnits: 5 }); // chocolat : 5/boîte
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-choco', name: 'Barre chocolatée' },
        { id: 'item-bud', name: 'Budweiser Fût 30L' },
      ]);

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      // Chocolat — somme brute (bug d'origine) : 3 boîtes / vrac **-1**.
      // Normalisé : vrac 2-3 = -1 → casse 1 boîte (5/boîte) → 2 boîtes / 4 vrac.
      expect(result.expected['shop-1']['item-choco']).toEqual({ packed: 2, loose: 4, units: null, unitsPerPack: null });
      // Budweiser — somme brute (bug) : 3 fûts / vrac **-0.5**.
      // Normalisé : casse 1 fût → 2 fûts / 0.5 vrac = « 2 unités, 0,5 en vrac »
      // affichés par la Logistique.
      expect(result.expected['shop-1']['item-bud']).toEqual({ packed: 2, loose: 0.5, units: null, unitsPerPack: null });
      // La livraison saisie « Budweiser Fût » (référentiel : « Budweiser Fût 30L »)
      // est ignorée mais SURFACÉE — cause n°2 du sous-comptage : l'attendu packed
      // reste 2 au lieu de 3, désormais visible en log au lieu d'être avalé.
      expect(result.unjoinedItemKeys).toEqual(['Budweiser Fût']);
    });

    it('sans snapshot post-event précédent : expected null, jamais de 0 fabriqué', async () => {
      wireEvents();
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      expect(result.baseline).toBeNull();
      expect(result.expected).toBeNull();
      expect(result.movements).toEqual([]);
    });

    it('createPreEventReconciliation : les lignes portent les MÊMES attendus normalisés que le GET', async () => {
      wireEvents();
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) => {
        if (where?.id) return Promise.resolve({ id: 'event-next', name: 'Prochain concert' });
        if (where?.eventDate) return Promise.resolve(previousEvent);
        return Promise.resolve(null);
      });
      wireBaselineSnapshot({ 'shop-1': { 'item-choco': { packedUnits: 3, looseUnits: 2 } } });
      mockPrisma.stockMovement.findMany.mockResolvedValue([
        { elementId: 'shop-1', itemKey: 'Barre chocolatée', menuItemId: 'item-choco', packedDelta: 0, looseDelta: -3 },
      ]);
      mockPrisma.menuItem.findFirst.mockResolvedValue({ inventoryNumberOfUnits: 5 });
      // Compté (getBySpaceAndEvent) : via counts granulaires.
      mockPrisma.inventoryCount.findMany.mockResolvedValue([
        makeCount({ eventId: 'event-next', shopId: 'shop-1', itemId: 'item-choco', packedUnits: 2, looseUnits: 3 }),
      ]);
      mockPrisma.menuItem.findMany.mockResolvedValue([{ id: 'item-choco', name: 'Barre chocolatée' }]);
      // Filtre orphelins (ajout postérieur à cette spec) : l'elementId doit
      // résoudre un SpaceElement courant, sinon la ligne est exclue du document.
      mockPrisma.spaceElement.findMany.mockResolvedValue([{ id: 'shop-1', name: 'Buvette 1' }]);
      mockPrisma.stockReconciliation.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'reco-1', ...data }));

      const reco = await service.createPreEventReconciliation('space-1', 'event-next', 'tenant-1', 'user-1');

      const line = (reco.lines as any[]).find((l: any) => l.elementId === 'shop-1' && l.itemKey === 'item-choco');
      // Attendus normalisés (packed 2 / loose 4), pas la somme brute (3 / -1).
      expect(line.expectedPacked).toBe(2);
      expect(line.expectedLoose).toBe(4);
      expect(line.countedPacked).toBe(2);
      expect(line.countedLoose).toBe(3);
      expect(line.deltaPacked).toBe(0);
      expect(line.deltaLoose).toBe(-1);
      expect(reco.kind).toBe('pre-event');
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
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) => {
        if (where?.id) return Promise.resolve({ id: 'event-next', name: 'Prochain match' });
        if (where?.eventDate) return Promise.resolve({ id: 'event-prev', name: 'Match précédent' });
        return Promise.resolve(null);
      });
      mockPrisma.inventorySnapshot.findFirst.mockImplementation(({ where }: any) => {
        if (where?.kind === 'post-event') {
          return Promise.resolve(
            makeSnapshot({
              eventId: 'event-prev',
              kind: 'post-event',
              inventoryCounts: { 'shop-1': { 'item-choco': { packedUnits: 3, looseUnits: 2 } } },
            }),
          );
        }
        return Promise.resolve(null);
      });
      mockPrisma.inventoryCount.findMany.mockResolvedValue([
        makeCount({ eventId: 'event-next', shopId: 'shop-1', itemId: 'item-choco', packedUnits: 2, looseUnits: 3 }),
      ]);
      mockPrisma.menuItem.findMany.mockResolvedValue([{ id: 'item-choco', name: 'Barre chocolatée' }]);
      mockPrisma.spaceElement.findMany.mockResolvedValue([{ id: 'shop-1', name: 'Buvette 1' }]);
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

  describe('computeExpected — conditionnement inventaire vs logistique (BUG-239)', () => {
    const previousEvent = { id: 'event-prev', name: 'Match précédent' };

    beforeEach(() => {
      mockPrisma.event.findFirst.mockImplementation(({ where }: any) => {
        if (where?.id) return Promise.resolve({ id: 'event-next', name: 'Match cible' });
        if (where?.eventDate) return Promise.resolve(previousEvent);
        return Promise.resolve(null);
      });
      mockPrisma.inventorySnapshot.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.kind === 'post-event'
            ? makeSnapshot({
                eventId: previousEvent.id,
                kind: 'post-event',
                // 5 cartons de 24 = 120 unités comptées à l'écran.
                inventoryCounts: { 'shop-1': { 'item-coke': { packedUnits: 5, looseUnits: 0 } } },
              })
            : null,
        ),
      );
      // Référentiel INVENTAIRE : carton de 24 (fiche menu item).
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-coke', name: 'Coca-Cola CAN 33cl', inventoryNumberOfUnits: 24 },
      ]);
      // Référentiel LOGISTIQUE : pack de 12 (MarketPrice) — priorité inverse.
      mockPrisma.marketPrice.findFirst.mockResolvedValue({ packedUnits: 12 });
    });

    it('un mouvement saisi en packs de 12 sur une baseline comptée en cartons de 24', async () => {
      mockPrisma.stockMovement.findMany.mockResolvedValue([
        {
          elementId: 'shop-1',
          itemKey: 'Coca-Cola CAN 33cl',
          menuItemId: 'item-coke',
          packedDelta: 1,
          looseDelta: 0,
        },
      ]);

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      // 120 + (1 × 12) = 132 unités, re-découpées dans l'unité de l'ÉCRAN (24) :
      // 5 cartons + 12 en vrac. L'ancien calcul additionnait des packs de tailles
      // différentes (6 « packs » = 144 ou 72 selon le diviseur d'affichage).
      expect(result.expected['shop-1']['item-coke']).toEqual({
        packed: 5,
        loose: 12,
        units: 132,
        unitsPerPack: 24,
      });
    });

    it('le retrait qui dépasse le vrac emprunte sur un carton de 24, pas de 12', async () => {
      mockPrisma.stockMovement.findMany.mockResolvedValue([
        {
          elementId: 'shop-1',
          itemKey: 'Coca-Cola CAN 33cl',
          menuItemId: 'item-coke',
          packedDelta: 0,
          looseDelta: -6,
        },
      ]);

      const result = await service.getPreEventBaseline('space-1', 'event-next', 'tenant-1');

      // 120 − 6 = 114 = 4 cartons de 24 + 18.
      expect(result.expected['shop-1']['item-coke']).toEqual({
        packed: 4,
        loose: 18,
        units: 114,
        unitsPerPack: 24,
      });
    });

    it('les lignes de réconciliation pre-event portent le conditionnement du calcul', async () => {
      mockPrisma.stockMovement.findMany.mockResolvedValue([]);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([]);
      mockPrisma.inventorySnapshot.findFirst.mockImplementation(({ where }: any) => {
        if (where?.kind === 'post-event') {
          return Promise.resolve(
            makeSnapshot({
              eventId: previousEvent.id,
              kind: 'post-event',
              inventoryCounts: { 'shop-1': { 'item-coke': { packedUnits: 5, looseUnits: 0 } } },
            }),
          );
        }
        if (where?.eventId === 'event-next' && !where?.kind) {
          // Comptage pre-event en cours (fusion `getBySpaceAndEvent`).
          return Promise.resolve(
            makeSnapshot({
              eventId: 'event-next',
              inventoryCounts: { 'shop-1': { 'item-coke': { packedUnits: 4, looseUnits: 20 } } },
            }),
          );
        }
        return Promise.resolve(null);
      });
      mockPrisma.spaceElement.findMany.mockResolvedValue([{ id: 'shop-1', name: 'Buvette' }]);
      mockPrisma.stockReconciliation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'reco-1', ...data }),
      );

      const doc: any = await service.createPreEventReconciliation('space-1', 'event-next', 'tenant-1');
      const line = doc.lines[0];

      expect(line.unitsPerPack).toBe(24);
      expect(line.expectedUnits).toBe(120); // 5 × 24
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
      });
    });
  });
});
