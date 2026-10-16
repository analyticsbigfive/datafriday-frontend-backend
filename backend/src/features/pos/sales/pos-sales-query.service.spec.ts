import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/database/prisma.service';
import { PosSalesQueryService } from './pos-sales-query.service';

const scope = { tenantId: 'tenant-1', spaceId: 'space-1', eventId: 'event-1', elementId: 'pdv-1' };

const record = (n: number, over: Record<string, unknown> = {}) => ({
  id: `sale-${n}`,
  amount: 10,
  transactionDate: new Date(`2026-10-16T20:${String(60 - n).padStart(2, '0')}:00Z`),
  deletedAt: null,
  locationName: 'Buvette Nord',
  metadata: {
    ticketNumber: n,
    elementId: 'pdv-1',
    vendorName: 'Marie',
    payments: [{ paymentMethodId: 'pm-cash', name: 'Espèces', kind: 'cash', amountTtc: 10 }],
  },
  items: [{ productName: 'Bière', quantity: 2, unitPrice: 5, vat: 10, rawData: { menuItemId: 'mi-1' } }],
  ...over,
});

const tipped = (n: number, vendor: string, lines: Array<[string, string, number, number]>) =>
  record(n, {
    metadata: {
      ticketNumber: n,
      elementId: 'pdv-1',
      vendorName: vendor,
      payments: lines.map(([id, kind, amountTtc, tipTtc]) => ({ paymentMethodId: id, name: id, kind, amountTtc, tipTtc })),
    },
  });

