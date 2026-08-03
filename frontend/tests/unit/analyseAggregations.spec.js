import {
  groupBy,
  pctOf,
  safeSheetName,
  aggregateByItem,
  aggregateByShop,
  buildItemsByShopRows,
  buildBaseShopRows,
  buildShopPerfRows,
} from '@/utils/analyseAggregations';

describe('groupBy — regroupement partagé donuts / export', () => {
  const records = [
    { shopName: 'Nord', revenue: 100, quantity: 10 },
    { shopName: 'Sud', revenue: 300, quantity: 5 },
    { shopName: 'Nord', revenue: 50, quantity: 4 },
  ];

  it('somme par clé et trie par valeur décroissante', () => {
    const g = groupBy(records, (r) => r.shopName, (r) => r.revenue);
    expect(g.keys).toEqual(['Sud', 'Nord']);
    expect(g.values).toEqual([300, 150]);
  });

  it('ignore les records dont la clé est absente', () => {
    // C'est ce comportement qui vidait la réponse « top articles » de
    // l'assistant : le shop-level porte menuItemName à null.
    const g = groupBy(
      [...records, { shopName: null, revenue: 999 }],
      (r) => r.shopName,
      (r) => r.revenue,
    );
    expect(g.values.reduce((a, v) => a + v, 0)).toBe(450);
  });

  it('applique labelFn sans changer les clés', () => {
    const g = groupBy(records, (r) => r.shopName, (r) => r.revenue, null, (k) => `PdV ${k}`);
    expect(g.keys).toEqual(['Sud', 'Nord']);
    expect(g.labels).toEqual(['PdV Sud', 'PdV Nord']);
  });

  it('cycle la palette et laisse gagner colorMap', () => {
    const g = groupBy(records, (r) => r.shopName, (r) => r.revenue, { Sud: '#000' }, null, ['#a', '#b']);
    expect(g.colors).toEqual(['#000', '#b']);
  });

  it('tolère un tableau vide ou des entrées nulles', () => {
    expect(groupBy(null, (r) => r.x, (r) => r.y).keys).toEqual([]);
    expect(groupBy([null], (r) => r.x, (r) => r.y).keys).toEqual([]);
  });
});

describe('pctOf', () => {
  it('renvoie 0 plutôt que NaN quand le total est nul', () => {
    expect(pctOf(5, 0)).toBe(0);
  });

  it('arrondit à deux décimales', () => {
    expect(pctOf(1, 3)).toBe(33.33);
  });
});

describe('safeSheetName — contraintes Excel', () => {
  it('laisse un nom court intact', () => {
    expect(safeSheetName('Par zone', new Set())).toBe('Par zone');
  });

  it('tronque à 31 caractères sur un mot', () => {
    // Le titre affiché du panneau fait 44 caractères : la troncature n'est pas
    // un cas limite, c'est le cas nominal depuis qu'on reprend les titres écran.
    const name = safeSheetName('Performance des shops par taux de transaction', new Set());
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).toBe('Performance des shops par taux');
  });

  it('remplace les caractères interdits par Excel', () => {
    expect(safeSheetName('CA / PdV : 2026 [test]', new Set())).toBe('CA PdV 2026 test');
  });

  it('dé-doublonne deux titres identiques', () => {
    const used = new Set();
    expect(safeSheetName('Chronologie', used)).toBe('Chronologie');
    expect(safeSheetName('Chronologie', used)).toBe('Chronologie (2)');
    expect(safeSheetName('Chronologie', used)).toBe('Chronologie (3)');
  });

  it('garde le suffixe de collision sous la limite de longueur', () => {
    const used = new Set();
    const long = 'Performance des shops par taux de transaction';
    safeSheetName(long, used);
    expect(safeSheetName(long, used).length).toBeLessThanOrEqual(31);
  });

  it('ne renvoie jamais une chaîne vide', () => {
    expect(safeSheetName('///', new Set())).toBe('Feuille');
    expect(safeSheetName('', new Set())).toBe('Feuille');
  });
});

