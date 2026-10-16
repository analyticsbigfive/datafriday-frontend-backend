import { reserveTicketNumber } from './pos-ticket-number';

describe('reserveTicketNumber', () => {
  const scope = { tenantId: 'tenant-1', locationId: 'loc-1', salesEventId: 'se-1' };

  it('prend le verrou de transaction de la caisse avant de compter, puis renvoie compte + 1', async () => {
    const order: string[] = [];
    const tx: any = {
      $executeRaw: jest.fn(async () => {
        order.push('lock');
        return 1;
      }),
      salesTransaction: {
        count: jest.fn(async () => {
          order.push('count');
          return 41;
        }),
      },
    };
    expect(await reserveTicketNumber(tx, scope)).toBe(42);
    expect(order).toEqual(['lock', 'count']);
    expect(tx.salesTransaction.count).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', locationId: 'loc-1', status: 'V', eventId: 'se-1' },
    });
  });

  it('commence à 1 et compte les ventes annulées (numéro jamais réattribué)', async () => {
    const tx: any = { $executeRaw: jest.fn(), salesTransaction: { count: jest.fn().mockResolvedValue(0) } };
    expect(await reserveTicketNumber(tx, scope)).toBe(1);
    expect(tx.salesTransaction.count.mock.calls[0][0].where).not.toHaveProperty('deletedAt');
  });
});