describe('PosSalesQueryService', () => {
  let service: PosSalesQueryService;
  const pageCalls = () => prisma.salesTransaction.findMany.mock.calls.filter((c: any[]) => c[0].take !== undefined);
  const prisma = {
    salesEvent: { findMany: jest.fn() },
    salesLocation: { findMany: jest.fn() },
    salesTransaction: { findMany: jest.fn(), aggregate: jest.fn(), count: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.salesEvent.findMany.mockResolvedValue([{ id: 'se-1' }]);
    prisma.salesLocation.findMany.mockResolvedValue([{ id: 'loc-1' }]);
    prisma.salesTransaction.findMany.mockResolvedValue([]);
    prisma.salesTransaction.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: null } });
    prisma.salesTransaction.count.mockResolvedValue(0);
    const module = await Test.createTestingModule({
      providers: [PosSalesQueryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PosSalesQueryService);
  });

  describe('list', () => {
    it('borne la requête au tenant, aux ventes POS valides, à l\'évènement et au PdV', async () => {
      await service.list(scope, {});
      expect(prisma.salesEvent.findMany.mock.calls[0][0].where).toEqual({
        tenantId: 'tenant-1',
        externalId: 'event-1',
        integration: { provider: 'POS' },
      });
      expect(prisma.salesLocation.findMany.mock.calls[0][0].where).toMatchObject({ externalId: 'pdv-1' });
      const call = pageCalls()[0][0];
      expect(call.where).toEqual({ tenantId: 'tenant-1', status: 'V', provider: 'POS', eventId: { in: ['se-1'] }, locationId: { in: ['loc-1'] } });
      expect(call.orderBy).toEqual([{ transactionDate: 'desc' }, { id: 'desc' }]);
    });

    it('50 par défaut, 200 au plus', async () => {
      await service.list(scope, {});
      expect(pageCalls()[0][0].take).toBe(51);
      await service.list(scope, { limit: 5000 });
      expect(pageCalls()[1][0].take).toBe(201);
      await service.list(scope, { limit: 10 });
      expect(pageCalls()[2][0].take).toBe(11);
    });

    it('pagine par curseur et renvoie le suivant seulement s\'il reste des lignes', async () => {
      prisma.salesTransaction.findMany.mockResolvedValue([record(1), record(2), record(3)]);
      const page = await service.list(scope, { limit: 2 });
      expect(page.rows.map((r) => r.ticketNumber)).toEqual([1, 2]);
      expect(page.nextCursor).toBeTruthy();

      prisma.salesTransaction.findMany.mockResolvedValue([record(3)]);
      const next = await service.list(scope, { limit: 2, cursor: page.nextCursor! });
      const where = pageCalls()[1][0].where;
      expect(where.AND[1].OR[0]).toEqual({ transactionDate: { lt: record(2).transactionDate } });
      expect(where.AND[1].OR[1]).toEqual({ transactionDate: record(2).transactionDate, id: { lt: 'sale-2' } });
      expect(next.nextCursor).toBeNull();
    });

    it('filtre par moyen de paiement et recherche numéro ou vendeur', async () => {
      await service.list(scope, { paymentMethodId: 'pm-card', search: 'marie' });
      const and = pageCalls()[0][0].where.AND;
      expect(and[0]).toEqual({ metadata: { path: ['payments'], array_contains: [{ paymentMethodId: 'pm-card' }] } });
      expect(and[1].OR).toEqual(expect.arrayContaining([{ metadata: { path: ['vendorName'], string_contains: 'Marie' } }]));
      await service.list(scope, { search: '12' });
      const numeric = pageCalls()[1][0].where.AND[0].OR;
      expect(numeric).toEqual(expect.arrayContaining([{ metadata: { path: ['ticketNumber'], equals: 12 } }]));
    });

    it('totaux : ventes actives et CA séparés des annulées, annulées toujours listées', async () => {
      prisma.salesTransaction.findMany.mockResolvedValue([record(1), record(2, { deletedAt: new Date() })]);
      prisma.salesTransaction.aggregate.mockResolvedValue({ _count: { _all: 7 }, _sum: { amount: 70.5 } });
      prisma.salesTransaction.count.mockResolvedValue(2);
      const page = await service.list(scope, {});
      expect(page.rows.map((r) => r.cancelled)).toEqual([false, true]);
      expect(page.totals).toEqual({ tickets: 7, cancelled: 2, revenueTtc: 70.5, tipsTtc: 0 });
      expect(prisma.salesTransaction.aggregate.mock.calls[0][0].where.deletedAt).toBeNull();
    });

    it('page vide sans requête sur les transactions quand aucune vente POS n\'existe encore', async () => {
      prisma.salesEvent.findMany.mockResolvedValue([]);
      const page = await service.list(scope, {});
      expect(page).toEqual({ rows: [], nextCursor: null, totals: { tickets: 0, cancelled: 0, revenueTtc: 0, tipsTtc: 0 } });
      expect(prisma.salesTransaction.findMany).not.toHaveBeenCalled();
    });

    it('mappe la ligne d\'historique du contrat', async () => {
      prisma.salesTransaction.findMany.mockResolvedValue([record(4)]);
      const [row] = (await service.list(scope, {})).rows;
      expect(row).toMatchObject({
        id: 'sale-4',
        ticketNumber: 4,
        elementId: 'pdv-1',
        pdvName: 'Buvette Nord',
        vendorName: 'Marie',
        totalTtc: 10,
        vatTotal: 0.91,
        cancelled: false,
        syncStatus: 'synced',
        lines: [{ menuItemId: 'mi-1', name: 'Bière', quantity: 2, unitPrice: 5, totalTtc: 10, vatRate: 10 }],
      });
    });
  });

  describe('pourboires', () => {
    it('totals.tipsTtc ne lit que les tickets actifs qui portent un pourboire', async () => {
      prisma.salesTransaction.findMany.mockImplementation(async (args: any) =>
        args.select?.metadata && !args.select?.id ? [tipped(1, 'Marie', [['pm-cash', 'cash', 10, 1.5]]), tipped(2, 'Paul', [['pm-card', 'card', 5, 1], ['pm-cash', 'cash', 5, 0.5]])] : [],
      );
      const page = await service.list(scope, {});
      expect(page.totals.tipsTtc).toBe(3);
      const tipCall = prisma.salesTransaction.findMany.mock.calls.find((c: any[]) => c[0].select?.metadata && !c[0].select?.id)![0];
      expect(tipCall.where.AND[0].deletedAt).toBeNull();
      expect(tipCall.where.AND[1]).toEqual({ metadata: { path: ['tipTotal'], gt: 0 } });
    });

    it('un ticket ancien sans tipTtc compte pour 0', async () => {
      prisma.salesTransaction.findMany.mockResolvedValue([record(1)]);
      expect((await service.list(scope, {})).rows[0]).toMatchObject({ tipTotal: 0, payments: [{ tipTtc: 0 }] });
    });
  });

  describe('closing', () => {
    it('somme les paiements par moyen (copie figée), la TVA et le CA des ventes actives', async () => {
      prisma.salesTransaction.findMany.mockResolvedValue([
        record(1),
        record(2, { metadata: { payments: [{ paymentMethodId: 'pm-card', name: 'Carte', kind: 'card', amountTtc: 10 }] } }),
        record(3),
      ]);
      prisma.salesTransaction.count.mockResolvedValue(1);
      const closing = await service.closing(scope);
      expect(closing).toEqual({
        tickets: 3,
        cancelled: 1,
        byPaymentMethod: [
          { paymentMethodId: 'pm-card', name: 'Carte', kind: 'card', amountTtc: 10, tipTtc: 0 },
          { paymentMethodId: 'pm-cash', name: 'Espèces', kind: 'cash', amountTtc: 20, tipTtc: 0 },
        ],
        vatTotal: 2.73,
        revenueTtc: 30,
        tips: { totalTtc: 0, byVendor: [] },
      });
      expect(prisma.salesTransaction.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
    });

    it('pourboires par moyen de paiement et par vendeur, hors CA ; les annulés sont exclus par la requête', async () => {
      prisma.salesTransaction.findMany.mockResolvedValue([
        tipped(1, 'Marie', [['pm-cash', 'cash', 10, 1.5]]),
        tipped(2, 'Paul', [['pm-card', 'card', 5, 1], ['pm-cash', 'cash', 5, 0.5]]),
        tipped(3, 'Marie', [['pm-card', 'card', 10, 2]]),
        tipped(4, 'Paul', [['pm-cash', 'cash', 10, 0]]),
      ]);
      const closing = await service.closing(scope);
      expect(closing.byPaymentMethod).toEqual([
        { paymentMethodId: 'pm-card', name: 'pm-card', kind: 'card', amountTtc: 15, tipTtc: 3 },
        { paymentMethodId: 'pm-cash', name: 'pm-cash', kind: 'cash', amountTtc: 25, tipTtc: 2 },
      ]);
      expect(closing.tips).toEqual({
        totalTtc: 5,
        byVendor: [
          { vendorName: 'Marie', tipTtc: 3.5, tickets: 2 },
          { vendorName: 'Paul', tipTtc: 1.5, tickets: 1 },
        ],
      });
      expect(closing.revenueTtc).toBe(40); // `amount` des tickets, sans les pourboires
      expect(prisma.salesTransaction.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
    });

    it('vide sans vente', async () => {
      prisma.salesEvent.findMany.mockResolvedValue([]);
      expect(await service.closing(scope)).toEqual({ tickets: 0, cancelled: 0, byPaymentMethod: [], vatTotal: 0, revenueTtc: 0, tips: { totalTtc: 0, byVendor: [] } });
    });
  });

  describe('nextTicketNumber', () => {
    it('compte toutes les ventes du PdV, annulées comprises, plus un', async () => {
      prisma.salesTransaction.count.mockResolvedValue(11);
      expect(await service.nextTicketNumber(scope)).toBe(12);
      expect(prisma.salesTransaction.count.mock.calls[0][0].where).not.toHaveProperty('deletedAt');
      prisma.salesEvent.findMany.mockResolvedValue([]);
      expect(await service.nextTicketNumber(scope)).toBe(1);
    });
  });
});
