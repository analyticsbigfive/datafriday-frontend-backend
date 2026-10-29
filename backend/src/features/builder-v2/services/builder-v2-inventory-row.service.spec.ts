import { BadRequestException } from '@nestjs/common';
import { BuilderV2InventoryRowService } from './builder-v2-inventory-row.service';

describe('BuilderV2InventoryRowService', () => {
  const build = (
    memberIds: string[],
    existingByConfig: Record<string, any> = {},
    marketPrices: Array<{ id: string; itemName: string }> = [],
  ) => {
    const tx: any = {
      elementInventory: {
        findFirst: jest.fn(({ where }) => {
          const row = existingByConfig[String(where.configId)] ?? null;
          if (!row) return Promise.resolve(null);
          if (where.marketPriceId) return Promise.resolve(row.marketPriceId === where.marketPriceId ? row : null);
          return Promise.resolve(row);
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma: any = {
      configurationElement: { findMany: jest.fn().mockResolvedValue(memberIds.map((configId) => ({ configId }))) },
      marketPrice: {
        findMany: jest.fn(({ where }) =>
          Promise.resolve(where.id ? marketPrices.filter((m) => where.id.in.includes(m.id)) : marketPrices)),
      },
      elementInventory: { findMany: jest.fn().mockResolvedValue([{ id: 'r' }]) },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const support: any = {
      getElementOrThrow: jest.fn().mockResolvedValue({ zone: { spaceId: 'sp1' } }),
      invalidate: jest.fn(),
    };
    return { tx, prisma, support, service: new BuilderV2InventoryRowService(prisma, support) };
  };

  it('crée la ligne dans chaque config membre quand configId est absent', async () => {
    const { tx, support, prisma, service } = build(['c1', 'c2']);
    const res = await service.upsertRow('e1', 't1', { name: 'Bière', quantity: 5, isStored: true }, undefined, { id: 'u' } as any);
    expect(tx.elementInventory.create).toHaveBeenCalledTimes(2);
    expect(tx.elementInventory.create.mock.calls[0][0].data).toMatchObject({
      elementId: 'e1', configId: 'c1', name: 'Bière', quantity: 5, isStored: true, isCustom: true, menuItemId: null,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(support.invalidate).toHaveBeenCalledWith('t1', 'sp1');
    expect(res).toEqual([{ id: 'r' }]);
  });

  it('met à jour uniquement les champs fournis sur une ligne existante', async () => {
    const { tx, service } = build(['c1'], { c1: { id: 'row1' } });
    await service.upsertRow('e1', 't1', { name: 'Bière', isStored: false, maxStock: null });
    expect(tx.elementInventory.create).not.toHaveBeenCalled();
    expect(tx.elementInventory.update).toHaveBeenCalledWith({
      where: { id: 'row1' },
      data: { isStored: false, maxStock: null },
    });
  });

  it('quantity vaut 0 par défaut à la création', async () => {
    const { tx, service } = build(['c1']);
    await service.upsertRow('e1', 't1', { name: 'X' });
    expect(tx.elementInventory.create.mock.calls[0][0].data.quantity).toBe(0);
  });

  it('cible une seule config et vérifie l appartenance', async () => {
    const { tx, service } = build(['c1', 'c2']);
    await service.upsertRow('e1', 't1', { name: 'X' }, 'c2');
    expect(tx.elementInventory.create).toHaveBeenCalledTimes(1);
    expect(tx.elementInventory.create.mock.calls[0][0].data.configId).toBe('c2');
    await expect(service.upsertRow('e1', 't1', { name: 'X' }, 'zz')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('utilise configId null quand l élément n a aucune config', async () => {
    const { tx, service } = build([]);
    await service.upsertRow('e1', 't1', { name: 'X' });
    expect(tx.elementInventory.create.mock.calls[0][0].data.configId).toBeNull();
  });

  it('résout marketPriceId par id (nom du MP), côté serveur', async () => {
    const { tx, service } = build(['c1'], {}, [{ id: 'mp1', itemName: 'Bière Blonde' }]);
    await service.upsertRow('e1', 't1', { name: 'ancien nom', marketPriceId: 'mp1', isStored: true });
    expect(tx.elementInventory.create.mock.calls[0][0].data).toMatchObject({ name: 'Bière Blonde', marketPriceId: 'mp1' });
  });

  it('repli sur le nom normalisé dans le tenant quand aucun id n est fourni', async () => {
    const { tx, service } = build(['c1'], {}, [{ id: 'mp1', itemName: 'Bière  Blonde' }]);
    await service.upsertRow('e1', 't1', { name: ' bière blonde ' });
    expect(tx.elementInventory.create.mock.calls[0][0].data.marketPriceId).toBe('mp1');
  });

  it('ignore un marketPriceId étranger au tenant (null si le nom ne matche pas)', async () => {
    const { tx, service } = build(['c1'], {}, [{ id: 'mp1', itemName: 'Autre' }]);
    await service.upsertRow('e1', 't1', { name: 'Bière', marketPriceId: 'mp-etranger' });
    expect(tx.elementInventory.create.mock.calls[0][0].data.marketPriceId).toBeNull();
  });

  it('complète marketPriceId sur une ligne historique trouvée par nom', async () => {
    const { tx, service } = build(['c1'], { c1: { id: 'row1', name: 'Bière', marketPriceId: null } }, [{ id: 'mp1', itemName: 'Bière' }]);
    await service.upsertRow('e1', 't1', { name: 'Bière', marketPriceId: 'mp1', isStored: true });
    expect(tx.elementInventory.create).not.toHaveBeenCalled();
    expect(tx.elementInventory.update).toHaveBeenCalledWith({
      where: { id: 'row1' },
      data: { isStored: true, marketPriceId: 'mp1' },
    });
  });

  it('retrouve d abord la ligne par marketPriceId même si son nom est obsolète et la renomme', async () => {
    const { tx, service } = build(['c1'], { c1: { id: 'row1', name: 'Ancien', marketPriceId: 'mp1' } }, [{ id: 'mp1', itemName: 'Nouveau' }]);
    await service.upsertRow('e1', 't1', { name: 'Nouveau', marketPriceId: 'mp1', quantity: 3 });
    expect(tx.elementInventory.create).not.toHaveBeenCalled();
    expect(tx.elementInventory.update).toHaveBeenCalledWith({
      where: { id: 'row1' },
      data: { quantity: 3, name: 'Nouveau' },
    });
  });
});
