import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { JwtGuestPinGuard } from '../../../core/auth/guards/jwt-guest-pin.guard';
import type { GuestPinUser } from '../../../core/auth/strategies/jwt-guest-pin.strategy';
import { PosSaleCancelService } from '../sales/pos-sale-cancel.service';
import { PosSaleContextService } from '../sales/pos-sale-context.service';
import { PosSaleService } from '../sales/pos-sale.service';
import { PosSalesQueryService } from '../sales/pos-sales-query.service';
import { PosCatalogService } from './pos-catalog.service';
import { PosGuestController } from './pos-guest.controller';

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

describe('PosGuestController', () => {
  let controller: PosGuestController;
  const sales = { createSale: jest.fn() };
  const cancellation = { cancel: jest.fn(), restore: jest.fn() };
  const catalog = { getCatalog: jest.fn() };
  const salesQuery = { list: jest.fn(), closing: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PosGuestController],
      providers: [
        // Contexte réel : c'est lui qui refuse les sessions non pos.
        { provide: PosSaleContextService, useValue: { assertPosGuest: new PosSaleContextService({} as any).assertPosGuest } },
        { provide: PosCatalogService, useValue: catalog },
        { provide: PosSaleService, useValue: sales },
        { provide: PosSaleCancelService, useValue: cancellation },
        { provide: PosSalesQueryService, useValue: salesQuery },
      ],
    })
      .overrideGuard(JwtGuestPinGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PosGuestController);
  });

  it('refuse les sessions d\'inventaire sur les lectures', () => {
    const inventory = { ...guest, phase: 'pre' };
    expect(() => controller.getCatalog(inventory)).toThrow(ForbiddenException);
    expect(() => controller.listSales(inventory, {})).toThrow(ForbiddenException);
    expect(() => controller.closing(inventory)).toThrow(ForbiddenException);
    expect(catalog.getCatalog).not.toHaveBeenCalled();
    expect(salesQuery.list).not.toHaveBeenCalled();
  });

  it('l\'historique et la clôture prennent tout leur périmètre du jeton', () => {
    controller.listSales(guest, { search: 'marie', limit: 20 });
    expect(salesQuery.list).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', spaceId: 'space-1', eventId: 'event-1', elementId: 'pdv-1' },
      { search: 'marie', limit: 20 },
    );
    controller.closing(guest);
    expect(salesQuery.closing).toHaveBeenCalledWith({ tenantId: 'tenant-1', spaceId: 'space-1', eventId: 'event-1', elementId: 'pdv-1' });
  });

  it('la vente transmet le jeton et l\'identifiant d\'appareil', () => {
    const dto: any = { clientTicketId: 'c', payments: [], lines: [] };
    controller.createSale(guest, dto, 'device-1');
    expect(sales.createSale).toHaveBeenCalledWith(guest, dto, 'device-1');
    controller.createSale(guest, dto, undefined);
    expect(sales.createSale).toHaveBeenLastCalledWith(guest, dto, null);
  });

  it('annulation et rétablissement passent le jeton et l\'identifiant de vente', () => {
    controller.cancel(guest, 'sale-1');
    controller.restore(guest, 'sale-1');
    expect(cancellation.cancel).toHaveBeenCalledWith(guest, 'sale-1');
    expect(cancellation.restore).toHaveBeenCalledWith(guest, 'sale-1');
  });
});
