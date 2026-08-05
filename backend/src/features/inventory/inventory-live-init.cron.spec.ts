import { Test, TestingModule } from '@nestjs/testing';
import { InventoryLiveInitCronService } from './inventory-live-init.cron';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('InventoryLiveInitCronService', () => {
  let cron: InventoryLiveInitCronService;
  const mockInventoryService = { autoInitLiveStockFromPreEventInventory: jest.fn().mockResolvedValue({ ok: true, lineCount: 1 }) };
  const mockPrisma = { event: { findMany: jest.fn().mockResolvedValue([]) } };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.event.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryLiveInitCronService,
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    cron = module.get<InventoryLiveInitCronService>(InventoryLiveInitCronService);
    cron.onModuleInit();
  });

  it("appelle l'auto-init pour un event dont l'ouverture des portes (eventStartDate) est passée", async () => {
    const now = new Date();
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'event-1',
        tenantId: 'tenant-1',
        spaceId: 'space-1',
        name: 'Match A',
        eventDate: new Date(now.getTime() - 60 * 60 * 1000),
        eventStartDate: new Date(now.getTime() - 30 * 60 * 1000), // portes ouvertes il y a 30 min
        eventEndDate: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      },
    ]);

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockInventoryService.autoInitLiveStockFromPreEventInventory).toHaveBeenCalledWith('space-1', 'event-1', 'Match A', 'tenant-1');
  });

  it("ignore un event dont l'ouverture des portes n'est pas encore atteinte", async () => {
    const now = new Date();
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'event-1',
        tenantId: 'tenant-1',
        spaceId: 'space-1',
        name: 'Match A',
        eventDate: new Date(now.getTime() + 60 * 60 * 1000),
        eventStartDate: new Date(now.getTime() + 60 * 60 * 1000), // dans 1h
        eventEndDate: new Date(now.getTime() + 4 * 60 * 60 * 1000),
      },
    ]);

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockInventoryService.autoInitLiveStockFromPreEventInventory).not.toHaveBeenCalled();
  });

  it('ignore un event terminé depuis plus de la marge de grâce (3h)', async () => {
    const now = new Date();
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'event-1',
        tenantId: 'tenant-1',
        spaceId: 'space-1',
        name: 'Match A',
        eventDate: new Date(now.getTime() - 10 * 60 * 60 * 1000),
        eventStartDate: new Date(now.getTime() - 10 * 60 * 60 * 1000),
        eventEndDate: new Date(now.getTime() - 5 * 60 * 60 * 1000), // fini il y a 5h > 3h de grâce
      },
    ]);

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockInventoryService.autoInitLiveStockFromPreEventInventory).not.toHaveBeenCalled();
  });

  it("continue sur les autres events si l'un d'eux échoue", async () => {
    const now = new Date();
    mockPrisma.event.findMany.mockResolvedValue([
      { id: 'event-1', tenantId: 'tenant-1', spaceId: 'space-1', name: 'A', eventDate: now, eventStartDate: new Date(now.getTime() - 1000), eventEndDate: new Date(now.getTime() + 1000) },
      { id: 'event-2', tenantId: 'tenant-1', spaceId: 'space-2', name: 'B', eventDate: now, eventStartDate: new Date(now.getTime() - 1000), eventEndDate: new Date(now.getTime() + 1000) },
    ]);
    mockInventoryService.autoInitLiveStockFromPreEventInventory
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: true, lineCount: 1 });

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockInventoryService.autoInitLiveStockFromPreEventInventory).toHaveBeenCalledTimes(2);
  });

  it("ne fait rien quand désactivé via INVENTORY_LIVE_INIT_CRON_ENABLED=false", async () => {
    const prev = process.env.INVENTORY_LIVE_INIT_CRON_ENABLED;
    process.env.INVENTORY_LIVE_INIT_CRON_ENABLED = 'false';
    cron.onModuleInit();

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockPrisma.event.findMany).not.toHaveBeenCalled();
    process.env.INVENTORY_LIVE_INIT_CRON_ENABLED = prev;
  });
});
