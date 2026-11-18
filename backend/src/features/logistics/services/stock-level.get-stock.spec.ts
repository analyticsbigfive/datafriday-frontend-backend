import { NotFoundException } from '@nestjs/common';
import * as eventWindow from '../../../shared/utils/event-window.util';
import { StockLevelService } from './stock-level.service';
import { StockReferentialService } from './stock-referential.service';
import { LogisticsElementScopeService } from './logistics-element-scope.service';

/**
 * GET /logistics/:spaceId/stock : une seule lecture de `Space`, et les niveaux de stock
 * se calculent EN MÊME TEMPS que le référentiel d'éléments (qui n'attend les niveaux
 * qu'au filtre des PDV affichés). Même réponse qu'avant, quel que soit l'ordre d'arrivée.
 */

const NOW_PLUS_10_DAYS = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

const biere = {
  name: 'Bière', id: 'mp-biere', kind: 'ingredient', refKind: 'marketPrice', unit: 'L',
  marketPriceId: 'mp-biere', unitsPerPack: 24, packagingType: 'Caisse', picture: null,
  usedIn: [{ id: 'mi-1', name: 'Pinte' }],
};

const shopElement = (id: string, name: string, menuAssignments: any[]) => ({
  id, name, type: 'shop', attributes: {}, floor: null, forecourt: null, externalMerch: null,
  configurationElements: [{ configId: 'cfg-a' }], menuAssignments,
});

const level = (over: any) => ({
  elementId: 'shop-a', itemKey: 'Bière', itemKind: null, itemRefId: null, marketPriceId: 'mp-biere',
  unitsPerPack: 24, packedUnits: 2, looseUnits: 0, ...over,
});

interface Gates {
  /** Retient la lecture des niveaux tant que le test n'a pas appelé `release`. */
  holdLevels?: boolean;
  levelsError?: Error;
}

function build(gates: Gates = {}) {
  let release: () => void = () => undefined;
  const levelsGate = new Promise<void>((resolve) => { release = resolve; });
  const levels = [level({}), level({ elementId: 'shop-b', itemKey: 'Eau', marketPriceId: null, packedUnits: 0, looseUnits: 5 })];

  const prisma: any = {
    space: { findFirst: jest.fn().mockResolvedValue({ id: 'sp', name: 'Stade', timezone: 'Europe/Paris' }) },
    config: { findMany: jest.fn().mockResolvedValue([{ id: 'cfg-a', name: 'A' }, { id: 'cfg-b', name: 'B' }]) },
    event: {
      findFirst: jest.fn().mockResolvedValue({ configurationId: 'cfg-b' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'ev-next', eventDate: NOW_PLUS_10_DAYS, eventStartDate: null, eventEndDate: null, eventEndTime: null, sessions: null }]),
    },
    stockLevel: {
      findMany: jest.fn().mockImplementation(async () => {
        if (gates.levelsError) throw gates.levelsError;
        if (gates.holdLevels) await levelsGate;
        return levels;
      }),
    },
    stockReconciliation: { findFirst: jest.fn().mockResolvedValue({ id: 'reco-1', createdAt: new Date('2026-11-01T10:00:00Z'), eventId: null }) },
    stockMovement: { findFirst: jest.fn().mockResolvedValue(null) },
    spaceElement: {
      findMany: jest.fn().mockResolvedValue([
        shopElement('shop-a', 'Buvette A', [{ menuItemId: 'mi-1', enabled: true, configId: 'cfg-b' }]),
        // Sans menu actif mais avec du stock : n'apparait que grace aux niveaux.
        shopElement('shop-b', 'Buvette B', []),
        // Sans menu ni stock : masque.
        shopElement('shop-c', 'Buvette C', []),
      ]),
    },
    menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'mi-1' }]) },
    elementInventory: { findMany: jest.fn().mockResolvedValue([]) },
    marketPrice: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const scope = Object.create(LogisticsElementScopeService.prototype) as LogisticsElementScopeService;
  (scope as any).getSpaceElementIds = jest.fn().mockResolvedValue(['shop-a', 'shop-b', 'shop-c']);
  (scope as any).spaceElementScopeWhere = () => ({});
  (scope as any).getProviderByShopElementId = jest.fn().mockResolvedValue(new Map());
  (scope as any).floorGroupIdOf = () => null;

  const recipe: any = {
    recipeSelect: () => ({}),
    loadRecipeContext: jest.fn().mockResolvedValue({}),
    aggregateItems: (menuItems: any[]) => new Map(menuItems.length ? [[biere.name, { ...biere }]] : []),
    deriveSalesRaw: jest.fn().mockResolvedValue([]),
    explodeSalesToConsumption: jest.fn().mockResolvedValue([{ elementId: 'shop-a', itemKey: 'Bière', quantity: 3 }]),
  };

  const referential = new StockReferentialService(prisma, {} as any, scope, recipe);
  const service = new StockLevelService(prisma, {} as any, scope, recipe, {} as any, referential);
  return { service, prisma, referential, release };
}

