import { BuilderV2Service } from './builder-v2.service';

// Clonage d'une configuration : les PdV (adhésions) ET leurs menus Space Menu, scopés par
// configuration (MenuAssignment.configId), doivent suivre. Constaté Aix Arena 2026-09-23/24 :
// 10 configs clonées sans aucun article, Event Predict « No items available ».
describe('BuilderV2Service.createConfiguration (clonage)', () => {
  let prisma: any;
  let service: BuilderV2Service;

  beforeEach(() => {
    prisma = {
      config: { create: jest.fn().mockResolvedValue({ id: 'cfg-new', name: 'Concert 1000/2000 pax' }) },
      configurationElement: {
        findMany: jest.fn().mockResolvedValue([{ elementId: 'shop-1' }, { elementId: 'shop-2' }]),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      menuAssignment: {
        findMany: jest.fn().mockResolvedValue([
          { elementId: 'shop-1', menuItemId: 'mi-1664', enabled: true },
          { elementId: 'shop-2', menuItemId: 'mi-frites', enabled: false },
        ]),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    service = new BuilderV2Service(prisma, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'getSpaceOrThrow').mockResolvedValue({ id: 'space-1' });
    jest.spyOn(service as any, 'getConfigOrThrow').mockResolvedValue({ id: 'cfg-src', spaceId: 'space-1', capacity: 2000 });
    jest.spyOn(service as any, 'invalidate').mockResolvedValue(undefined);
  });

  it('recopie les menus des PdV de la config source, cochés comme décochés', async () => {
    await service.createConfiguration('space-1', 'tenant-1', { name: 'Concert 1000/2000 pax', cloneFromConfigId: 'cfg-src' } as any);
    expect(prisma.menuAssignment.findMany).toHaveBeenCalledWith({
      where: { configId: 'cfg-src', elementId: { not: null } },
      select: { elementId: true, menuItemId: true, enabled: true },
    });
    expect(prisma.menuAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { configId: 'cfg-new', elementId: 'shop-1', menuItemId: 'mi-1664', enabled: true },
        { configId: 'cfg-new', elementId: 'shop-2', menuItemId: 'mi-frites', enabled: false },
      ],
      skipDuplicates: true,
    });
  });

  it('config créée de zéro : aucune copie', async () => {
    await service.createConfiguration('space-1', 'tenant-1', { name: 'Vide' } as any);
    expect(prisma.configurationElement.findMany).not.toHaveBeenCalled();
    expect(prisma.menuAssignment.findMany).not.toHaveBeenCalled();
  });
});
