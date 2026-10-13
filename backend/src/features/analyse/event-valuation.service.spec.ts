import { EventValuationService } from './event-valuation.service';
import { StockCostResolverService } from './stock-cost-resolver.service';
import { spaceAccessStub } from '../../core/auth/space-access.testing';

jest.mock('../inventory/post-event-draft-state', () => ({
  loadPostEventDraftStates: jest.fn(async (_p: any, _t: string, _s: string, ids: string[]) => new Map(ids.map((id) => [id, id !== 'e-closed']))),
}));

describe('EventValuationService', () => {
  const prisma: any = { stockReconciliation: { findMany: jest.fn() }, spaceElement: { findMany: jest.fn() } };
  const resolver = { resolve: jest.fn() } as unknown as StockCostResolverService;
  const service = new EventValuationService(prisma, spaceAccessStub(), resolver);

  beforeEach(() => {
    jest.clearAllMocks();
    (resolver.resolve as jest.Mock).mockResolvedValue(new Map());
  });

  it('retient la dernière feuille de chaque event et somme countedUnits × unitCost', async () => {
    prisma.stockReconciliation.findMany.mockResolvedValue([
      { eventId: 'e1', meta: { draft: false }, lines: [{ elementId: 'p1', itemKey: 'a', countedUnits: 10, unitCost: 2 }] },
      { eventId: 'e1', meta: { draft: false }, lines: [{ elementId: 'p1', itemKey: 'a', countedUnits: 99, unitCost: 2 }] },
    ]);
    const res = await service.getValuations('t1', { spaceId: 's1', eventIds: ['e1'] });
    expect(res).toEqual([{ eventId: 'e1', value: 20, isDraft: false, linesWithoutCost: 0, reason: null }]);
    expect(prisma.stockReconciliation.findMany).toHaveBeenCalledTimes(1);
  });

  it('event sans feuille : value null et raison explicite', async () => {
    prisma.stockReconciliation.findMany.mockResolvedValue([]);
    const res = await service.getValuations('t1', { spaceId: 's1', eventIds: ['e9'] });
    expect(res[0]).toEqual({ eventId: 'e9', value: null, isDraft: false, linesWithoutCost: 0, reason: 'no-post-event-sheet' });
  });

  it('revalorise au coût actuel les lignes sans unitCost, compte celles sans coût', async () => {
    prisma.stockReconciliation.findMany.mockResolvedValue([
      {
        eventId: 'e1', meta: {},
        lines: [
          { elementId: 'p1', itemKey: 'a', countedUnits: 4, unitCost: null },
          { elementId: 'p1', itemKey: 'b', countedUnits: 4, unitCost: 0 },
          { elementId: 'p1', itemKey: 'c', countedUnits: 0, unitCost: null },
        ],
      },
    ]);
    (resolver.resolve as jest.Mock).mockResolvedValue(new Map([['e1#0', { unitCost: 1.5, marketPrice: null }]]));
    const res = await service.getValuations('t1', { spaceId: 's1', eventIds: ['e1'] });
    expect(res[0]).toMatchObject({ value: 6, linesWithoutCost: 1 });
  });

  it('shopIds restreint les lignes aux PdV demandés', async () => {
    prisma.stockReconciliation.findMany.mockResolvedValue([
      { eventId: 'e1', meta: {}, lines: [
        { elementId: 'p1', itemKey: 'a', countedUnits: 1, unitCost: 10 },
        { elementId: 'p2', itemKey: 'a', countedUnits: 1, unitCost: 100 },
      ] },
    ]);
    const res = await service.getValuations('t1', { spaceId: 's1', eventIds: ['e1'], shopIds: ['p1'] });
    expect(res[0].value).toBe(10);
  });

  it('brouillon : drapeau meta.draft, corrigé quand l\'event est passé', async () => {
    prisma.stockReconciliation.findMany.mockResolvedValue([
      { eventId: 'e-live', meta: { draft: true }, lines: [] },
      { eventId: 'e-closed', meta: { draft: true }, lines: [] },
    ]);
    const res = await service.getValuations('t1', { spaceId: 's1', eventIds: ['e-live', 'e-closed'] });
    expect(res.map((r) => r.isDraft)).toEqual([true, false]);
  });

  it('shopNames : filtre les lignes sur les éléments résolus par nom', async () => {
    prisma.spaceElement.findMany.mockResolvedValue([{ id: 'p1', name: 'Bar Nord' }, { id: 'p2', name: 'Bar Sud' }]);
    prisma.stockReconciliation.findMany.mockResolvedValue([
      {
        eventId: 'e1', meta: {},
        lines: [
          { elementId: 'p1', itemKey: 'a', countedUnits: 2, unitCost: 5 },
          { elementId: 'p2', itemKey: 'a', countedUnits: 100, unitCost: 5 },
        ],
      },
    ]);
    const res = await service.getValuations('t1', { spaceId: 's1', eventIds: ['e1'], shopNames: ['bar  nord'] });
    expect(res[0]).toMatchObject({ value: 10 });
  });

  it('shopNames sans correspondance : lignes marquées, jamais toutes les lignes', async () => {
    prisma.spaceElement.findMany.mockResolvedValue([{ id: 'p1', name: 'Bar Nord' }]);
    const res = await service.getValuations('t1', { spaceId: 's1', eventIds: ['e1'], shopNames: ['Inconnu'] });
    expect(res).toEqual([
      { eventId: 'e1', value: null, isDraft: false, linesWithoutCost: 0, reason: 'unresolved-shop-names', unresolvedShopNames: ['Inconnu'] },
    ]);
    expect(prisma.stockReconciliation.findMany).not.toHaveBeenCalled();
  });
});
