import { eventKeyOf, VentilationChecksService } from './ventilation-checks.service';

function build() {
  const tx = {
    ventilationDepositCheck: {
      upsert: jest.fn().mockImplementation(async (args: any) => ({
        itemKey: args.create.itemKey,
        elementId: args.create.elementId,
        checked: args.update.checked ?? args.create.checked,
        quantity: null,
        comment: null,
      })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma: any = {
    ventilationDepositCheck: { findMany: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  return { service: new VentilationChecksService(prisma), prisma, tx };
}

describe('VentilationChecksService', () => {
  it('trie et dédoublonne les matchs dans la clé', () => {
    expect(eventKeyOf(['b', 'a', 'b', ' '])).toBe('a,b');
  });

  it("décocher une ligne remet la coche de l'article à false", async () => {
    const { service, tx } = build();
    await service.upsert('s1', 't1', ['b', 'a'], { itemKey: 'Bière', elementId: 'e1', checked: false }, 'Paul');
    const where = tx.ventilationDepositCheck.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 't1', spaceId: 's1', eventKey: 'a,b', itemKey: 'Bière', elementId: '' });
    expect(tx.ventilationDepositCheck.updateMany.mock.calls[0][0].data.checked).toBe(false);
  });

  it("cocher une ligne ou agir sur l'article ne touche pas à la coche article", async () => {
    const { service, tx } = build();
    await service.upsert('s1', 't1', ['a'], { itemKey: 'Bière', elementId: 'e1', checked: true });
    await service.upsert('s1', 't1', ['a'], { itemKey: 'Bière', checked: false });
    expect(tx.ventilationDepositCheck.updateMany).not.toHaveBeenCalled();
  });

  it('list renvoie la coche article avec elementId vide et la quantité en nombre', async () => {
    const { service, prisma } = build();
    prisma.ventilationDepositCheck.findMany.mockResolvedValue([
      { itemKey: 'Bière', elementId: '', checked: true, quantity: { toString: () => '12.5', valueOf: () => 12.5 }, comment: 'ok' },
    ]);
    const res = await service.list('s1', 't1', ['a']);
    expect(res).toEqual([{ itemKey: 'Bière', elementId: '', checked: true, quantity: 12.5, comment: 'ok' }]);
  });
});
