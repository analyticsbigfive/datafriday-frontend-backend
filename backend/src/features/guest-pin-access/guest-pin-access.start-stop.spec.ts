import { GuestPinAccessService } from './guest-pin-access.service';

/**
 * Bandeau et lignes PDV, Démarrage / Reprise et Arrêt (document Bertrand « Pre et Post
 * event Inventory cycle », 2026-10-06, pages 3 à 6) : démarrer une phase arrête
 * l'autre, l'Arrêt ne pousse rien vers la Logistique et garde le PIN, un PDV peut être
 * rouvert seul alors que sa fenêtre est arrêtée.
 */
describe('GuestPinAccessService : Démarrage / Reprise et Arrêt', () => {
  const user = { id: 'user-1', tenantId: 'tenant-1' } as any;
  const target = { spaceId: 'space-1', eventId: 'event-2', phase: 'pre-event' as const };
  let prisma: any;
  let service: GuestPinAccessService;
  let closeSpy: jest.SpyInstance;
  let assignPin: jest.SpyInstance;

  const window = (over: Record<string, any> = {}) => ({
    id: 'win-pre',
    tenantId: 'tenant-1',
    spaceId: 'space-1',
    eventId: 'event-2',
    phase: 'pre-event',
    status: 'open',
    pinLookupHash: 'hash',
    pinCiphertext: 'cipher',
    ...over,
  });

  beforeEach(() => {
    prisma = {
      inventoryWindow: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(window()),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'win-new', ...data })),
      },
      guestPinAccess: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      kvStore: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new GuestPinAccessService(
      prisma,
      {} as any,
      audit as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any, // postEventDraft
      {} as any, // spaceMenus
      {} as any, // storageTypes
    );
    jest.spyOn(service as any, 'assertSpaceAccess').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'assertPeriodOpen').mockResolvedValue(undefined);
    jest.spyOn(service, 'getStatusBoard').mockResolvedValue([] as any);
    closeSpy = jest.spyOn(service, 'closeWindowRecord').mockResolvedValue({ ok: false, reason: 'not-attempted' });
    assignPin = jest.spyOn(service as any, 'assignPin').mockResolvedValue('123456');
  });

  it("▶ du bandeau : arrête l'autre phase sans push, rouvre la fenêtre et tous ses PDV", async () => {
    const post = window({ id: 'win-post', phase: 'post-event', eventId: 'event-1' });
    prisma.inventoryWindow.findMany.mockImplementation(async ({ where }: any) =>
      where.phase === 'post-event' ? [post] : [],
    );

    await service.startWindow(target, user);

    expect(closeSpy).toHaveBeenCalledWith(post, 'user-1', { pushToLogistic: false, reason: 'phase-switch' });
    expect(prisma.inventoryWindow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: 'open' }) }),
    );
    expect(prisma.guestPinAccess.updateMany).toHaveBeenCalledWith({
      where: { windowId: 'win-pre', status: { not: 'active' } },
      data: { status: 'active', revokedAt: null, revokedBy: null },
    });
    // PIN déjà posé : conservé.
    expect(assignPin).not.toHaveBeenCalled();
  });

  it('▶ du bandeau sur une fenêtre sans PIN : le PIN est généré', async () => {
    prisma.inventoryWindow.upsert.mockResolvedValue(window({ pinLookupHash: null, pinCiphertext: null }));
    await service.startWindow(target, user);
    expect(assignPin).toHaveBeenCalledWith('win-pre', 'tenant-1', 'user-1');
  });

  it('■ du bandeau : clôture sans push Logistic', async () => {
    const open = window();
    prisma.inventoryWindow.findUnique.mockResolvedValue(open);
    await service.stopWindow(target, user);
    expect(closeSpy).toHaveBeenCalledWith(open, 'user-1', { pushToLogistic: false, reason: 'manual-stop' });
  });

  it('■ du bandeau sur une fenêtre déjà arrêtée : les PDV rouverts un par un sont refermés', async () => {
    prisma.inventoryWindow.findUnique.mockResolvedValue(window({ status: 'closed' }));
    await service.stopWindow(target, user);
    expect(closeSpy).not.toHaveBeenCalled();
    expect(prisma.guestPinAccess.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { windowId: { in: ['win-pre'] }, status: 'active' },
        data: expect.objectContaining({ status: 'revoked', revokedBy: 'user-1' }),
      }),
    );
  });

  it("▶ d'un PDV sans fenêtre : fenêtre créée arrêtée avec PIN, PDV ouvert, autre phase coupée pour ce PDV", async () => {
    prisma.inventoryWindow.findMany.mockResolvedValue([{ id: 'win-post' }]);
    await service.startElement({ ...target, elementId: 'shop-1' }, user);

    expect(prisma.inventoryWindow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'closed', phase: 'pre-event' }),
    });
    expect(assignPin).toHaveBeenCalledWith('win-new', 'tenant-1', 'user-1');
    const calls = prisma.guestPinAccess.upsert.mock.calls.map(([arg]: any) => [
      arg.where.uniq_guest_pin_access_per_element.windowId,
      arg.update.status,
    ]);
    expect(calls).toEqual([
      ['win-post', 'revoked'],
      ['win-new', 'active'],
    ]);
    // Rouvert à la main en pre-event : plus jamais coupé par ses ventes.
    expect(prisma.kvStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uniq_kv_store: { tenantId: 'tenant-1', key: 'inventory-cycle:pre-sale:win-new:shop-1' } },
      }),
    );
  });

  it("■ pre-event d'un PDV après les portes : il retrouve son accès post-event", async () => {
    prisma.inventoryWindow.findUnique.mockImplementation(async ({ where }: any) =>
      where.uniq_inventory_window.phase === 'post-event'
        ? { ...window(), id: 'win-post', phase: 'post-event', status: 'open' }
        : window(),
    );
    await service.stopElement({ ...target, elementId: 'shop-1' }, user);
    const calls = prisma.guestPinAccess.upsert.mock.calls.map(([arg]: any) => [
      arg.where.uniq_guest_pin_access_per_element.windowId,
      arg.update.status,
    ]);
    expect(calls).toEqual([
      ['win-pre', 'revoked'],
      ['win-post', 'active'],
    ]);
  });

  it("■ d'un PDV : sa ligne passe à 'revoked'", async () => {
    prisma.inventoryWindow.findUnique.mockResolvedValue(window());
    await service.stopElement({ ...target, elementId: 'shop-1' }, user);
    expect(prisma.guestPinAccess.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uniq_guest_pin_access_per_element: { windowId: 'win-pre', elementId: 'shop-1' } },
        update: expect.objectContaining({ status: 'revoked', revokedBy: 'user-1' }),
      }),
    );
  });
});
