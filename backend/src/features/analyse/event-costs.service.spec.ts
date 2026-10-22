import { EventCostsService } from './event-costs.service';
import { spaceAccessStub } from '../../core/auth/space-access.testing';

describe('EventCostsService', () => {
  const prisma: any = {
    event: { findMany: jest.fn() },
    productMapping: { findMany: jest.fn() },
    menuItem: { findMany: jest.fn() },
  };
  const asOf: any = { costsAsOf: jest.fn() };
  const service = new EventCostsService(prisma, spaceAccessStub(), asOf);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.productMapping.findMany.mockResolvedValue([{ menuItemId: 'm1' }, { menuItemId: 'm2' }]);
    prisma.menuItem.findMany.mockResolvedValue([
      { id: 'm1', totalCost: '5.0000' },
      { id: 'm2', totalCost: '3.0000' },
    ]);
  });

  it('un event avant un changement garde l ancien coût, un après prend le nouveau', async () => {
    prisma.event.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    asOf.costsAsOf.mockImplementation(async (_t: string, { eventId }: any) => ({
      eventId,
      costs: { m1: { totalCost: eventId === 'e1' ? 4 : 5, versionAt: '2026-01-01T00:00:00.000Z', source: 'snapshot' } },
    }));
    const res = await service.getEventCosts('t1', 's1', ['e1', 'e2']);
    expect(res.events.e1.m1).toEqual({ totalCost: 4, source: 'snapshot', versionAt: '2026-01-01T00:00:00.000Z' });
    expect(res.events.e2.m1.totalCost).toBe(5);
    expect(res.unknownEventIds).toEqual([]);
  });

  it('article sans snapshot : repli sur le coût courant de MenuItem', async () => {
    prisma.event.findMany.mockResolvedValue([{ id: 'e1' }]);
    asOf.costsAsOf.mockResolvedValue({
      eventId: 'e1',
      costs: { m1: { totalCost: 4, versionAt: '2026-01-01T00:00:00.000Z', source: 'baseline' } },
    });
    const res = await service.getEventCosts('t1', 's1', ['e1']);
    expect(res.events.e1.m1.source).toBe('baseline');
    expect(res.events.e1.m2).toEqual({ totalCost: 3, source: 'current', versionAt: null });
  });

  it('events hors espace listés en unknownEventIds, sans appel costsAsOf pour eux', async () => {
    prisma.event.findMany.mockResolvedValue([{ id: 'e1' }]);
    asOf.costsAsOf.mockResolvedValue({ eventId: 'e1', costs: {} });
    const res = await service.getEventCosts('t1', 's1', ['e1', 'x', 'e1']);
    expect(res.unknownEventIds).toEqual(['x']);
    expect(asOf.costsAsOf).toHaveBeenCalledTimes(1);
    expect(prisma.event.findMany).toHaveBeenCalledWith({ where: { id: { in: ['e1', 'x'] }, tenantId: 't1', spaceId: 's1' }, select: { id: true } });
  });

  it('aucun event connu : pas de lecture de coûts', async () => {
    prisma.event.findMany.mockResolvedValue([]);
    const res = await service.getEventCosts('t1', 's1', ['x']);
    expect(res).toEqual({ events: {}, unknownEventIds: ['x'] });
    expect(prisma.productMapping.findMany).not.toHaveBeenCalled();
  });
});
