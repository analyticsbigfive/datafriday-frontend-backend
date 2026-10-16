import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { GuestPinUser } from '../../../core/auth/strategies/jwt-guest-pin.strategy';
import { PrismaService } from '../../../core/database/prisma.service';
import { SalesPriceAggService } from '../../../shared/pricing/sales-price-agg.service';
import { POS_ERROR_CODES } from '../pos.contracts';
import { PosLiveTriggerService } from './pos-live-trigger.service';
import { PosSaleCancelService } from './pos-sale-cancel.service';
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

const sale = (deletedAt: Date | null = null) => ({
  id: 'sale-1',
  amount: 8,
  transactionDate: new Date('2026-10-16T20:00:00Z'),
  deletedAt,
  locationName: 'Buvette Nord',
  integrationId: 'integ-pos',
  locationId: 'loc-1',
  metadata: { ticketNumber: 4, elementId: 'pdv-1', vendorName: 'Marie', payments: [] },
  items: [
    { productId: 'sp-1', productName: 'Bière', quantity: 2, unitPrice: 4, vat: 10, rawData: { menuItemId: 'mi-1' } },
  ],
});

describe('PosSaleCancelService', () => {
  let service: PosSaleCancelService;
  const prisma = { salesTransaction: { findFirst: jest.fn(), updateMany: jest.fn() } };
  const context = { assertPosGuest: jest.fn(), assertCashOpen: jest.fn(), load: jest.fn() };
  const priceAgg = { applyDeltaSafe: jest.fn() };
  const live = { trigger: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    context.assertCashOpen.mockResolvedValue(undefined);
    context.load.mockResolvedValue({
      event: { id: 'event-1', name: 'PAUC', eventDate: new Date('2026-10-16') },
      settings: { promosEnabled: true, cancelEnabled: true, paymentMethodIds: [] },
    });
    prisma.salesTransaction.findFirst.mockResolvedValue(sale());
    prisma.salesTransaction.updateMany.mockResolvedValue({ count: 1 });
    priceAgg.applyDeltaSafe.mockResolvedValue(undefined);
    live.trigger.mockResolvedValue(true);
    const module = await Test.createTestingModule({
      providers: [
        PosSaleCancelService,
        { provide: PrismaService, useValue: prisma },
        { provide: PosSaleContextService, useValue: context },
        { provide: SalesPriceAggService, useValue: priceAgg },
        { provide: PosLiveTriggerService, useValue: live },
      ],
    }).compile();
    service = module.get(PosSaleCancelService);
  });

  it('annule par deletedAt, inverse le delta SalesPriceAgg et relance le Live', async () => {
    const row = await service.cancel(guest, 'sale-1');

    expect(row.cancelled).toBe(true);
    expect(prisma.salesTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: 'sale-1', tenantId: 'tenant-1', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    const [tenantId, integrationId, added, removed] = priceAgg.applyDeltaSafe.mock.calls[0];
    expect([tenantId, integrationId]).toEqual(['tenant-1', 'integ-pos']);
    expect(added).toEqual([]);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ locationId: 'loc-1', productId: 'sp-1' });
    expect(live.trigger).toHaveBeenCalledWith(expect.objectContaining({ integrationId: 'integ-pos', eventId: 'event-1' }), 'pos-cancel');
  });

  it('rétablit : deletedAt remis à null, delta dans le sens inverse', async () => {
    prisma.salesTransaction.findFirst.mockResolvedValue(sale(new Date()));
    const row = await service.restore(guest, 'sale-1');

    expect(row.cancelled).toBe(false);
    expect(prisma.salesTransaction.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'sale-1', tenantId: 'tenant-1', deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    const [, , added, removed] = priceAgg.applyDeltaSafe.mock.calls[0];
    expect(added).toHaveLength(1);
    expect(removed).toEqual([]);
    expect(live.trigger).toHaveBeenCalledWith(expect.anything(), 'pos-restore');
  });

  it('refuse quand l\'annulation est désactivée pour l\'évènement', async () => {
    context.load.mockResolvedValue({ event: { id: 'event-1', eventDate: new Date() }, settings: { cancelEnabled: false } });
    await expect(service.cancel(guest, 'sale-1')).rejects.toMatchObject({
      response: { code: POS_ERROR_CODES.CANCEL_DISABLED },
    });
    await expect(service.restore(guest, 'sale-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.salesTransaction.updateMany).not.toHaveBeenCalled();
  });

  it('isolation : la recherche est bornée au PdV et à l\'évènement du jeton, une autre vente est introuvable', async () => {
    prisma.salesTransaction.findFirst.mockResolvedValue(null);
    await expect(service.cancel(guest, 'sale-autre-pdv')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.salesTransaction.findFirst.mock.calls[0][0].where).toEqual({
      id: 'sale-autre-pdv',
      tenantId: 'tenant-1',
      provider: 'POS',
      location: { externalId: 'pdv-1' },
      event: { externalId: 'event-1' },
    });
    expect(prisma.salesTransaction.updateMany).not.toHaveBeenCalled();
    expect(live.trigger).not.toHaveBeenCalled();
  });

  it('idempotent : annuler une vente déjà annulée ne refait ni delta ni job', async () => {
    prisma.salesTransaction.findFirst.mockResolvedValue(sale(new Date()));
    const row = await service.cancel(guest, 'sale-1');
    expect(row.cancelled).toBe(true);
    expect(prisma.salesTransaction.updateMany).not.toHaveBeenCalled();
    expect(priceAgg.applyDeltaSafe).not.toHaveBeenCalled();
    expect(live.trigger).not.toHaveBeenCalled();
  });

  it('course : si une autre requête a déjà basculé la vente, aucun second delta', async () => {
    prisma.salesTransaction.updateMany.mockResolvedValue({ count: 0 });
    await service.cancel(guest, 'sale-1');
    expect(priceAgg.applyDeltaSafe).not.toHaveBeenCalled();
    expect(live.trigger).not.toHaveBeenCalled();
  });

  it('refuse une session qui n\'est pas une caisse', async () => {
    context.assertPosGuest.mockImplementation(() => {
      throw new ForbiddenException();
    });
    await expect(service.cancel({ ...guest, phase: 'pre' }, 'sale-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.salesTransaction.findFirst).not.toHaveBeenCalled();
  });
});
