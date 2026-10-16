import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/database/prisma.service';
import { MenuItemPricingService } from '../pricing/menu-item-pricing.service';
import { SaleLinePricingService } from './sale-line-pricing.service';

const item = (over: Record<string, unknown> = {}) => ({
  id: 'mi-1',
  name: 'Bière 25cl',
  basePrice: 5,
  vatRate: null,
  discountType: null,
  discountValue: null,
  productCategory: { id: 'cat-1', name: 'Boissons' },
  promotion: null,
  comboChildren: [],
  ...over,
});

describe('SaleLinePricingService', () => {
  let service: SaleLinePricingService;
  const prisma = { menuItem: { findMany: jest.fn() }, spaceMenuItem: { findMany: jest.fn() } };
  const pricing = { getTenantDefaultVatRate: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.spaceMenuItem.findMany.mockResolvedValue([]);
    pricing.getTenantDefaultVatRate.mockResolvedValue(20);
    const module = await Test.createTestingModule({
      providers: [
        SaleLinePricingService,
        { provide: PrismaService, useValue: prisma },
        { provide: MenuItemPricingService, useValue: pricing },
      ],
    }).compile();
    service = module.get(SaleLinePricingService);
  });

  it("n'interroge rien sans article", async () => {
    expect((await service.resolveLines('t1', 's1', [], true)).size).toBe(0);
    expect(prisma.menuItem.findMany).not.toHaveBeenCalled();
  });

  it('borne la lecture au tenant et exclut les articles supprimés', async () => {
    prisma.menuItem.findMany.mockResolvedValue([item()]);
    await service.resolveLines('t1', 's1', ['mi-1', 'mi-1'], true);
    expect(prisma.menuItem.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['mi-1'] }, tenantId: 't1', deletedAt: null });
    expect(prisma.spaceMenuItem.findMany.mock.calls[0][0].where).toEqual({ spaceId: 's1', menuItemId: { in: ['mi-1'] } });
  });

  it('TVA en cascade : espace, puis article, puis défaut du tenant', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      item({ id: 'a', vatRate: 10 }),
      item({ id: 'b', vatRate: 10 }),
      item({ id: 'c', vatRate: null }),
    ]);
    prisma.spaceMenuItem.findMany.mockResolvedValue([{ menuItemId: 'b', priceTtc: 7, vatRate: 5.5, discountType: null, discountValue: null }]);
    const out = await service.resolveLines('t1', 's1', ['a', 'b', 'c'], true);
    expect(out.get('a')!.vatRate).toBe(10);
    expect(out.get('b')!.vatRate).toBe(5.5);
    expect(out.get('b')!.unitPrice).toBe(7);
    expect(out.get('c')!.vatRate).toBe(20);
  });

  it('applique la promotion active et le libellé de son type', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      item({ discountType: 'percent', discountValue: 20, promotion: { isActive: true, promotionType: { name: 'Happy-Hour' } } }),
    ]);
    const line = (await service.resolveLines('t1', 's1', ['mi-1'], true)).get('mi-1')!;
    expect(line).toMatchObject({ unitPrice: 4, originalUnitPrice: 5, promotionLabel: 'Happy-Hour', categoryId: 'cat-1', categoryLabel: 'Boissons' });
  });

  it('décrit la composition d\'un combo', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      item({ comboChildren: [{ quantity: 1, child: { name: 'Burger' } }, { quantity: 2, child: { name: 'Frites' } }] }),
    ]);
    expect((await service.resolveLines('t1', 's1', ['mi-1'], true)).get('mi-1')!.note).toBe('1 x Burger, 2 x Frites');
  });
});
