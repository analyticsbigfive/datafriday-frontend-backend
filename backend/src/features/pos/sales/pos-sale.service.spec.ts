import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { GuestPinUser } from '../../../core/auth/strategies/jwt-guest-pin.strategy';
import { PrismaService } from '../../../core/database/prisma.service';
import { SalesPriceAggService } from '../../../shared/pricing/sales-price-agg.service';
import { SaleLinePricingService } from '../../../shared/sales/sale-line-pricing.service';
import { EventSalesSourceService } from '../../event-sales-sources/event-sales-source.service';
import { PaymentMethodsService } from '../../payment-methods/payment-methods.service';
import { POS_ERROR_CODES } from '../pos.contracts';
import { PosSourceService } from '../services/pos-source.service';
import { PosLiveTriggerService } from './pos-live-trigger.service';
import { PosSaleContextService } from './pos-sale-context.service';
import { POS_SALE_ERROR_CODES } from './pos-sale-errors';
import { PosSaleService } from './pos-sale.service';

const TICKET = '7f1c0a5e-3b2d-4c8e-9a41-0d6f2b7e1a11';
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

const CASH = { id: 'pm-cash', name: 'Espèces', kind: 'cash', active: true, sortOrder: 0, isSystem: true };
const CARD = { id: 'pm-card', name: 'Carte', kind: 'card', active: true, sortOrder: 1, isSystem: true };

const line = (id: string, unitPrice: number, over: Record<string, unknown> = {}) => ({
  menuItemId: id,
  name: `Article ${id}`,
  categoryId: null,
  categoryLabel: null,
  unitPrice,
  originalUnitPrice: null,
  promotionLabel: null,
  vatRate: 10,
  note: null,
  ...over,
});

const stored = (over: Record<string, unknown> = {}) => ({
  id: 'sale-1',
  amount: 11,
  transactionDate: new Date('2026-10-16T20:00:00Z'),
  deletedAt: null,
  locationName: 'Buvette Nord',
  metadata: { ticketNumber: 3, elementId: 'pdv-1', vendorName: 'Marie', payments: [{ paymentMethodId: 'pm-cash', name: 'Espèces', kind: 'cash', amountTtc: 11 }] },
  items: [],
  ...over,
});

