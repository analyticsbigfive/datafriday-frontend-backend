import { ConflictException } from '@nestjs/common';
import { PackagingService } from './packaging.service';

function build() {
  const prisma: any = {
    packaging: {
      findFirst: jest.fn().mockResolvedValue({ id: 'pk-1', costPerRecipeUnit: '0.2', marketPriceId: null }),
      update: jest.fn().mockResolvedValue({ id: 'pk-1' }),
    },
  };
  const propagation = { propagateFromBricks: jest.fn().mockResolvedValue({ components: 0, menuItems: 0 }) };
  return { service: new PackagingService(prisma, propagation as any), propagation, prisma };
}

describe('PackagingService.update propagation', () => {
  it('propage packaging_edit quand le coût change', async () => {
    const { service, propagation } = build();
    await service.update('pk-1', { costPerRecipeUnit: 0.3 }, 'tenant-1');
    expect(propagation.propagateFromBricks).toHaveBeenCalledWith({ packagingIds: ['pk-1'] }, 'tenant-1', 'packaging_edit', { packagingId: 'pk-1' });
  });

  it('ne propage pas sans changement de coût', async () => {
    const { service, propagation } = build();
    await service.update('pk-1', { name: 'Boite', costPerRecipeUnit: 0.2 }, 'tenant-1');
    expect(propagation.propagateFromBricks).not.toHaveBeenCalled();
  });
});

describe('PackagingService.remove', () => {
  const usageTable = (count: number) => ({
    count: jest.fn().mockResolvedValue(count),
    findMany: jest.fn().mockResolvedValue(count ? [{ menuItem: { name: 'Burger' } }] : []),
  });

  it('refuse (409) si utilisé dans un article', async () => {
    const { service, prisma } = build();
    prisma.menuItemPackaging = usageTable(1);
    await expect(service.remove('pk-1', 'tenant-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.packaging.update).not.toHaveBeenCalled();
  });

  it('supprime (soft) si inutilisé', async () => {
    const { service, prisma } = build();
    prisma.menuItemPackaging = usageTable(0);
    await service.remove('pk-1', 'tenant-1');
    expect(prisma.packaging.update).toHaveBeenCalledWith({ where: { id: 'pk-1' }, data: { deletedAt: expect.any(Date) } });
  });
});
