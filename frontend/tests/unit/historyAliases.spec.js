// Alias « historique emprunté » (maquettes 08/2026) : réécriture des records
// de timeline au point unique activeTimelineData. Cf. src/utils/historyAliases.js.
import {
  applyHistoryAliases,
  buildAliasLookup,
  aliasSourceByTargetId,
} from '@/utils/historyAliases';
import {
  buildTimelineQuantityIndex,
  shopLookupKeys,
  itemLookupKeys,
  lookupPredictedQuantity,
} from '@/utils/predictedQuantityIndex';

const NAMES = new Map([['mi-new', 'Bière blonde 50 — Nouvelle marque']]);

describe('applyHistoryAliases — réécriture des records timeline', () => {
  it('match par sourceMenuItemId : id + nom réécrits vers la cible', () => {
    const records = [
      { shopId: 's1', mappedMenuItemId: 'mi-old', itemName: 'Ancienne marque', totalQuantity: 78, totalRevenue: 390 },
    ];
    const aliases = [{ sourceMenuItemId: 'mi-old', sourceName: 'Ancienne marque', targetMenuItemId: 'mi-new' }];
    const out = applyHistoryAliases(records, aliases, NAMES);
    expect(out).toHaveLength(1);
    expect(out[0].menuItemId).toBe('mi-new');
    expect(out[0].mappedMenuItemId).toBe('mi-new');
    expect(out[0].itemName).toBe('Bière blonde 50 — Nouvelle marque');
    expect(out[0]._aliasSourceName).toBe('Ancienne marque');
    // Quantités inchangées : l'alias déplace, il ne modifie pas les volumes.
    expect(out[0].totalQuantity).toBe(78);
  });

  it('match par NOM (insensible à la casse) quand l\'item timeline n\'a pas d\'id catalogue', () => {
    const records = [
      { shopId: 's1', itemName: 'BIÈRE BLONDE ANCIENNE', totalQuantity: 40, totalRevenue: 200 },
    ];
    const aliases = [{ sourceName: 'bière blonde ancienne', targetMenuItemId: 'mi-new' }];
    const out = applyHistoryAliases(records, aliases, NAMES);
    expect(out[0].menuItemId).toBe('mi-new');
    expect(out[0].itemName).toBe('Bière blonde 50 — Nouvelle marque');
  });

  it('l\'id PRIME sur le nom (même convention que l\'index timeline)', () => {
    const records = [
      { shopId: 's1', mappedMenuItemId: 'mi-a', itemName: 'Nom partagé', totalQuantity: 10 },
    ];
    const aliases = [
      { sourceMenuItemId: 'mi-a', sourceName: 'Autre nom', targetMenuItemId: 'mi-new' },
      { sourceName: 'nom partagé', targetMenuItemId: 'mi-autre-cible' },
    ];
    const out = applyHistoryAliases(records, aliases, NAMES);
    expect(out[0].menuItemId).toBe('mi-new');
  });

  it('records non concernés : inchangés (même objet)', () => {
    const untouched = { shopId: 's1', mappedMenuItemId: 'mi-x', itemName: 'Frites', totalQuantity: 5 };
    const records = [
      untouched,
      { shopId: 's1', itemName: 'Ancienne marque', totalQuantity: 3 },
    ];
    const aliases = [{ sourceName: 'ancienne marque', targetMenuItemId: 'mi-new' }];
    const out = applyHistoryAliases(records, aliases, NAMES);
    expect(out[0]).toBe(untouched);
    expect(out[1].menuItemId).toBe('mi-new');
  });

  it('STABILITÉ RÉFÉRENTIELLE : sans alias, ou sans match, retourne le tableau d\'entrée', () => {
    const records = [{ shopId: 's1', itemName: 'Frites', totalQuantity: 5 }];
    expect(applyHistoryAliases(records, [], NAMES)).toBe(records);
    expect(applyHistoryAliases(records, null, NAMES)).toBe(records);
    const noMatch = [{ sourceName: 'inexistant', targetMenuItemId: 'mi-new' }];
    expect(applyHistoryAliases(records, noMatch, NAMES)).toBe(records);
  });

  it('sans entrée dans targetNameById : conserve le nom d\'origine', () => {
    const records = [{ shopId: 's1', itemName: 'Ancienne marque', totalQuantity: 3 }];
    const aliases = [{ sourceName: 'ancienne marque', targetMenuItemId: 'mi-inconnu' }];
    const out = applyHistoryAliases(records, aliases, new Map());
    expect(out[0].itemName).toBe('Ancienne marque');
  });

  it('fusion source + cible déjà vendue : l\'index somme, la lecture multi-clés prend le MAX (BUG-290-01)', () => {
    // La cible a déjà 20 ventes propres ; la source réécrite en apporte 78.
    const records = applyHistoryAliases(
      [
        { shopId: 's1', shopName: 'Buvette Nord', mappedMenuItemId: 'mi-new', itemName: 'Bière blonde 50 — Nouvelle marque', totalQuantity: 20 },
        { shopId: 's1', shopName: 'Buvette Nord', mappedMenuItemId: 'mi-old', itemName: 'Ancienne marque', totalQuantity: 78 },
      ],
      [{ sourceMenuItemId: 'mi-old', sourceName: 'Ancienne marque', targetMenuItemId: 'mi-new' }],
      NAMES,
    );
    const index = buildTimelineQuantityIndex(records);
    const qty = lookupPredictedQuantity(
      index,
      shopLookupKeys({ id: 's1', name: 'Buvette Nord' }),
      itemLookupKeys('mi-new', { name: 'Bière blonde 50 — Nouvelle marque' }),
    );
    // 20 + 78 sous la même clé (somme d'indexation légitime : deux records
    // distincts du même article), lecture = 98 — PAS 196 (double comptage
    // id + nom évité par le MAX).
    expect(qty).toBe(98);
  });
});

describe('buildAliasLookup / aliasSourceByTargetId', () => {
  it('construit les tables id et nom (minuscules), ignore les lignes invalides', () => {
    const { byId, byName } = buildAliasLookup([
      { sourceMenuItemId: 'mi-old', sourceName: 'Ancienne', targetMenuItemId: 'mi-new' },
      { sourceName: 'Sans Id', targetMenuItemId: 'mi-2' },
      { sourceName: 'Sans cible' },
      null,
    ]);
    expect(byId.has('mi-old')).toBe(true);
    expect(byName.has('ancienne')).toBe(true);
    expect(byName.has('sans id')).toBe(true);
    expect(byName.has('sans cible')).toBe(false);
  });

  it('aliasSourceByTargetId : map cible → nom source (badge)', () => {
    const map = aliasSourceByTargetId([
      { sourceName: 'Ancienne marque', targetMenuItemId: 'mi-new' },
    ]);
    expect(map.get('mi-new')).toBe('Ancienne marque');
    expect(aliasSourceByTargetId(null).size).toBe(0);
  });
});
