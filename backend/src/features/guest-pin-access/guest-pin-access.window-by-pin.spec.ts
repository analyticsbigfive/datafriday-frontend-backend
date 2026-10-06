import { createHmac } from 'crypto';
import { GuestPinAccessService } from './guest-pin-access.service';

/**
 * Pre-event ET post-event ouverts en même temps sur le même espace (post-event
 * démarré avant que Doors Open n'ait clôturé le pre-event) : c'est le PIN saisi
 * qui désigne la fenêtre, pas "la première fenêtre ouverte trouvée". Avant ce
 * correctif, le PIN post-event était comparé au hash pre-event et rejeté.
 */
describe('GuestPinAccessService : deux fenêtres ouvertes, le PIN désigne la fenêtre', () => {
  const SECRET = 'test-secret';
  const hash = (pin: string) => createHmac('sha256', SECRET).update(pin).digest('hex');
  const preWindow = {
    id: 'win-pre',
    tenantId: 'tenant-1',
    spaceId: 'space-1',
    eventId: 'event-pre',
    phase: 'pre-event',
    status: 'open',
    pinLookupHash: hash('111111'),
  };
  const postWindow = {
    id: 'win-post',
    tenantId: 'tenant-1',
    spaceId: 'space-1',
    eventId: 'event-post',
    phase: 'post-event',
    status: 'open',
    pinLookupHash: hash('222222'),
  };

  let prisma: any;
  let redis: any;
  let service: GuestPinAccessService;

  beforeEach(() => {
    prisma = {
      spaceElement: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'shop-1',
          name: 'Buvette D',
          floor: { config: { spaceId: 'space-1' } },
        }),
      },
      inventoryWindow: {
        findMany: jest.fn().mockImplementation(async () => [preWindow, postWindow]),
        // Simule le filtre Prisma `pinLookupHash: <hash>` sur les deux fenêtres ouvertes.
        findFirst: jest
          .fn()
          .mockImplementation(
            async ({ where }: any) =>
              [preWindow, postWindow].find((w) => w.pinLookupHash === where.pinLookupHash) ?? null,
          ),
      },
      guestPinAccess: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: `access-${data.windowId}`,
          ...data,
        })),
        update: jest
          .fn()
          .mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data })),
      },
      space: { findUnique: jest.fn().mockResolvedValue({ name: 'Stade' }) },
      event: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => ({ id: where.id })),
      },
    };
    redis = {
      get: jest.fn().mockResolvedValue(0),
      ttl: jest.fn().mockResolvedValue(0),
      set: jest.fn(),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn(),
      del: jest.fn(),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue(SECRET),
      get: jest.fn().mockReturnValue(SECRET),
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('token') };
    // Ordre du constructeur : prisma, redis, audit, inventoryService, preEventFlow,
    // menuItems, marketPrices, menuComponents, spaceAccess, configService, jwt.
    service = new GuestPinAccessService(
      prisma,
      redis,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      configService as any,
      jwt as any,
    );
  });

  it('le PIN post-event ouvre la fenêtre post-event même si le pre-event est encore ouvert', async () => {
    const result: any = await service.login('222222', 'device-1', '10.0.0.1', 'buvette-d');
    expect(result.state).toBe('ok');
    expect(prisma.guestPinAccess.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ windowId: 'win-post' }) }),
    );
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("le PIN pre-event continue d'ouvrir la fenêtre pre-event", async () => {
    const result: any = await service.login('111111', 'device-1', '10.0.0.1', 'buvette-d');
    expect(result.state).toBe('ok');
    expect(prisma.guestPinAccess.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ windowId: 'win-pre' }) }),
    );
  });

  it('un PIN qui ne correspond à aucune fenêtre ouverte compte un échec (not_found)', async () => {
    const result: any = await service.login('999999', 'device-1', '10.0.0.1', 'buvette-d');
    expect(result.state).toBe('not_found');
    expect(redis.incr).toHaveBeenCalled();
  });

  it("avant saisie, le PDV est actif si au moins une fenêtre ouverte avec PIN ne l'a pas révoqué", async () => {
    prisma.guestPinAccess.findMany.mockResolvedValue([{ windowId: 'win-pre', status: 'revoked' }]); // révoqué en pre-event seulement
    expect(await service.getPublicContext('buvette-d')).toEqual({
      elementName: 'Buvette D',
      active: true,
    });
    prisma.guestPinAccess.findMany.mockResolvedValue([
      { windowId: 'win-pre', status: 'revoked' },
      { windowId: 'win-post', status: 'revoked' },
    ]);
    expect(await service.getPublicContext('buvette-d')).toEqual({
      elementName: 'Buvette D',
      active: false,
    });
  });

  describe('fenêtre arrêtée, PIN conservé (document Bertrand 2026-10-06)', () => {
    beforeEach(() => {
      preWindow.status = 'closed';
      postWindow.status = 'closed';
    });
    afterEach(() => {
      preWindow.status = 'open';
      postWindow.status = 'open';
    });

    it('sans ligne pour ce PDV : accès inactif, aucun échec compté', async () => {
      const result: any = await service.login('111111', 'device-1', '10.0.0.1', 'buvette-d');
      expect(result.state).toBe('inactive');
      expect(redis.incr).not.toHaveBeenCalled();
      expect(prisma.guestPinAccess.create).not.toHaveBeenCalled();
    });

    it('PDV rouvert individuellement (ligne active) : connexion acceptée', async () => {
      const row = { id: 'access-1', windowId: 'win-pre', elementId: 'shop-1', status: 'active' };
      prisma.guestPinAccess.findMany.mockResolvedValue([{ windowId: 'win-pre', status: 'active' }]);
      prisma.guestPinAccess.findUnique.mockResolvedValue(row);
      const result: any = await service.login('111111', 'device-1', '10.0.0.1', 'buvette-d');
      expect(result.state).toBe('ok');
      expect(await service.getPublicContext('buvette-d')).toEqual({ elementName: 'Buvette D', active: true });
    });
  });
});
