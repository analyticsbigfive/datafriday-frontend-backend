import { BuilderV2ElementSettingsService } from './builder-v2-element-settings.service';

describe('BuilderV2ElementSettingsService.putInventory : marketPriceId conservé', () => {
  const build = (previous: any[], marketPrices: Array<{ id: string; itemName: string }>) => {
    const prisma: any = {
      elementInventory: {
        findMany: jest.fn().mockResolvedValue(previous),
        deleteMany: jest.fn().mockReturnValue('del'),
        createMany: jest.fn().mockReturnValue('create'),
      },
      marketPrice: {
        findMany: jest.fn(({ where }) =>
          Promise.resolve(where.id ? marketPrices.filter((m) => where.id.in.includes(m.id)) : marketPrices)),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const support: any = {
      getElementOrThrow: jest.fn().mockResolvedValue({ zone: { spaceId: 'sp1' } }),
      resolveElementConfigId: jest.fn().mockResolvedValue('c1'),
      invalidate: jest.fn(),
    };
    return { prisma, service: new BuilderV2ElementSettingsService(prisma, {} as any, support) };
  };

  it('DTO valide > ancienne ligne de même nom > résolution par nom', async () => {
    const { prisma, service } = build(
      [{ name: 'Vieux  Nom', marketPriceId: 'mp-prev' }],
      [{ id: 'mp-dto', itemName: 'A' }, { id: 'mp-prev', itemName: 'Vieux Nom' }, { id: 'mp-name', itemName: 'Café' }],
    );
    await service.putInventory('e1', 't1', {
      inventory: [
        { name: 'ancien', quantity: 1, marketPriceId: 'mp-dto' },
        { name: 'vieux nom', quantity: 2 },
        { name: 'café', quantity: 3 },
        { name: 'Saisi main', quantity: 4 },
      ],
    });
    const data = prisma.elementInventory.createMany.mock.calls[0][0].data;
    expect(data.map((d: any) => d.marketPriceId)).toEqual(['mp-dto', 'mp-prev', 'mp-name', null]);
    expect(data[0].name).toBe('A');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
