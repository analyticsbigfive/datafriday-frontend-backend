import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';

/** Prisma minimal en mémoire pour PaymentMethod, avec l'unique (tenantId, name) et skipDuplicates. */
function fakePrisma(eventSettings: Record<string, string[]> = {}) {
  const rows: any[] = [];
  let seq = 0;
  const matches = (r: any, where: any = {}) =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && 'equals' in v) return String(r[k]).toLowerCase() === String(v.equals).toLowerCase();
      if (v && typeof v === 'object' && 'not' in v) return r[k] !== v.not;
      return r[k] === v;
    });
  const paymentMethod = {
    findMany: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where)).map((r) => ({ ...r }))),
    findFirst: jest.fn(async ({ where, orderBy }: any = {}) => {
      let found = rows.filter((r) => matches(r, where));
      if (orderBy?.sortOrder === 'desc') found = [...found].sort((a, b) => b.sortOrder - a.sortOrder);
      return found[0] ? { ...found[0] } : null;
    }),
    createMany: jest.fn(async ({ data, skipDuplicates }: any) => {
      let count = 0;
      for (const d of data) {
        if (rows.some((r) => r.tenantId === d.tenantId && r.name === d.name)) {
          if (skipDuplicates) continue;
          throw Object.assign(new Error('dup'), { code: 'P2002' });
        }
        rows.push({ id: `pm-${++seq}`, ...d });
        count++;
      }
      return { count };
    }),
    create: jest.fn(async ({ data }: any) => {
      if (rows.some((r) => r.tenantId === data.tenantId && r.name === data.name)) throw Object.assign(new Error('dup'), { code: 'P2002' });
      const row = { id: `pm-${++seq}`, ...data };
      rows.push(row);
      return { ...row };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows.find((r) => r.id === where.id);
      Object.assign(row, data);
      return { ...row };
    }),
    delete: jest.fn(async ({ where }: any) => {
      rows.splice(rows.findIndex((r) => r.id === where.id), 1);
    }),
  };
  const posEventSetting = {
    findFirst: jest.fn(async ({ where }: any) => (eventSettings[where.eventId] ? { paymentMethodIds: eventSettings[where.eventId] } : null)),
  };
  return { rows, paymentMethod, posEventSetting };
}

describe('PaymentMethodsService', () => {
  const T = 'tenant-1';
  let prisma: ReturnType<typeof fakePrisma>;
  let service: PaymentMethodsService;
  const build = (settings: Record<string, string[]> = {}) => {
    prisma = fakePrisma(settings);
    service = new PaymentMethodsService(prisma as any);
  };

  it('listActive crée Espèces et Carte (isSystem) à la demande, triés', async () => {
    build();
    const list = await service.listActive(T);
    expect(list.map((m) => [m.name, m.kind, m.isSystem, m.sortOrder])).toEqual([
      ['Espèces', 'cash', true, 0],
      ['Carte', 'card', true, 1],
    ]);
  });

  it('création idempotente : deux listActive ne créent aucun doublon et le second ne réécrit rien', async () => {
    build();
    await service.listActive(T);
    await service.listActive(T);
    expect(prisma.rows).toHaveLength(2);
    expect(prisma.paymentMethod.createMany).toHaveBeenCalledTimes(1);
  });

  it('concurrence : deux premiers appels simultanés ne créent que deux lignes (skipDuplicates sur l\'unique)', async () => {
    build();
    await Promise.all([service.listActive(T), service.listActive(T)]);
    expect(prisma.rows).toHaveLength(2);
    expect(prisma.paymentMethod.createMany.mock.calls.every(([arg]: any) => arg.skipDuplicates === true)).toBe(true);
  });

  it('un défaut désactivé n\'est ni recréé ni réactivé, et disparaît de listActive', async () => {
    build();
    const [cash] = await service.listActive(T);
    await service.update(cash.id, { active: false }, T);
    const list = await service.listActive(T);
    expect(list.map((m) => m.name)).toEqual(['Carte']);
    expect(prisma.rows).toHaveLength(2);
  });

  it('isSystem : désactivable, jamais supprimable', async () => {
    build();
    const [cash] = await service.listActive(T);
    await expect(service.remove(cash.id, T)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.rows).toHaveLength(2);
    expect((await service.update(cash.id, { active: false }, T)).active).toBe(false);
  });

  it('isSystem : la catégorie ne change pas, le nom peut changer', async () => {
    build();
    const [cash] = await service.listActive(T);
    await expect(service.update(cash.id, { kind: 'card' }, T)).rejects.toBeInstanceOf(BadRequestException);
    expect((await service.update(cash.id, { name: 'Cash' }, T)).name).toBe('Cash');
    // renommé mais toujours système de kind cash : pas recréé
    await service.listActive(T);
    expect(prisma.rows).toHaveLength(2);
  });

  it('CRUD : kind libre mais non vide, nom unique insensible à la casse, suppression d\'un moyen non système', async () => {
    build();
    const created = await service.create({ name: 'Ticket resto', kind: ' Voucher ' }, T);
    expect(created).toMatchObject({ kind: 'voucher', isSystem: false, active: true, sortOrder: 2 });
    await expect(service.create({ name: 'x', kind: '   ' }, T)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ name: 'ticket RESTO', kind: 'voucher' }, T)).rejects.toBeInstanceOf(BadRequestException);
    expect(await service.remove(created.id, T)).toEqual({ deleted: true });
  });

  it('un moyen d\'un autre tenant est introuvable', async () => {
    build();
    const [cash] = await service.listActive(T);
    await expect(service.findOne(cash.id, 'autre-tenant')).rejects.toThrow('not found');
  });

  describe('resolveForEvent', () => {
    it('réglage vide ou absent : tous les moyens actifs, triés par sortOrder', async () => {
      build();
      await service.create({ name: 'Cashless', kind: 'cashless', sortOrder: 5 }, T);
      const all = await service.resolveForEvent(T, 'ev-1');
      expect(all.map((m) => m.name)).toEqual(['Espèces', 'Carte', 'Cashless']);
    });

    it('sélection : seulement les moyens choisis, dans l\'ordre du référentiel', async () => {
      build();
      const [cash, card] = await service.listActive(T);
      prisma.posEventSetting.findFirst.mockResolvedValue({ paymentMethodIds: [card.id] });
      expect((await service.resolveForEvent(T, 'ev-1')).map((m) => m.id)).toEqual([card.id]);
      prisma.posEventSetting.findFirst.mockResolvedValue({ paymentMethodIds: [card.id, cash.id] });
      expect((await service.resolveForEvent(T, 'ev-1')).map((m) => m.id)).toEqual([cash.id, card.id]);
    });

    it('un moyen sélectionné puis désactivé est exclu ; sélection devenue vide : retombe sur les actifs', async () => {
      build();
      const [cash, card] = await service.listActive(T);
      prisma.posEventSetting.findFirst.mockResolvedValue({ paymentMethodIds: [cash.id, card.id] });
      await service.update(cash.id, { active: false }, T);
      expect((await service.resolveForEvent(T, 'ev-1')).map((m) => m.id)).toEqual([card.id]);
      prisma.posEventSetting.findFirst.mockResolvedValue({ paymentMethodIds: [cash.id] });
      expect((await service.resolveForEvent(T, 'ev-1')).map((m) => m.id)).toEqual([card.id]);
    });
  });
});
