import { Test, TestingModule } from '@nestjs/testing';
import { InventoryLiveInitCronService } from './inventory-live-init.cron';
import { PreEventInventoryFlowService } from './pre-event-inventory-flow.service';
import { PrismaService } from '../../core/database/prisma.service';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/**
 * Le flux est mocké avec des dates portées par l'event de test (`_doorsOpenAt`,
 * `_windowEnd`) : la résolution réelle (sessions.doorsOpening + fuseau) est
 * testée dans pre-event-inventory-flow.service.spec et event-window.util.spec.
 */
describe('InventoryLiveInitCronService', () => {
  let cron: InventoryLiveInitCronService;
  const mockFlow = {
    doorsOpenAt: jest.fn((e: any) => e._doorsOpenAt ?? null),
    editDeadline: jest.fn((e: any) =>
      e._doorsOpenAt ? new Date(e._doorsOpenAt.getTime() + 30 * MIN) : null,
    ),
    eventWindowEnd: jest.fn((e: any) => e._windowEnd),
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
      eventStartDate: null,
      eventEndDate: null,
      eventEndTime: '23:00',
      sessions: '[{"doorsOpening":"19:00"}]',
      space: { timezone: 'Europe/Paris' },
      _doorsOpenAt: new Date(now.getTime() - 10 * MIN),
      _windowEnd: new Date(now.getTime() + 2 * HOUR),
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
      expect.objectContaining({
        id: 'event-1',
        spaceId: 'space-1',
        tenantId: 'tenant-1',
        timezone: 'Europe/Paris',
        sessions: '[{"doorsOpening":"19:00"}]',
      }),
      'system-doors-open',
      expect.any(Date),
    );
    expect(mockFlow.flushDirty).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-1' }));
  });

  it("charge le fuseau du space et les sessions (le flux en a besoin pour l'heure d'ouverture)", async () => {
    mockPrisma.event.findMany.mockResolvedValue([event()]);
    await cron.autoInitLiveStockForOpenEvents();
    expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          sessions: true,
          eventEndTime: true,
          space: { select: { timezone: true } },
        }),
      }),
    );
  });

  it("ignore un event SANS heure d'ouverture des portes (jamais de repli sur minuit)", async () => {
    mockPrisma.event.findMany.mockResolvedValue([event({ _doorsOpenAt: null, sessions: null })]);

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockFlow.runDoorsOpen).not.toHaveBeenCalled();
    expect(mockFlow.flushDirty).not.toHaveBeenCalled();
  });

  it("ignore un event dont l'ouverture des portes n'est pas encore atteinte", async () => {
    const now = new Date();
    mockPrisma.event.findMany.mockResolvedValue([
      event({
        _doorsOpenAt: new Date(now.getTime() + HOUR),
        _windowEnd: new Date(now.getTime() + 4 * HOUR),
      }),
    ]);

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockFlow.runDoorsOpen).not.toHaveBeenCalled();
    expect(mockFlow.flushDirty).not.toHaveBeenCalled();
  });

  it('ignore un event dont la fenêtre est finie depuis plus de la marge de grâce (3h)', async () => {
    const now = new Date();
    mockPrisma.event.findMany.mockResolvedValue([
      event({
        _doorsOpenAt: new Date(now.getTime() - 10 * HOUR),
        _windowEnd: new Date(now.getTime() - 5 * HOUR),
      }),
    ]);

    await cron.autoInitLiveStockForOpenEvents();

    expect(mockFlow.runDoorsOpen).not.toHaveBeenCalled();
  });

  it('ne flushe plus le dirty passé la fenêtre des 30 min (+2 min de marge), mais garde le passage portes ouvertes', async () => {
    const now = new Date();
    mockPrisma.event.findMany.mockResolvedValue([
      event({ _doorsOpenAt: new Date(now.getTime() - 45 * MIN) }),
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
