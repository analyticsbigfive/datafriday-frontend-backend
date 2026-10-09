import { StockItemIdentityService } from './stock-item-identity.service';

/** Résolution groupée du nombre d'unités par colis (mêmes règles que la version unitaire). */
describe('StockItemIdentityService.resolveUnitsPerPackForItemKeys', () => {
  const make = (rows: { mp?: any[]; comp?: any[]; mi?: any[] }) => {
    const prisma = {
      marketPrice: { findMany: jest.fn().mockResolvedValue(rows.mp ?? []) },
      menuComponent: { findMany: jest.fn().mockResolvedValue(rows.comp ?? []) },
      menuItem: { findMany: jest.fn().mockResolvedValue(rows.mi ?? []) },
    };
    return { prisma, service: new StockItemIdentityService(prisma as any) };
  };

  it('prix du marché, puis composant, puis article ; une requête par table pour tout le lot', async () => {
    const { prisma, service } = make({
      mp: [{ itemName: 'Coca 33cl', packedUnits: 24 }, { itemName: 'Frites', packedUnits: null }],
      comp: [{ name: 'Frites', packedUnits: 10 }],
      mi: [{ name: 'Hot-dog', inventoryNumberOfUnits: 6 }],
    });
    const map = await service.resolveUnitsPerPackForItemKeys(['coca 33CL', 'Frites', ' Hot-dog ', 'Inconnu'], 't1');
    expect(Object.fromEntries(map)).toEqual({ 'coca 33CL': 24, Frites: 10, 'Hot-dog': 6, Inconnu: null });
    expect(prisma.marketPrice.findMany).toHaveBeenCalledTimes(1);
  });

  it('garde la ligne la plus ancienne, même si son colis est vide (pas de repli sur un homonyme)', async () => {
    const { service } = make({ mp: [{ itemName: 'Badiane', packedUnits: null }, { itemName: 'Badiane', packedUnits: 12 }] });
    expect(await service.resolveUnitsPerPackForItemKey('Badiane', 't1')).toBeNull();
  });

  it("reproduit le joker % de l'ILIKE de Prisma", async () => {
    const { service } = make({ mp: [{ itemName: 'Heineken 0% - CAN 33CL', packedUnits: 24 }] });
    expect(await service.resolveUnitsPerPackForItemKey('Heineken 0% 33cl', 't1')).toBe(24);
  });
});
