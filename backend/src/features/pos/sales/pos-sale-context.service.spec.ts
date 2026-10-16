import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { GuestPinUser } from '../../../core/auth/strategies/jwt-guest-pin.strategy';
import { PrismaService } from '../../../core/database/prisma.service';
import { POS_ERROR_CODES } from '../pos.contracts';
import { PosSaleContextService } from './pos-sale-context.service';

const guest: GuestPinUser = {
  id: 'access-1',
  type: 'guest-pin',
  tenantId: 'tenant-1',
  spaceId: 'space-1',
  elementId: 'pdv-1',
  windowId: 'win-1',
  eventId: 'event-1',
  phase: 'pos',
  showExpected: false,
  submittedAt: null,
  validatedAt: null,
  vendorName: 'Marie',
};

const event = (over: Record<string, unknown> = {}) => ({
  id: 'event-1',
  name: 'PAUC - Caen',
  configurationId: 'cfg-1',
  eventDate: new Date('2099-05-01T00:00:00Z'),
  eventStartDate: null,
  eventEndDate: null,
  eventEndTime: null,
  sessions: null,
  space: { timezone: 'Europe/Paris' },
  ...over,
});

describe('PosSaleContextService', () => {
  let service: PosSaleContextService;
  const prisma = {
    inventoryWindow: { findFirst: jest.fn() },
    event: { findFirst: jest.fn() },
    spaceElement: { findUnique: jest.fn() },
    posEventSetting: { findFirst: jest.fn() },
    menuAssignment: { findMany: jest.fn() },
    posPdvSetting: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.event.findFirst.mockResolvedValue(event());
    prisma.spaceElement.findUnique.mockResolvedValue({ name: 'Buvette Nord' });
    prisma.posEventSetting.findFirst.mockResolvedValue(null);
    prisma.menuAssignment.findMany.mockResolvedValue([{ menuItemId: 'mi-1' }, { menuItemId: 'mi-2' }]);
    prisma.posPdvSetting.findFirst.mockResolvedValue({ responsibleHrPersonId: 'hr-1' });
    const module = await Test.createTestingModule({
      providers: [PosSaleContextService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PosSaleContextService);
  });

  it('refuse toute session qui n\'est pas de phase pos (inventaire, ventilation)', () => {
    for (const phase of ['pre', 'post', 'ventilation']) {
      expect(() => service.assertPosGuest({ ...guest, phase })).toThrow(ForbiddenException);
    }
    expect(() => service.assertPosGuest(guest)).not.toThrow();
  });

  it('caisse arrêtée : POS_PDV_STOPPED', async () => {
    prisma.inventoryWindow.findFirst.mockResolvedValue(null);
    await expect(service.assertCashOpen(guest)).rejects.toMatchObject({ response: { code: POS_ERROR_CODES.PDV_STOPPED } });
    expect(prisma.inventoryWindow.findFirst.mock.calls[0][0].where).toEqual({ id: 'win-1', tenantId: 'tenant-1', phase: 'pos', status: 'open' });
  });

  it('charge les articles du PdV dans la configuration de l\'évènement, avec les réglages par défaut', async () => {
    const ctx = await service.load(guest);
    expect(prisma.menuAssignment.findMany.mock.calls[0][0].where).toEqual({
      elementId: 'pdv-1',
      configId: 'cfg-1',
      enabled: true,
      menuItem: { tenantId: 'tenant-1', deletedAt: null },
    });
    expect([...ctx.assignedMenuItemIds]).toEqual(['mi-1', 'mi-2']);
    expect(ctx.settings).toEqual({ promosEnabled: true, cancelEnabled: true, paymentMethodIds: [], lowStockUnits: 5, tipsEnabled: false });
    expect(ctx.responsibleHrPersonId).toBe('hr-1');
    expect(ctx.elementName).toBe('Buvette Nord');
  });

  it('relit l\'évènement borné par tenant et espace du jeton', async () => {
    await service.load(guest);
    expect(prisma.event.findFirst.mock.calls[0][0].where).toEqual({ id: 'event-1', tenantId: 'tenant-1', spaceId: 'space-1' });
  });

  it('évènement terminé (fin réelle + grâce dépassée) : POS_EVENT_NOT_SELLABLE', async () => {
    prisma.event.findFirst.mockResolvedValue(event({ eventDate: new Date('2020-01-01T00:00:00Z') }));
    await expect(service.load(guest)).rejects.toMatchObject({ response: { code: POS_ERROR_CODES.EVENT_NOT_SELLABLE } });
  });

  it('évènement introuvable ou sans configuration', async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(service.load(guest)).rejects.toBeInstanceOf(NotFoundException);
    prisma.event.findFirst.mockResolvedValue(event({ configurationId: null }));
    await expect(service.load(guest)).rejects.toBeInstanceOf(BadRequestException);
  });
});
