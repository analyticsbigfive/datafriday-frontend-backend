import { createBuilderV2Services } from './services/builder-v2-services.testing';

// Clonage d'une configuration : les PdV (adhésions) ET leurs menus Space Menu, scopés par
// configuration (MenuAssignment.configId), doivent suivre. Constaté Aix Arena 2026-09-23/24 :
// 10 configs clonées sans aucun article, Event Predict « No items available ».
describe('BuilderV2ConfigurationService.createConfiguration (clonage)', () => {
  let prisma: any;
  let builderV2SupportService: any;
  let builderV2ConfigurationService: any;

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
    ({ builderV2SupportService, builderV2ConfigurationService } = createBuilderV2Services({ prisma: prisma, spaceCacheService: {} as any, storage: {} as any, staffingCalculator: {} as any, spaceAccess: {} as any }));
    jest.spyOn(builderV2SupportService as any, 'getSpaceOrThrow').mockResolvedValue({ id: 'space-1' });
    jest.spyOn(builderV2SupportService as any, 'getConfigOrThrow').mockResolvedValue({ id: 'cfg-src', spaceId: 'space-1', capacity: 2000 });
    jest.spyOn(builderV2SupportService as any, 'invalidate').mockResolvedValue(undefined);
  });

  it('recopie les menus des PdV de la config source, cochés comme décochés', async () => {
    await builderV2ConfigurationService.createConfiguration('space-1', 'tenant-1', { name: 'Concert 1000/2000 pax', cloneFromConfigId: 'cfg-src' } as any);
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
    await builderV2ConfigurationService.createConfiguration('space-1', 'tenant-1', { name: 'Vide' } as any);
    expect(prisma.configurationElement.findMany).not.toHaveBeenCalled();
    expect(prisma.menuAssignment.findMany).not.toHaveBeenCalled();
  });
});
