import { PERMISSIONS_KEY } from '../../../core/auth/guards/permissions.guard';
import { PosConfigController } from './pos-config.controller';

/** Permissions, accès espace et masquage du PIN au niveau route. */
describe('PosConfigController', () => {
  const ADMIN = { id: 'u1', tenantId: 't1', role: { systemKey: 'ADMIN', permissions: [] } } as any;
  const withPerms = (...permissions: string[]) => ({ id: 'u2', tenantId: 't1', role: { systemKey: 'MANAGER', permissions } }) as any;

  let events: any;
  let settings: any;
  let sales: any;
  let spaceAccess: any;
  let controller: PosConfigController;
  const params = { spaceId: 's1', eventId: 'ev1' };

  beforeEach(() => {
    events = { listEvents: jest.fn().mockResolvedValue([]), getEventDetail: jest.fn().mockResolvedValue({}) };
    settings = { updateEventSettings: jest.fn(), updatePdvSetting: jest.fn() };
    sales = { list: jest.fn() };
    spaceAccess = { assertCanAccessSpace: jest.fn().mockResolvedValue(undefined) };
    controller = new PosConfigController(events, settings, sales, spaceAccess);
  });

  it('toutes les routes exigent front.fb.pos (niveau classe)', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PosConfigController)).toEqual(['front.fb.pos']);
  });

  it('chaque route vérifie l\'accès à l\'espace avant de lire', async () => {
    spaceAccess.assertCanAccessSpace.mockRejectedValue(new Error('403'));
    const user = withPerms('front.fb.pos');
    await expect(controller.listEvents('s1', user)).rejects.toThrow('403');
    await expect(controller.detail(params, user)).rejects.toThrow('403');
    await expect(controller.updateSettings(params, {} as any, user)).rejects.toThrow('403');
    await expect(controller.updatePdv({ ...params, elementId: 'e' }, {} as any, user)).rejects.toThrow('403');
    await expect(controller.listSales(params, {}, user)).rejects.toThrow('403');
    expect(events.listEvents).not.toHaveBeenCalled();
    expect(events.getEventDetail).not.toHaveBeenCalled();
    expect(sales.list).not.toHaveBeenCalled();
  });

  it('PIN demandé seulement avec front.fb.posManage (ADMIN compris)', async () => {
    await controller.detail(params, withPerms('front.fb.pos'));
    await controller.detail(params, withPerms('front.fb.pos', 'front.fb.posManage'));
    await controller.detail(params, ADMIN);
    expect(events.getEventDetail.mock.calls.map((c: any[]) => c[3])).toEqual([false, true, true]);
  });

  it('export CSV : parcourt toutes les pages par curseur, BOM et séparateur ;', async () => {
    const row = (n: number) => ({ ticketNumber: n, createdAt: 'd', pdvName: 'P', vendorName: 'V', payments: [], totalTtc: 1, vatTotal: 0, cancelled: false, lines: [] });
    sales.list
      .mockResolvedValueOnce({ rows: [row(1)], nextCursor: 'c2', totals: {} })
      .mockResolvedValueOnce({ rows: [row(2)], nextCursor: null, totals: {} });
    // Fastify : reply.header(...).header(...).send(csv) (le POS tourne sur Fastify, pas Express).
    const reply: any = { header: jest.fn().mockReturnThis(), send: jest.fn() };
    await controller.exportSales(params, { elementId: 'e1' }, ADMIN, reply);
    const csv: string = reply.send.mock.calls[0][0];
    expect(sales.list).toHaveBeenCalledTimes(2);
    expect(sales.list.mock.calls[1][1]).toMatchObject({ elementId: 'e1', cursor: 'c2', limit: 200 });
    expect(sales.list.mock.calls[0][0]).toEqual({ tenantId: 't1', spaceId: 's1', eventId: 'ev1' });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(3);
    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(reply.header).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('.csv'));
  });
});
