import { loadMarketPricesByNormalizedName, resolveInventoryLinks } from './inventory-market-price-resolver';

const mps = [
  { id: 'mp-old', itemName: 'Bière  Blonde' },
  { id: 'mp-dup', itemName: 'bière blonde' },
  { id: 'mp-eau', itemName: 'Eau' },
];

const client = (): any => ({
  marketPrice: {
    findMany: jest.fn(({ where }) =>
      Promise.resolve(where.id ? mps.filter((m) => where.id.in.includes(m.id)) : mps)),
  },
});

describe('inventory-market-price-resolver', () => {
  it('index par nom normalisé : le premier (plus ancien) gagne en cas de doublon', async () => {
    const map = await loadMarketPricesByNormalizedName(client(), 't1');
    expect(map.get('bière blonde')?.id).toBe('mp-old');
    expect(map.get('eau')?.id).toBe('mp-eau');
  });

  it('id valide : nom du MP ; id inconnu : repli sur le nom ; aucun match : null', async () => {
    const res = await resolveInventoryLinks(client(), 't1', [
      { name: 'x', marketPriceId: 'mp-eau' },
      { name: ' EAU ', marketPriceId: 'mp-inconnu' },
      { name: 'Café' },
    ]);
    expect(res).toEqual([
      { name: 'Eau', marketPriceId: 'mp-eau' },
      { name: ' EAU ', marketPriceId: 'mp-eau' },
      { name: 'Café', marketPriceId: null },
    ]);
  });

  it('entrée vide : aucune requête', async () => {
    const c = client();
    expect(await resolveInventoryLinks(c, 't1', [])).toEqual([]);
    expect(c.marketPrice.findMany).not.toHaveBeenCalled();
  });
});
