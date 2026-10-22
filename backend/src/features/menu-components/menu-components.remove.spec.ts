import { ConflictException } from '@nestjs/common';
import { createMenuComponentsServices } from './services/menu-components-services.testing';

function build(parentCount: number, itemCount: number) {
  const prisma: any = {
    menuComponent: { update: jest.fn().mockResolvedValue({ id: 'c1' }) },
    componentComponent: {
      count: jest.fn().mockResolvedValue(parentCount),
      findMany: jest.fn().mockResolvedValue(parentCount ? [{ parent: { name: 'Sauce' } }] : []),
    },
    menuItemComponent: {
      count: jest.fn().mockResolvedValue(itemCount),
      findMany: jest.fn().mockResolvedValue(itemCount ? [{ menuItem: { name: 'Burger' } }] : []),
    },
  };
  const { menuComponentsService } = createMenuComponentsServices({ prisma, redis: {} });
  jest.spyOn(menuComponentsService, 'findOne').mockResolvedValue({ id: 'c1' } as any);
  (menuComponentsService as any).listCache = { invalidate: jest.fn() };
  return { service: menuComponentsService, prisma };
}

describe('MenuComponentsService.remove', () => {
  it('refuse (409) si utilisé comme enfant ou dans un article', async () => {
    const { service, prisma } = build(1, 1);
    await expect(service.remove('c1', 'tenant-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.menuComponent.update).not.toHaveBeenCalled();
  });

  it('supprime (soft) si inutilisé', async () => {
    const { service, prisma } = build(0, 0);
    await service.remove('c1', 'tenant-1');
    expect(prisma.menuComponent.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { deletedAt: expect.any(Date) } });
  });
});