const expectedResponse = () => ({
  spaceId: 'sp',
  space: { id: 'sp', name: 'Stade' },
  configurations: [{ id: 'cfg-a', name: 'A' }, { id: 'cfg-b', name: 'B' }],
  resolvedConfigId: 'cfg-b',
  nextEventId: 'ev-next',
  anchor: { at: new Date('2026-11-01T10:00:00Z'), reconciliationId: 'reco-1' },
  elements: [
    { id: 'shop-a', name: 'Buvette A', type: 'shop', items: [{ ...biere }], provider: null, floorGroupId: null },
    // Buvette B : pas de menu, mais 5 unites en stock. Son niveau "Eau" est orphelin, ajoute en ligne minimale.
    {
      id: 'shop-b', name: 'Buvette B', type: 'shop', provider: null, floorGroupId: null,
      items: [{ name: 'Eau', id: 'Eau', kind: 'product', refKind: null, unit: null, marketPriceId: null, unitsPerPack: 24, packagingType: null, picture: null, usedIn: [] }],
    },
  ],
  levels: [level({}), level({ elementId: 'shop-b', itemKey: 'Eau', marketPriceId: null, packedUnits: 0, looseUnits: 5 })],
  consumption: [{ elementId: 'shop-a', itemKey: 'Bière', quantity: 3 }],
});

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('StockLevelService.getStock : lecture unique de Space et branches en parallele', () => {
  it('ne lit Space qu une fois (nom + fuseau) et transmet le fuseau au calcul du prochain match', async () => {
    const pick = jest.spyOn(eventWindow, 'pickNextEventBeforeDoorsOpen');
    const { service, prisma } = build();
    prisma.space.findFirst.mockResolvedValue({ id: 'sp', name: 'Stade', timezone: 'Africa/Abidjan' });

    await service.getStock('sp', 't', undefined, 'ev-1');

    expect(prisma.space.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.space.findFirst).toHaveBeenCalledWith({ where: { id: 'sp', tenantId: 't' }, select: { id: true, name: true, timezone: true } });
    expect(pick).toHaveBeenCalledWith(expect.any(Array), 'Africa/Abidjan', expect.any(Date));
    pick.mockRestore();
  });

  it('renvoie exactement la meme reponse (space = { id, name } sans fuseau, config de l event, PDV en stock)', async () => {
    const { service } = build();
    const res = await service.getStock('sp', 't', undefined, 'ev-1');
    expect(res).toEqual(expectedResponse());
    expect(Object.keys(res.space).sort()).toEqual(['id', 'name']);
  });

  it('meme reponse que les niveaux arrivent avant ou apres la config effective et le referentiel', async () => {
    const fast = await build().service.getStock('sp', 't', undefined, 'ev-1');

    const slow = build({ holdLevels: true });
    const pending = slow.service.getStock('sp', 't', undefined, 'ev-1');
    await tick();
    await tick();
    slow.release();
    expect(await pending).toEqual(fast);
  });

  it('le referentiel d elements demarre pendant que les niveaux sont encore en cours', async () => {
    const { service, prisma, referential, release } = build({ holdLevels: true });
    const getElements = jest.spyOn(referential, 'getSpaceElementsWithItems');
    const pending = service.getStock('sp', 't', undefined, 'ev-1');
    await tick();
    await tick();

    // Niveaux toujours bloques : le referentiel a deja lu les elements, les menus et les inventaires.
    expect(prisma.spaceElement.findMany).toHaveBeenCalled();
    expect(prisma.menuItem.findMany).toHaveBeenCalled();
    expect(prisma.elementInventory.findMany).toHaveBeenCalled();
    // Config effective de l event, transmise sans attendre les niveaux ; stockElementIds est une promesse.
    expect(getElements).toHaveBeenCalledWith('sp', 't', 'cfg-b', { aggregateAllConfigs: false, stockElementIds: expect.any(Promise) });

    release();
    expect(await pending).toEqual(expectedResponse());
  });

  it('configId = all : vue agregee sans config unique, toujours en parallele', async () => {
    const { service, referential } = build();
    const getElements = jest.spyOn(referential, 'getSpaceElementsWithItems');
    const res = await service.getStock('sp', 't', 'all');
    expect(res.resolvedConfigId).toBe('all');
    expect(getElements).toHaveBeenCalledWith('sp', 't', undefined, { aggregateAllConfigs: true, stockElementIds: expect.any(Promise) });
  });

  it('espace introuvable : NotFound avant toute autre lecture', async () => {
    const { service, prisma } = build();
    prisma.space.findFirst.mockResolvedValue(null);
    await expect(service.getStock('sp', 't')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.stockLevel.findMany).not.toHaveBeenCalled();
    expect(prisma.spaceElement.findMany).not.toHaveBeenCalled();
  });

  it('erreur de lecture des niveaux : la requete echoue, sans unhandledRejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { service } = build({ levelsError: new Error('db down') });
      await expect(service.getStock('sp', 't', undefined, 'ev-1')).rejects.toThrow('db down');
      await tick();
      await tick();
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
