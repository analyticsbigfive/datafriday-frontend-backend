import { PackagingService } from './packaging.service';

function build() {
  const prisma: any = {
    packaging: {
      findFirst: jest.fn().mockResolvedValue({ id: 'pk-1', costPerRecipeUnit: '0.2', marketPriceId: null }),
      update: jest.fn().mockResolvedValue({ id: 'pk-1' }),
    },
  };
  const propagation = { propagateFromBricks: jest.fn().mockResolvedValue({ components: 0, menuItems: 0 }) };
  return { service: new PackagingService(prisma, propagation as any), propagation };
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
