import { Test } from '@nestjs/testing';
import type { GuestPinUser } from '../../../core/auth/strategies/jwt-guest-pin.strategy';
import { SaleLinePricingService } from '../../../shared/sales/sale-line-pricing.service';
import { PaymentMethodsService } from '../../payment-methods/payment-methods.service';
import { PosAvailabilityService } from '../availability/pos-availability.service';
import { PosSaleContextService } from '../sales/pos-sale-context.service';
import { PosSalesQueryService } from '../sales/pos-sales-query.service';
import { PosCatalogService } from './pos-catalog.service';

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

const resolved = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  menuItemId: id,
  name,
  categoryId: 'cat-b',
  categoryLabel: 'Boissons',
  unitPrice: 5,
  originalUnitPrice: null,
  promotionLabel: null,
  vatRate: 10,
  note: null,
  ...over,
});

describe('PosCatalogService', () => {
  let service: PosCatalogService;
  const context = { load: jest.fn() };
  const pricing = { resolveLines: jest.fn() };
  const availability = { computeForPdv: jest.fn() };
  const payments = { resolveForEvent: jest.fn() };
  const query = { nextTicketNumber: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    context.load.mockResolvedValue({
      event: { id: 'event-1', name: 'PAUC - Caen' },
      elementName: 'Buvette Nord',
      settings: { promosEnabled: false, cancelEnabled: true, paymentMethodIds: ['pm-cash'], lowStockUnits: 5, tipsEnabled: true },
      assignedMenuItemIds: new Set(['mi-1', 'mi-2', 'mi-3']),
    });
    pricing.resolveLines.mockResolvedValue(
      new Map([
        ['mi-2', resolved('mi-2', 'Sandwich', { categoryId: null, categoryLabel: null, unitPrice: 7, vatRate: 5.5 })],
        ['mi-1', resolved('mi-1', 'Bière', { originalUnitPrice: 6, promotionLabel: 'Happy-Hour', note: null })],
        ['mi-3', resolved('mi-3', 'Ecocup', { unitPrice: 1, vatRate: 0 })],
      ]),
    );
    availability.computeForPdv.mockResolvedValue(
      new Map([
        ['mi-1', { availability: 'low', remainingUnits: 4 }],
        ['mi-3', { availability: 'out', remainingUnits: 0 }],
      ]),
    );
    payments.resolveForEvent.mockResolvedValue([{ id: 'pm-cash', name: 'Espèces', kind: 'cash', active: true, sortOrder: 0, isSystem: true }]);
    query.nextTicketNumber.mockResolvedValue(8);
    const module = await Test.createTestingModule({
      providers: [
        PosCatalogService,
        { provide: PosSaleContextService, useValue: context },
        { provide: SaleLinePricingService, useValue: pricing },
        { provide: PosAvailabilityService, useValue: availability },
        { provide: PaymentMethodsService, useValue: payments },
        { provide: PosSalesQueryService, useValue: query },
      ],
    }).compile();
    service = module.get(PosCatalogService);
  });

  it('assemble articles, catégories, disponibilité, paiements et prochain numéro', async () => {
    const catalog = await service.getCatalog(guest);

    expect(catalog.pdv).toEqual({ elementId: 'pdv-1', name: 'Buvette Nord' });
    expect(catalog.event).toEqual({ id: 'event-1', name: 'PAUC - Caen' });
    expect(catalog.vendorName).toBe('Marie');
    expect(catalog.nextTicketNumber).toBe(8);
    expect(catalog.paymentMethods.map((m) => m.kind)).toEqual(['cash']);
    expect(catalog.settings).toEqual({ paymentMethodIds: ['pm-cash'], promosEnabled: false, cancelEnabled: true, lowStockUnits: 5, tipsEnabled: true });
    expect(catalog.items.map((i) => i.name)).toEqual(['Bière', 'Ecocup', 'Sandwich']);
    expect(catalog.items[0]).toMatchObject({ availability: 'low', remainingUnits: 4, promotionLabel: 'Happy-Hour', originalUnitPrice: 6 });
    expect(catalog.items[1]).toMatchObject({ availability: 'out', remainingUnits: 0, vatRate: 0 });
    // Sans donnée de stock : disponible, quantité inconnue.
    expect(catalog.items[2]).toMatchObject({ availability: 'available', remainingUnits: null, categoryId: 'uncategorized' });
    expect(catalog.categories).toEqual([
      { id: 'uncategorized', label: 'Autres' },
      { id: 'cat-b', label: 'Boissons' },
    ]);
  });

  it('résout prix et disponibilité sur les articles du PdV, avec le réglage promos de l\'évènement', async () => {
    await service.getCatalog(guest);
    expect(pricing.resolveLines).toHaveBeenCalledWith('tenant-1', 'space-1', ['mi-1', 'mi-2', 'mi-3'], false);
    expect(availability.computeForPdv).toHaveBeenCalledWith('tenant-1', 'space-1', 'event-1', 'pdv-1', ['mi-1', 'mi-2', 'mi-3']);
    expect(payments.resolveForEvent).toHaveBeenCalledWith('tenant-1', 'event-1');
  });
});