describe('agrégations Articles × PdV', () => {
  const records = [
    { shopName: 'Nord', menuItemName: 'Pression', revenue: 100, quantity: 20, eventId: 'e1' },
    { shopName: 'Nord', menuItemName: 'Pression', revenue: 60, quantity: 12, eventId: 'e2' },
    { shopName: 'Sud', menuItemName: 'Pression', revenue: 40, quantity: 8, eventId: 'e1' },
    { shopName: 'Nord', menuItemName: 'Frites', revenue: 30, quantity: 10, eventId: 'e1' },
    // Ligne shop-level : aucun nom d'article, doit être ignorée.
    { shopName: 'Nord', revenue: 999, quantity: 1, eventId: 'e1' },
  ];

  it('aggregateByItem compte les events par PdV', () => {
    const items = aggregateByItem(records);
    const pression = items.find((i) => i.name === 'Pression');
    expect(pression.totalRevenue).toBe(200);
    expect(pression.shops.find((s) => s.name === 'Nord').events).toBe(2);
    expect(pression.shops.find((s) => s.name === 'Sud').events).toBe(1);
  });

  it('aggregateByShop trie les PdV par quantité totale', () => {
    const shops = aggregateByShop(records);
    expect(shops[0].name).toBe('Nord');
    expect(shops[0].total).toBe(42);
  });

  it("aggregateByShop n'appelle pictureOf que si on le fournit", () => {
    expect(aggregateByShop(records)[0].items[0].picture).toBeNull();
    const withPic = aggregateByShop(records, { pictureOf: (name) => `${name}.png` });
    expect(withPic[0].items[0].picture).toBe('Pression.png');
  });

  it('buildItemsByShopRows produit une ligne par couple article × PdV', () => {
    const h = {
      shop: 'PdV', item: 'Article', type: 'Type', category: 'Catégorie',
      quantity: 'Quantité', revenue: 'CA', events: 'Événements',
    };
    const rows = buildItemsByShopRows(records, h, 'items');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ Article: 'Pression', PdV: 'Nord', CA: 160, Événements: 2 });
  });

  it('buildItemsByShopRows en vue « shops » inverse la lecture', () => {
    const h = {
      shop: 'PdV', item: 'Article', type: 'Type', category: 'Catégorie',
      quantity: 'Quantité', revenue: 'CA', events: 'Événements',
    };
    const rows = buildItemsByShopRows(records, h, 'shops');
    expect(rows[0].PdV).toBe('Nord');
    expect(rows.every((r) => r['Événements'] === undefined)).toBe(true);
  });
});

describe('Performance PdV', () => {
  const h = {
    shop: 'shop', revenue: 'revenue', transactions: 'transactions', rate: 'rate',
    firstHour: 'firstHour', peak: 'peak', events: 'events', minutes: 'minutes',
  };

  it('buildShopPerfRows écarte les PdV sans vente et trie par CA décroissant', () => {
    // Le classeur doit lister les mêmes PdV, dans le même ordre, que les cartes
    // du panneau — `useShopPerformance` les rend dans l'ordre d'insertion d'une
    // Map, qui n'a aucune raison de coïncider.
    const rows = buildShopPerfRows(
      [
        { shopName: 'Petit', totalRevenue: 10, transactionRate: 0.5 },
        { shopName: 'Fantôme', totalRevenue: 0, transactionRate: 0 },
        { shopName: 'Gros', totalRevenue: 500, transactionRate: 2 },
      ],
      h,
    );
    expect(rows.map((r) => r.shop)).toEqual(['Gros', 'Petit']);
  });

  it('buildShopPerfRows met null (et non 0) sur une métrique absente', () => {
    const rows = buildShopPerfRows(
      [{ shopName: 'Nord', totalRevenue: 12.345, totalTransactions: 9.6, transactionRate: 1.239, eventCount: 2, operatingMinutes: 120 }],
      h,
    );
    expect(rows[0]).toEqual({
      shop: 'Nord', revenue: 12.35, transactions: 10, rate: 1.24,
      firstHour: null, peak: null, events: 2, minutes: 120,
    });
  });

  it('buildBaseShopRows agrège sans toucher au débit', () => {
    // Repli utilisé quand le panneau Perf PdV n'a jamais été ouvert : on ne
    // déclenche pas enrich() depuis l'export, sous peine de modifier le
    // leaderboard affiché à droite.
    const rows = buildBaseShopRows(
      [
        { shopName: 'Nord', revenue: 10, transactionCount: 3, eventId: 'e1' },
        { shopName: 'Nord', revenue: 5, transactionCount: 2, eventId: 'e2' },
        { shopName: 'Sud', revenue: 40, transactionCount: 1, eventId: 'e1' },
      ],
      { shop: 'shop', revenue: 'revenue', transactions: 'transactions', events: 'events' },
    );
    expect(rows).toEqual([
      { shop: 'Sud', revenue: 40, transactions: 1, events: 1 },
      { shop: 'Nord', revenue: 15, transactions: 5, events: 2 },
    ]);
  });
});
