import { EventSalesSourceService } from './event-sales-source.service';

describe('EventSalesSourceService (module feuille, Prisma seul)', () => {
  const prisma: any = {
    eventSalesSource: { upsert: jest.fn(), findMany: jest.fn() },
  };
  const service = new EventSalesSourceService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('ensurePosSource est idempotent : un upsert sur (eventId, integrationId), réactive une source retirée', async () => {
    await service.ensurePosSource('tenant-1', 'evt-1', 'int-pos', 'se-pos');
    await service.ensurePosSource('tenant-1', 'evt-1', 'int-pos', 'se-pos');

    expect(prisma.eventSalesSource.upsert).toHaveBeenCalledTimes(2);
    const call = prisma.eventSalesSource.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ eventId_integrationId: { eventId: 'evt-1', integrationId: 'int-pos' } });
    expect(call.create).toMatchObject({
      tenantId: 'tenant-1', eventId: 'evt-1', integrationId: 'int-pos', salesEventId: 'se-pos',
      windowMode: 'sales-event-range', origin: 'pos', active: true,
    });
    expect(call.update).toEqual({ salesEventId: 'se-pos', active: true });
  });

  it('listActiveByEvent : sources actives groupées par évènement, aucune lecture sans évènement', async () => {
    prisma.eventSalesSource.findMany.mockResolvedValue([
      { eventId: 'a', integrationId: 'i1', salesEventId: 's1', windowMode: 'sales-event-range', origin: 'pos' },
      { eventId: 'a', integrationId: 'i2', salesEventId: null, windowMode: 'date-range', origin: 'manual' },
      { eventId: 'b', integrationId: 'i1', salesEventId: 's2', windowMode: 'sales-event-range', origin: 'pos' },
    ]);
    const byEvent = await service.listActiveByEvent('tenant-1', ['a', 'b']);
    expect(byEvent.get('a')).toHaveLength(2);
    expect(byEvent.get('b')).toHaveLength(1);
    expect(prisma.eventSalesSource.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', eventId: { in: ['a', 'b'] }, active: true },
    }));

    prisma.eventSalesSource.findMany.mockClear();
    expect((await service.listActiveByEvent('tenant-1', [])).size).toBe(0);
    expect(prisma.eventSalesSource.findMany).not.toHaveBeenCalled();
  });

  it('listDeclaredSalesEventIds : SalesEvent des sources actives non auto', async () => {
    prisma.eventSalesSource.findMany.mockResolvedValue([{ salesEventId: 's1' }, { salesEventId: 's2' }]);
    const ids = await service.listDeclaredSalesEventIds('tenant-1');
    expect([...ids]).toEqual(['s1', 's2']);
    expect(prisma.eventSalesSource.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', active: true, salesEventId: { not: null }, origin: { not: 'auto' } },
    }));
  });
});