describe('PosSaleService', () => {
  let service: PosSaleService;
  const tx = { $executeRaw: jest.fn(), salesTransaction: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn() } };
  const prisma = { salesTransaction: { findUnique: jest.fn() }, $transaction: jest.fn() };
  const context = { assertPosGuest: jest.fn(), assertCashOpen: jest.fn(), load: jest.fn() };
  const pricing = { resolveLines: jest.fn() };
  const payments = { resolveForEvent: jest.fn() };
  const source = { ensureIntegrationForSpace: jest.fn(), ensureReferentials: jest.fn() };
  const eventSources = { ensurePosSource: jest.fn() };
  const priceAgg = { applyDeltaSafe: jest.fn() };
  const live = { trigger: jest.fn() };

  const body = (over: Record<string, unknown> = {}) => ({
    clientTicketId: TICKET,
    payments: [{ paymentMethodId: 'pm-cash', amountTtc: 11 }],
    lines: [{ menuItemId: 'mi-1', quantity: 2 }, { menuItemId: 'mi-2', quantity: 1 }],
    ...over,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
    prisma.salesTransaction.findUnique.mockResolvedValue(null);
    tx.salesTransaction.findUnique.mockResolvedValue(null);
    tx.salesTransaction.count.mockResolvedValue(2);
    tx.salesTransaction.create.mockImplementation(async ({ data }: any) =>
      stored({ amount: data.amount, metadata: data.metadata, items: data.items.create.map((i: any) => ({ ...i })) }),
    );
    context.assertCashOpen.mockResolvedValue(undefined);
    context.load.mockResolvedValue({
      event: { id: 'event-1', name: 'PAUC - Caen', eventDate: new Date('2026-10-16') },
      elementName: 'Buvette Nord',
      settings: { promosEnabled: true, cancelEnabled: true, paymentMethodIds: [], lowStockUnits: 5, tipsEnabled: false },
      assignedMenuItemIds: new Set(['mi-1', 'mi-2', 'mi-neg']),
      responsibleHrPersonId: 'hr-1',
    });
    pricing.resolveLines.mockResolvedValue(
      new Map([
        ['mi-1', line('mi-1', 4, { originalUnitPrice: 5, promotionLabel: 'Happy-Hour' })],
        ['mi-2', line('mi-2', 3)],
        ['mi-neg', line('mi-neg', -1, { vatRate: 0 })],
      ]),
    );
    payments.resolveForEvent.mockResolvedValue([CASH, CARD]);
    source.ensureIntegrationForSpace.mockResolvedValue('integ-pos');
    source.ensureReferentials.mockResolvedValue({
      integrationId: 'integ-pos',
      salesEventId: 'se-1',
      locationIdByElementId: new Map([['pdv-1', 'loc-1']]),
      productIdByMenuItemId: new Map([['mi-1', 'sp-1'], ['mi-2', 'sp-2'], ['mi-neg', 'sp-neg']]),
    });
    eventSources.ensurePosSource.mockResolvedValue(undefined);
    priceAgg.applyDeltaSafe.mockResolvedValue(undefined);
    live.trigger.mockResolvedValue(true);

    const module = await Test.createTestingModule({
      providers: [
        PosSaleService,
        { provide: PrismaService, useValue: prisma },
        { provide: PosSaleContextService, useValue: context },
        { provide: SaleLinePricingService, useValue: pricing },
        { provide: PaymentMethodsService, useValue: payments },
        { provide: PosSourceService, useValue: source },
        { provide: EventSalesSourceService, useValue: eventSources },
        { provide: SalesPriceAggService, useValue: priceAgg },
        { provide: PosLiveTriggerService, useValue: live },
      ],
    }).compile();
    service = module.get(PosSaleService);
  });

  const codeOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (e: any) {
      return e.getResponse?.().code ?? e.message;
    }
    return null;
  };

  describe('vente nominale', () => {
    it('écrit la transaction POS, les lignes figées et le ticket numéroté', async () => {
      const result = await service.createSale(guest, body() as any, 'device-9');

      expect(result.replayed).toBe(false);
      const data = tx.salesTransaction.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        externalId: TICKET,
        tenantId: 'tenant-1',
        integrationId: 'integ-pos',
        provider: 'POS',
        status: 'V',
        eventId: 'se-1',
        locationId: 'loc-1',
        locationName: 'Buvette Nord',
      });
      expect(Number(data.amount)).toBe(11); // 2 x 4 + 1 x 3, prix recalculé côté serveur
      expect(data.metadata).toMatchObject({
        provider: 'pos',
        clientTicketId: TICKET,
        ticketNumber: 3, // 2 ventes déjà écrites sur la caisse + 1
        vendorName: 'Marie',
        responsibleHrPersonId: 'hr-1',
        guestAccessId: 'access-1',
        deviceId: 'device-9',
        elementId: 'pdv-1',
        payments: [{ paymentMethodId: 'pm-cash', name: 'Espèces', kind: 'cash', amountTtc: 11 }],
      });
      const items = data.items.create;
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({ productId: 'sp-1', productName: 'Article mi-1', quantity: 2 });
      expect(Number(items[0].unitPrice)).toBe(4);
      expect(Number(items[0].reduction)).toBe(0);
      expect(Number(items[0].vat)).toBe(10);
      expect(items[0].rawData).toEqual({ pos: true, menuItemId: 'mi-1', originalUnitPrice: 5, promotionLabel: 'Happy-Hour' });
    });

    it('pose les référentiels et la source de ventes avant d\'écrire', async () => {
      await service.createSale(guest, body() as any);
      expect(source.ensureReferentials).toHaveBeenCalledWith('tenant-1', 'space-1', 'event-1', ['pdv-1'], ['mi-1', 'mi-2']);
      expect(eventSources.ensurePosSource).toHaveBeenCalledWith('tenant-1', 'event-1', 'integ-pos', 'se-1');
    });

    it('prend le moyen de paiement figé du référentiel (kind), pas le corps de la requête', async () => {
      await service.createSale(guest, body({ payments: [{ paymentMethodId: 'pm-card', amountTtc: 11, name: 'Faux', kind: 'cash' }] }) as any);
      expect(tx.salesTransaction.create.mock.calls[0][0].data.metadata.payments).toEqual([
        { paymentMethodId: 'pm-card', name: 'Carte', kind: 'card', amountTtc: 11, tipTtc: 0 },
      ]);
    });
  });

  describe('Live et agrégats', () => {
    it('applique le delta SalesPriceAgg et déclenche le job live de l\'intégration POS', async () => {
      await service.createSale(guest, body() as any);
      expect(priceAgg.applyDeltaSafe).toHaveBeenCalledTimes(1);
      const [tenantId, integrationId, added, removed] = priceAgg.applyDeltaSafe.mock.calls[0];
      expect([tenantId, integrationId]).toEqual(['tenant-1', 'integ-pos']);
      expect(added).toHaveLength(2);
      expect(added[0]).toMatchObject({ locationId: 'loc-1', productId: 'sp-1' });
      expect(removed).toEqual([]);
      expect(live.trigger).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', spaceId: 'space-1', integrationId: 'integ-pos', eventId: 'event-1' }),
        'pos-sale',
      );
    });
  });

  describe('idempotence', () => {
    it('un rejeu renvoie la vente existante sans rien réécrire', async () => {
      prisma.salesTransaction.findUnique.mockResolvedValue(stored());
      const result = await service.createSale(guest, body() as any);

      expect(result.replayed).toBe(true);
      expect(result.sale.ticketNumber).toBe(3);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(source.ensureReferentials).not.toHaveBeenCalled();
      expect(priceAgg.applyDeltaSafe).not.toHaveBeenCalled();
      expect(live.trigger).not.toHaveBeenCalled();
      expect(prisma.salesTransaction.findUnique.mock.calls[0][0].where).toEqual({
        tenantId_integrationId_externalId: { tenantId: 'tenant-1', integrationId: 'integ-pos', externalId: TICKET },
      });
    });

    it("le ticket d'un autre PdV n'est pas un rejeu : conflit", async () => {
      prisma.salesTransaction.findUnique.mockResolvedValue(stored({ metadata: { elementId: 'pdv-autre' } }));
      await expect(service.createSale(guest, body() as any)).rejects.toBeInstanceOf(ConflictException);
    });

    it('une course sur le même ticket (relue sous verrou) se résout en rejeu', async () => {
      prisma.salesTransaction.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(stored());
      tx.salesTransaction.findUnique.mockResolvedValue({ id: 'sale-1' });
      const result = await service.createSale(guest, body() as any);
      expect(result.replayed).toBe(true);
      expect(tx.salesTransaction.create).not.toHaveBeenCalled();
      expect(live.trigger).not.toHaveBeenCalled();
    });

    it('une violation d\'unicité P2002 se résout aussi en rejeu', async () => {
      prisma.salesTransaction.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(stored());
      tx.salesTransaction.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      expect((await service.createSale(guest, body() as any)).replayed).toBe(true);
    });
  });

  describe('refus', () => {
    it('ticket vide', async () => {
      expect(await codeOf(service.createSale(guest, body({ lines: [] }) as any))).toBe(POS_ERROR_CODES.EMPTY_TICKET);
      expect(tx.salesTransaction.create).not.toHaveBeenCalled();
    });

    it('article absent du PdV dans la configuration', async () => {
      expect(await codeOf(service.createSale(guest, body({ lines: [{ menuItemId: 'mi-ailleurs', quantity: 1 }] }) as any))).toBe(
        POS_ERROR_CODES.ITEM_NOT_ON_PDV,
      );
      expect(tx.salesTransaction.create).not.toHaveBeenCalled();
    });

    it('article supprimé du catalogue depuis son affectation', async () => {
      pricing.resolveLines.mockResolvedValue(new Map([['mi-1', line('mi-1', 4)]]));
      expect(await codeOf(service.createSale(guest, body() as any))).toBe(POS_ERROR_CODES.ITEM_NOT_ON_PDV);
    });

    it('moyen de paiement désactivé pour l\'évènement', async () => {
      payments.resolveForEvent.mockResolvedValue([CASH]);
      expect(await codeOf(service.createSale(guest, body({ payments: [{ paymentMethodId: 'pm-card', amountTtc: 11 }] }) as any))).toBe(
        POS_ERROR_CODES.PAYMENT_METHOD_DISABLED,
      );
    });

    it('somme des paiements différente du total', async () => {
      expect(await codeOf(service.createSale(guest, body({ payments: [{ paymentMethodId: 'pm-cash', amountTtc: 10 }] }) as any))).toBe(
        POS_SALE_ERROR_CODES.PAYMENT_MISMATCH,
      );
    });

    it('paiement fractionné dont la somme est juste', async () => {
      const result = await service.createSale(
        guest,
        body({ payments: [{ paymentMethodId: 'pm-cash', amountTtc: 5 }, { paymentMethodId: 'pm-card', amountTtc: 6 }] }) as any,
      );
      expect(result.replayed).toBe(false);
      expect(tx.salesTransaction.create.mock.calls[0][0].data.metadata.payments).toHaveLength(2);
    });

    it('quantité non entière, nulle ou négative', async () => {
      for (const quantity of [1.5, 0, -1]) {
        // eslint-disable-next-line no-await-in-loop
        expect(await codeOf(service.createSale(guest, body({ lines: [{ menuItemId: 'mi-1', quantity }] }) as any))).toBe(
          POS_SALE_ERROR_CODES.INVALID_LINE,
        );
      }
    });

    it('vendeur sans nom dans le jeton', async () => {
      expect(await codeOf(service.createSale({ ...guest, vendorName: null }, body() as any))).toBe(POS_ERROR_CODES.VENDOR_NAME_REQUIRED);
    });

    it('session qui n\'est pas une caisse (refusée par le contexte)', async () => {
      context.assertPosGuest.mockImplementation(() => {
        throw new ForbiddenException();
      });
      await expect(service.createSale({ ...guest, phase: 'pre' }, body() as any)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.salesTransaction.create).not.toHaveBeenCalled();
    });

    it('caisse arrêtée ou évènement terminé : rien n\'est écrit', async () => {
      context.assertCashOpen.mockRejectedValue(new ForbiddenException({ code: POS_ERROR_CODES.PDV_STOPPED }));
      expect(await codeOf(service.createSale(guest, body() as any))).toBe(POS_ERROR_CODES.PDV_STOPPED);
      context.assertCashOpen.mockResolvedValue(undefined);
      context.load.mockRejectedValue(new ForbiddenException({ code: POS_ERROR_CODES.EVENT_NOT_SELLABLE }));
      expect(await codeOf(service.createSale(guest, body() as any))).toBe(POS_ERROR_CODES.EVENT_NOT_SELLABLE);
      expect(tx.salesTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('partage de l\'addition et pourboires', () => {
    const withTips = (enabled: boolean) =>
      context.load.mockResolvedValue({
        event: { id: 'event-1', name: 'PAUC - Caen', eventDate: new Date('2026-10-16') },
        elementName: 'Buvette Nord',
        settings: { promosEnabled: true, cancelEnabled: true, paymentMethodIds: [], lowStockUnits: 5, tipsEnabled: enabled },
        assignedMenuItemIds: new Set(['mi-1', 'mi-2', 'mi-neg']),
        responsibleHrPersonId: null,
      });

    it('pourboire refusé avec POS_TIPS_DISABLED quand les pourboires sont désactivés', async () => {
      expect(await codeOf(service.createSale(guest, body({ payments: [{ paymentMethodId: 'pm-cash', amountTtc: 11, tipTtc: 1 }] }) as any))).toBe(
        POS_ERROR_CODES.TIPS_DISABLED,
      );
      expect(tx.salesTransaction.create).not.toHaveBeenCalled();
    });

    it('un pourboire à 0 ou absent reste accepté même désactivé', async () => {
      await service.createSale(guest, body({ payments: [{ paymentMethodId: 'pm-cash', amountTtc: 11, tipTtc: 0 }] }) as any);
      expect(tx.salesTransaction.create.mock.calls[0][0].data.metadata.tipTotal).toBe(0);
    });

    it('pourboire hors CA et hors lignes : amount et items restent le total des articles, le pourboire vit dans metadata', async () => {
      withTips(true);
      const result = await service.createSale(guest, body({ payments: [{ paymentMethodId: 'pm-cash', amountTtc: 11, tipTtc: 1.234 }] }) as any);
      const data = tx.salesTransaction.create.mock.calls[0][0].data;
      expect(Number(data.amount)).toBe(11);
      expect(data.items.create.reduce((s: number, i: any) => s + Number(i.unitPrice) * i.quantity, 0)).toBe(11);
      expect(data.metadata.payments[0]).toMatchObject({ amountTtc: 11, tipTtc: 1.23 });
      expect(data.metadata.tipTotal).toBe(1.23);
      expect(result.sale.tipTotal).toBe(1.23);
      expect(result.sale.totalTtc).toBe(11);
      // Le delta SalesPriceAgg ne porte que les lignes d'articles.
      expect(priceAgg.applyDeltaSafe.mock.calls[0][2]).toHaveLength(2);
    });

    it('partage en plusieurs paiements avec un pourboire par part', async () => {
      withTips(true);
      const result = await service.createSale(
        guest,
        body({
          payments: [
            { paymentMethodId: 'pm-cash', amountTtc: 5.5, tipTtc: 0.5 },
            { paymentMethodId: 'pm-card', amountTtc: 5.5, tipTtc: 1 },
          ],
        }) as any,
      );
      expect(result.sale.payments.map((p) => [p.kind, p.amountTtc, p.tipTtc])).toEqual([['cash', 5.5, 0.5], ['card', 5.5, 1]]);
      expect(result.sale.tipTotal).toBe(1.5);
      expect(Number(tx.salesTransaction.create.mock.calls[0][0].data.amount)).toBe(11);
    });

    it('la somme des paiements se compare au total SANS les pourboires', async () => {
      withTips(true);
      expect(await codeOf(service.createSale(guest, body({ payments: [{ paymentMethodId: 'pm-cash', amountTtc: 12, tipTtc: 1 }] }) as any))).toBe(
        POS_SALE_ERROR_CODES.PAYMENT_MISMATCH,
      );
    });

    it('pourboire négatif ou sur une déconsigne refusé', async () => {
      withTips(true);
      expect(await codeOf(service.createSale(guest, body({ payments: [{ paymentMethodId: 'pm-cash', amountTtc: 11, tipTtc: -1 }] }) as any))).toBe(
        POS_SALE_ERROR_CODES.INVALID_TIP,
      );
      expect(
        await codeOf(
          service.createSale(guest, body({ lines: [{ menuItemId: 'mi-neg', quantity: 1 }], payments: [{ paymentMethodId: 'pm-cash', amountTtc: -1, tipTtc: 1 }] }) as any),
        ),
      ).toBe(POS_SALE_ERROR_CODES.INVALID_TIP);
    });
  });

  describe('déconsigne (prix négatif au catalogue)', () => {
    it('une ligne négative vient du prix négatif de l\'article, vendu en quantité positive', async () => {
      const result = await service.createSale(
        guest,
        body({ lines: [{ menuItemId: 'mi-2', quantity: 1 }, { menuItemId: 'mi-neg', quantity: 1 }], payments: [{ paymentMethodId: 'pm-cash', amountTtc: 2 }] }) as any,
      );
      const data = tx.salesTransaction.create.mock.calls[0][0].data;
      expect(Number(data.amount)).toBe(2);
      expect(Number(data.items.create[1].unitPrice)).toBe(-1);
      expect(data.items.create[1].quantity).toBe(1);
      expect(result.sale.totalTtc).toBe(2);
    });

    it('un ticket composé uniquement de déconsignes est négatif et se rembourse par un paiement négatif', async () => {
      await service.createSale(guest, body({ lines: [{ menuItemId: 'mi-neg', quantity: 2 }], payments: [{ paymentMethodId: 'pm-cash', amountTtc: -2 }] }) as any);
      expect(Number(tx.salesTransaction.create.mock.calls[0][0].data.amount)).toBe(-2);
    });

    it('le delta reçoit aussi la ligne négative (le moteur de delta ignore les prix négatifs)', async () => {
      await service.createSale(guest, body({ lines: [{ menuItemId: 'mi-neg', quantity: 1 }], payments: [{ paymentMethodId: 'pm-cash', amountTtc: -1 }] }) as any);
      expect(priceAgg.applyDeltaSafe.mock.calls[0][2]).toHaveLength(1);
    });
  });
});
