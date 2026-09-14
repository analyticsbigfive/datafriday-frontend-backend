import { Test, TestingModule } from '@nestjs/testing';
import { InventoryLiveInitCronService } from './inventory-live-init.cron';
import { PreEventInventoryFlowService } from './pre-event-inventory-flow.service';
import { PrismaService } from '../../core/database/prisma.service';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe('InventoryLiveInitCronService', () => {
  let cron: InventoryLiveInitCronService;
  const mockFlow = {
    doorsOpenAt: jest.fn((e: any) => e.eventStartDate ?? e.eventDate),
    editDeadline: jest.fn(
      (e: any) => new Date((e.eventStartDate ?? e.eventDate).getTime() + 30 * MIN),
    ),
    runDoorsOpen: jest.fn().mockResolvedValue({ ok: true, lineCount: 1 }),
    flushDirty: jest.fn().mockResolvedValue({ ok: false, reason: 'clean' }),
  };
  const mockPrisma = { event: { findMany: jest.fn().mockResolvedValue([]) } };

  const event = (overrides: Record<string, unknown> = {}) => {
    const now = new Date();
    return {
      id: 'event-1',
      tenantId: 'tenant-1',
      spaceId: 'space-1',
      name: 'Match A',
      eventDate: new Date(now.getTime() - HOUR),
      eventStartDate: new Date(now.getTime() - 10 * MIN),
      eventEndDate: new Date(now.getTime() + 2 * HOUR),
      ...overrides,
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.event.findMany.mockResolvedValue([]);
    mockFlow.runDoorsOpen.mockResolvedValue({ ok: true, lineCount: 1 });
    mockFlow.flushDirty.mockResolvedValue({ ok: false, reason: 'clean' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryLiveInitCronService,
        { provide: PreEventInventoryFlowService, useValue: mockFlow },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    cron = module.get<InventoryLiveInitCronService>(InventoryLiveInitCronService);
    cron.onModuleInit();
  });

  it('lance le passage portes ouvertes puis le flush dirty pour un event ouvert depuis 10 min', async () => {
    mockPrisma.event.findMany.mockResolvedValue([event()]);

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockFlow.runDoorsOpen).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-1', spaceId: 'space-1', tenantId: 'tenant-1' }),
    );
    expect(mockFlow.flushDirty).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-1' }));
  });

  it('retombe sur eventDate quand eventStartDate est absent', async () => {
    const now = new Date();
    mockPrisma.event.findMany.mockResolvedValue([
      event({ eventStartDate: null, eventDate: new Date(now.getTime() - 5 * MIN) }),
    ]);

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockFlow.runDoorsOpen).toHaveBeenCalledTimes(1);
  });

  it("ignore un event dont l'ouverture des portes n'est pas encore atteinte", async () => {
    const now = new Date();
    mockPrisma.event.findMany.mockResolvedValue([
      event({
        eventDate: new Date(now.getTime() + HOUR),
        eventStartDate: new Date(now.getTime() + HOUR),
        eventEndDate: new Date(now.getTime() + 4 * HOUR),
      }),
    ]);

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockFlow.runDoorsOpen).not.toHaveBeenCalled();
    expect(mockFlow.flushDirty).not.toHaveBeenCalled();
  });

  it('ignore un event terminé depuis plus de la marge de grâce (3h)', async () => {
    const now = new Date();
    mockPrisma.event.findMany.mockResolvedValue([
      event({
        eventDate: new Date(now.getTime() - 10 * HOUR),
        eventStartDate: new Date(now.getTime() - 10 * HOUR),
        eventEndDate: new Date(now.getTime() - 5 * HOUR),
      }),
    ]);

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockFlow.runDoorsOpen).not.toHaveBeenCalled();
  });

  it('ne flushe plus le dirty passé la fenêtre des 30 min (+2 min de marge), mais garde le passage portes ouvertes', async () => {
    const now = new Date();
    mockPrisma.event.findMany.mockResolvedValue([
      event({ eventStartDate: new Date(now.getTime() - 45 * MIN) }),
    ]);

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockFlow.runDoorsOpen).toHaveBeenCalledTimes(1);
    expect(mockFlow.flushDirty).not.toHaveBeenCalled();
  });

  it("continue sur les autres events si l'un d'eux échoue", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      event({ id: 'event-1' }),
      event({ id: 'event-2', spaceId: 'space-2' }),
    ]);
    mockFlow.runDoorsOpen
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: true, lineCount: 1 });

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockFlow.runDoorsOpen).toHaveBeenCalledTimes(2);
    expect(mockFlow.flushDirty).toHaveBeenCalledTimes(2);
  });

  it('ne fait rien quand désactivé via INVENTORY_LIVE_INIT_CRON_ENABLED=false', async () => {
    const prev = process.env.INVENTORY_LIVE_INIT_CRON_ENABLED;
    process.env.INVENTORY_LIVE_INIT_CRON_ENABLED = 'false';
    cron.onModuleInit();

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockPrisma.event.findMany).not.toHaveBeenCalled();
    process.env.INVENTORY_LIVE_INIT_CRON_ENABLED = prev;
  });
});
