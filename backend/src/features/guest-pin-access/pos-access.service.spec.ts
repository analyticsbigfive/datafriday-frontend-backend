import { ConfigService } from '@nestjs/config';
import { POS_ERROR_CODES, POS_VENDOR_NAME_MAX } from '../pos/pos.contracts';
import { PosAccessService } from './pos-access.service';
import { GuestPinCredentialService } from './services/guest-pin-credential.service';
import { GuestPinSessionService } from './services/guest-pin-session.service';
import { INVENTORY_PHASES, isInventoryPhase } from './inventory-window-period';
import { sanitizeVendorName } from './pos-vendor-name';
import { isPosEventSellable } from './pos-period';

/** Accès invité de la caisse POS : une fenêtre, un PIN et un QR par PdV (PLAN.md décision 2). */
describe('PosAccessService', () => {
  const config = { getOrThrow: jest.fn().mockReturnValue('test-secret'), get: jest.fn().mockReturnValue('1d') } as unknown as ConfigService;
  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const futureEvent = {
    id: 'ev-1', configurationId: 'cfg-1', eventDate: day('2099-01-10'), eventStartDate: day('2099-01-10'),
    eventEndDate: day('2099-01-10'), eventEndTime: '23:00', sessions: null, space: { timezone: 'Europe/Paris' },
  };
  const pastEvent = { ...futureEvent, eventDate: day('2020-01-10'), eventStartDate: day('2020-01-10'), eventEndDate: day('2020-01-10') };
  const pdvA = { id: 'pdv-a', name: 'Buvette A', spaceId: 'space-1' };
  const pdvB = { id: 'pdv-b', name: 'Buvette B', spaceId: 'space-1' };

  let prisma: any;
  let credential: GuestPinCredentialService;
  let jwt: any;
  let redis: any;
  let windowService: any;
  let service: PosAccessService;
  let windows: any[];
  let event: any;

  const makeWindow = (elementId: string, pin: string, extra: object = {}) => ({
    id: `w-${elementId}`, tenantId: 'tenant-1', spaceId: 'space-1', eventId: 'ev-1', phase: 'pos', selectionKey: elementId,
    status: 'open', pinLookupHash: credential.hashPin(pin), pinCiphertext: 'x', pinSetAt: null, openedAt: new Date(), closedAt: null, ...extra,
  });
  const inventoryInactive = jest.fn();

  beforeEach(() => {
    jwt = { signAsync: jest.fn().mockResolvedValue('jwt') };
    redis = { get: jest.fn().mockResolvedValue(null), ttl: jest.fn(), incr: jest.fn().mockResolvedValue(1), expire: jest.fn() };
    event = futureEvent;
    prisma = {
      inventoryWindow: {
        // Évalue les critères que PosAccessService pose : phase, selectionKey, spaceId, pinLookupHash, status.
        findFirst: jest.fn(async ({ where }: any) =>
          windows.find((w) => (['phase', 'selectionKey', 'spaceId', 'status'] as const).every((k) => where[k] === undefined || w[k] === where[k])
            && (where.pinLookupHash === undefined || (typeof where.pinLookupHash === 'string' ? w.pinLookupHash === where.pinLookupHash : !!w.pinLookupHash))) ?? null),
        findMany: jest.fn(async ({ where }: any) => windows.filter((w) => where.selectionKey.in.includes(w.selectionKey))),
        findUnique: jest.fn(async ({ where }: any) => windows.find((w) => w.selectionKey === where.uniq_inventory_window.selectionKey) ?? null),
        upsert: jest.fn(async ({ where, create }: any) => {
          const found = windows.find((w) => w.selectionKey === where.uniq_inventory_window.selectionKey);
          if (found) { found.status = 'open'; return found; }
          const created = { id: `w-${create.selectionKey}`, ...create, status: 'open', pinLookupHash: null, pinCiphertext: null };
          windows.push(created);
          return created;
        }),
      },
      guestPinAccess: {
        upsert: jest.fn().mockResolvedValue({ id: 'acc-1', status: 'active' }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      event: { findFirst: jest.fn(async () => event) },
      space: { findUnique: jest.fn().mockResolvedValue({ name: 'La Beaujoire' }) },
      spaceElement: {
        findUnique: jest.fn(async ({ where }: any) => ({ id: where.id ?? 'pdv-a', name: 'Buvette', floor: { config: { spaceId: 'space-1' } } })),
        findFirst: jest.fn().mockResolvedValue({ id: 'pdv-a' }),
      },
    };
    credential = new GuestPinCredentialService(prisma, config);
    const session = new GuestPinSessionService(prisma, redis, config, jwt, credential);
    windowService = {
      ensureWindowPin: jest.fn(async (w: any) => { w.pinLookupHash = credential.hashPin('123456'); }),
      closeWindowRecord: jest.fn(async (w: any) => { w.status = 'closed'; return { ok: true }; }),
      regenerateWindowPin: jest.fn().mockResolvedValue('654321'),
    };
    service = new PosAccessService(prisma, session, windowService, credential);
    windows = [makeWindow('pdv-a', '111111'), makeWindow('pdv-b', '222222')];
    inventoryInactive.mockReset().mockResolvedValue({ state: 'inactive' });
  });

  describe('login : un PIN par PdV', () => {
    it('le PIN du PdV A est refusé sur le PdV B (échec compté, aucun jeton)', async () => {
      const result = await service.login(pdvB, '111111', 'Awa', 'dev', '1.1.1.1', inventoryInactive);
      expect(result).toEqual({ state: 'not_found', attemptsRemaining: 7 });
      expect(jwt.signAsync).not.toHaveBeenCalled();
      expect(prisma.guestPinAccess.upsert).not.toHaveBeenCalled();
    });

    it('le PIN du PdV A ouvre le PdV A avec le nom du vendeur dans le jeton', async () => {
      const result = await service.login(pdvA, '111111', '  Awa   Koné ', 'dev', '1.1.1.1', inventoryInactive);
      expect(result).toMatchObject({ state: 'ok', phase: 'pos', elementId: 'pdv-a', eventId: 'ev-1', vendorName: 'Awa Koné' });
      expect(jwt.signAsync.mock.calls[0][0]).toEqual({ sub: 'acc-1', vendorName: 'Awa Koné' });
      expect(prisma.guestPinAccess.upsert.mock.calls[0][0].where).toEqual({
        uniq_guest_pin_access_per_element: { windowId: 'w-pdv-a', elementId: 'pdv-a' },
      });
    });

    it('le nom du vendeur est obligatoire (absent ou vide), jamais de jeton sans nom', async () => {
      for (const name of [undefined, '', '   ', '<>']) {
        await expect(service.login(pdvA, '111111', name, 'dev', '1.1.1.1', inventoryInactive)).rejects.toMatchObject({
          response: { code: POS_ERROR_CODES.VENDOR_NAME_REQUIRED },
        });
      }
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('un PIN qui ne correspond pas à la caisse retombe sur le flux inventaire, résultat inchangé', async () => {
      inventoryInactive.mockResolvedValueOnce({ state: 'ok', token: 'inv', phase: 'pre-event' });
      await expect(service.login(pdvA, '999999', undefined, 'dev', '1.1.1.1', inventoryInactive)).resolves.toMatchObject({ token: 'inv', phase: 'pre-event' });
    });

    it('caisse arrêtée : « inactif », sans exiger le nom', async () => {
      windows[0].status = 'closed';
      await expect(service.login(pdvA, '111111', undefined, 'dev', '1.1.1.1', inventoryInactive)).resolves.toEqual({ state: 'inactive' });
    });

    it('accès du PdV révoqué (■) : « inactif »', async () => {
      prisma.guestPinAccess.upsert.mockResolvedValueOnce({ id: 'acc-1', status: 'revoked' });
      await expect(service.login(pdvA, '111111', 'Awa', 'dev', '1.1.1.1', inventoryInactive)).resolves.toEqual({ state: 'inactive' });
    });

    it('évènement terminé (fin réelle + grâce dépassée) : EVENT_NOT_SELLABLE', async () => {
      event = pastEvent;
      await expect(service.login(pdvA, '111111', 'Awa', 'dev', '1.1.1.1', inventoryInactive)).rejects.toMatchObject({
        response: { code: POS_ERROR_CODES.EVENT_NOT_SELLABLE },
      });
    });

    it('trop d’essais sur cette IP : verrouillé, aucun PIN comparé', async () => {
      redis.get.mockResolvedValue(8);
      redis.ttl.mockResolvedValue(120);
      await expect(service.login(pdvA, '111111', 'Awa', 'dev', '1.1.1.1', inventoryInactive)).resolves.toEqual({ state: 'locked', retryAfter: 120 });
      expect(prisma.inventoryWindow.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('start / stop', () => {
    it('start : fenêtre pos du PdV (selectionKey = elementId), PIN, accès actif, utilisable avant les portes', async () => {
      windows = [];
      const status = await service.start('tenant-1', 'space-1', 'ev-1', 'pdv-a', 'user-1');
      expect(prisma.inventoryWindow.upsert.mock.calls[0][0].create).toMatchObject({ phase: 'pos', selectionKey: 'pdv-a', eventId: 'ev-1', spaceId: 'space-1', tenantId: 'tenant-1' });
      expect(windowService.ensureWindowPin).toHaveBeenCalled();
      expect(prisma.guestPinAccess.upsert.mock.calls[0][0].update).toMatchObject({ status: 'active' });
      expect(status).toMatchObject({ elementId: 'pdv-a', open: false });
    });

    it('start : évènement terminé refusé, PdV hors configuration refusé', async () => {
      event = pastEvent;
      await expect(service.start('tenant-1', 'space-1', 'ev-1', 'pdv-a', 'u')).rejects.toMatchObject({ response: { code: POS_ERROR_CODES.EVENT_NOT_SELLABLE } });
      event = futureEvent;
      prisma.spaceElement.findFirst.mockResolvedValueOnce(null);
      await expect(service.start('tenant-1', 'space-1', 'ev-1', 'pdv-a', 'u')).rejects.toMatchObject({ response: { code: POS_ERROR_CODES.PDV_NOT_IN_EVENT_CONFIG } });
    });

    it('stop : ferme la fenêtre du PdV (révocation de l’accès), sans push Logistic', async () => {
      await service.stop('tenant-1', 'space-1', 'ev-1', 'pdv-a', 'user-1');
      expect(windowService.closeWindowRecord).toHaveBeenCalledTimes(1);
      const [window, actor, options] = windowService.closeWindowRecord.mock.calls[0];
      expect(window.id).toBe('w-pdv-a');
      expect(actor).toBe('user-1');
      expect(options).toEqual({ pushToLogistic: false, reason: 'manual-stop' });
    });

    it('stop : le PdV B n’est pas touché', async () => {
      await service.stop('tenant-1', 'space-1', 'ev-1', 'pdv-a', 'user-1');
      expect(windows[1].status).toBe('open');
    });

    it('stop sur fenêtre déjà fermée : révoque quand même les accès restés actifs', async () => {
      windows[0].status = 'closed';
      await service.stop('tenant-1', 'space-1', 'ev-1', 'pdv-a', 'user-1');
      expect(windowService.closeWindowRecord).not.toHaveBeenCalled();
      expect(prisma.guestPinAccess.updateMany.mock.calls[0][0]).toMatchObject({ where: { windowId: { in: ['w-pdv-a'] }, status: 'active' }, data: { status: 'revoked' } });
    });

    it('startAll : un PdV hors configuration n’empêche pas les autres', async () => {
      windows = [];
      prisma.spaceElement.findFirst.mockResolvedValueOnce({ id: 'pdv-a' }).mockResolvedValueOnce(null);
      const bulk = await service.startAll('tenant-1', 'space-1', 'ev-1', ['pdv-a', 'pdv-b', 'pdv-a'], 'user-1');
      expect(bulk.results.map((r) => r.elementId)).toEqual(['pdv-a']);
      expect(bulk.failures).toEqual([expect.objectContaining({ elementId: 'pdv-b', code: POS_ERROR_CODES.PDV_NOT_IN_EVENT_CONFIG })]);
    });

    it('regeneratePin : refusé sur une caisse arrêtée, sinon nouveau PIN', async () => {
      windows[0].status = 'closed';
      await expect(service.regeneratePin('tenant-1', 'space-1', 'ev-1', 'pdv-a', 'u')).rejects.toThrow();
      await service.regeneratePin('tenant-1', 'space-1', 'ev-1', 'pdv-b', 'u');
      expect(windowService.regenerateWindowPin).toHaveBeenCalledWith('w-pdv-b', 'tenant-1', 'u');
    });

    it('getPin : null quand la caisse est arrêtée', async () => {
      windows[0].status = 'closed';
      await expect(service.getPin('tenant-1', 'space-1', 'ev-1', 'pdv-a')).resolves.toBeNull();
    });
  });

  describe('contexte public', () => {
    it('posActive quand une caisse est ouverte pour le PdV du QR, faux sinon', async () => {
      prisma.spaceElement.findUnique.mockResolvedValue({ id: 'pdv-a', name: 'A', floor: { config: { spaceId: 'space-1' } } });
      await expect(service.getPublicContext('slug-a')).resolves.toEqual({ posActive: true });
      windows[0].status = 'closed';
      await expect(service.getPublicContext('slug-a')).resolves.toEqual({ posActive: false });
    });
  });

  describe('jetons et phases', () => {
    const sessionService = () => new GuestPinSessionService(prisma, redis, config, jwt, credential);

    it('jeton inventaire et ventilation : { sub } seul, strictement inchangé', async () => {
      await sessionService().issueGuestToken('acc-1', 'dev');
      expect(jwt.signAsync.mock.calls[0][0]).toEqual({ sub: 'acc-1' });
    });

    it('jeton pos : porte le nom du vendeur', async () => {
      await sessionService().issueGuestToken('acc-1', 'dev', { vendorName: 'Awa' });
      expect(jwt.signAsync.mock.calls[0][0]).toEqual({ sub: 'acc-1', vendorName: 'Awa' });
    });

    it('pos est hors des phases d’inventaire', () => {
      expect(INVENTORY_PHASES).not.toContain('pos');
      expect(isInventoryPhase('pos')).toBe(false);
    });
  });

  describe('nom du vendeur et période', () => {
    it('nettoie et tronque le nom', () => {
      expect(sanitizeVendorName('  a\u0000b   <c>  ')).toBe('a b c');
      expect(sanitizeVendorName('x'.repeat(POS_VENDOR_NAME_MAX + 20))).toHaveLength(POS_VENDOR_NAME_MAX);
      expect(sanitizeVendorName(42)).toBeNull();
    });

    it('vendable jusqu’à la fin réelle + 3 h (heure de fin 23:00 Paris le 10/01 = 22:00Z)', () => {
      const e = { ...futureEvent, eventDate: day('2026-01-10'), eventStartDate: day('2026-01-10'), eventEndDate: day('2026-01-10') };
      expect(isPosEventSellable(e, 'Europe/Paris', new Date('2026-01-10T08:00:00Z'))).toBe(true); // avant les portes
      expect(isPosEventSellable(e, 'Europe/Paris', new Date('2026-01-11T00:59:00Z'))).toBe(true); // fin + 2 h 59
      expect(isPosEventSellable(e, 'Europe/Paris', new Date('2026-01-11T01:00:00Z'))).toBe(false); // fin + 3 h
    });
  });
});
