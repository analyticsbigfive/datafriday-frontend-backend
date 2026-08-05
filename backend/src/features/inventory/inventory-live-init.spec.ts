import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { LogisticsService } from '../logistics/logistics.service';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * `InventoryService.autoInitLiveStockFromPreEventInventory` — orchestration
 * isolée (LogisticsService mocké, sa propre suite couvre `reset()` en détail
 * dans logistics.service.spec.ts). Déclenché par `InventoryLiveInitCronService`
 * (11_LIVE.md §15) — remplace le bouton manuel « Initialiser depuis l'inventaire
 * pré-événement », retiré à la demande de l'utilisateur (tout doit être
 * automatique, 2026-08-05).
 */
describe('InventoryService.autoInitLiveStockFromPreEventInventory', () => {
  let service: InventoryService;

  const mockLogistics = { reset: jest.fn().mockResolvedValue({}) };

  const mockPrisma = {
    space: { findFirst: jest.fn().mockResolvedValue({ id: 'space-1' }) },
    event: { findFirst: jest.fn().mockResolvedValue({ id: 'event-1', eventDate: new Date('2026-08-05T18:00:00Z') }) },
    inventorySnapshot: { findFirst: jest.fn() },
    menuItem: { findMany: jest.fn().mockResolvedValue([]) },
    marketPrice: { findMany: jest.fn().mockResolvedValue([]) },
    kvStore: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.space.findFirst.mockResolvedValue({ id: 'space-1' });
    mockPrisma.event.findFirst.mockResolvedValue({ id: 'event-1', eventDate: new Date('2026-08-05T18:00:00Z') });
    mockPrisma.kvStore.findUnique.mockResolvedValue(null);
    mockLogistics.reset.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: LogisticsService, useValue: mockLogistics },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<InventoryService>(InventoryService);
  });

  it('résout MenuItem + MarketPrice, dispatche reset(), puis pose le marqueur KvStore', async () => {
    mockPrisma.inventorySnapshot.findFirst.mockResolvedValue({
      id: 'snap-1',
      eventId: 'event-1',
      createdAt: new Date('2026-08-05T09:00:00Z'),
      inventoryCounts: { 'shop-1': { 'mi-cookie': { packedUnits: 2, looseUnits: 0 }, 'mp-badiane': { packedUnits: 0, looseUnits: 3 } } },
    });
    mockPrisma.menuItem.findMany.mockResolvedValue([{ id: 'mi-cookie', name: 'Cookie' }]);
    mockPrisma.marketPrice.findMany.mockResolvedValue([{ id: 'mp-badiane', itemName: 'Badiane' }]);

    const result = await service.autoInitLiveStockFromPreEventInventory('space-1', 'event-1', 'Match A', 'tenant-1');

    expect(result).toEqual({ ok: true, lineCount: 2 });
    expect(mockLogistics.reset).toHaveBeenCalledWith(
      'space-1',
      {
        eventId: 'event-1',
        eventName: 'Match A',
        lines: expect.arrayContaining([
          { elementId: 'shop-1', itemKey: 'Cookie', countedPacked: 2, countedLoose: 0 },
          { elementId: 'shop-1', itemKey: 'Badiane', countedPacked: 0, countedLoose: 3 },
        ]),
      },
      'tenant-1',
      'system-live-door-opening',
    );
    expect(mockPrisma.kvStore.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'tenant-1', key: 'live-pre-event-init:space-1:event-1' }),
    });
  });

  it('ne fait rien si déjà initialisé (marqueur KvStore présent) — idempotent', async () => {
    mockPrisma.kvStore.findUnique.mockResolvedValue({ id: 'kv-1', key: 'live-pre-event-init:space-1:event-1', value: {} });

    const result = await service.autoInitLiveStockFromPreEventInventory('space-1', 'event-1', 'Match A', 'tenant-1');

    expect(result).toEqual({ ok: false, reason: 'already-initialized' });
    expect(mockLogistics.reset).not.toHaveBeenCalled();
    expect(mockPrisma.inventorySnapshot.findFirst).not.toHaveBeenCalled();
  });

  it("ne pose PAS le marqueur si aucun comptage pré-événement n'existe encore — retentera au prochain tick", async () => {
    mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);
    // 1er appel (getPreEventInventory) : l'event courant. 2e appel : repli previousEvent, aucun.
    mockPrisma.event.findFirst
      .mockResolvedValueOnce({ id: 'event-1', eventDate: new Date('2026-08-05T18:00:00Z') })
      .mockResolvedValueOnce(null);

    const result = await service.autoInitLiveStockFromPreEventInventory('space-1', 'event-1', 'Match A', 'tenant-1');

    expect(result).toEqual({ ok: false, reason: 'no-pre-event-inventory' });
    expect(mockLogistics.reset).not.toHaveBeenCalled();
    expect(mockPrisma.kvStore.create).not.toHaveBeenCalled();
  });

  it('écarte les lignes orphelines (ni MenuItem ni MarketPrice) et ne pose pas le marqueur si tout est orphelin', async () => {
    mockPrisma.inventorySnapshot.findFirst.mockResolvedValue({
      id: 'snap-1',
      eventId: 'event-1',
      createdAt: new Date('2026-08-05T09:00:00Z'),
      inventoryCounts: { 'shop-1': { 'unknown-id': { packedUnits: 1, looseUnits: 0 } } },
    });

    const result = await service.autoInitLiveStockFromPreEventInventory('space-1', 'event-1', 'Match A', 'tenant-1');

    expect(result).toEqual({ ok: false, reason: 'no-requirements' });
    expect(mockLogistics.reset).not.toHaveBeenCalled();
    expect(mockPrisma.kvStore.create).not.toHaveBeenCalled();
  });
});
