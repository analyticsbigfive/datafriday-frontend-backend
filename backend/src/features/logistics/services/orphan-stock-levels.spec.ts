import { collectOrphanLevels } from './orphan-stock-levels';

describe('collectOrphanLevels', () => {
  const containerHk = { id: 'hk', items: [{ name: 'Popcorn sucré (140g)' }] };
  const level = (itemKey: string, packedUnits: number, looseUnits: number, elementId = 'hk') => ({ elementId, itemKey, packedUnits, looseUnits });

  it('ignore un ancien niveau vide (menu item passé en readyForSale=No, retour Bertrand 2026-10-09)', () => {
    expect(collectOrphanLevels([containerHk], [level('Popcorn Sucré 26/27 (FCN/LMFC)', 0, 0)])).toEqual([]);
  });

  it('garde un orphelin avec du stock, emballé ou en vrac', () => {
    const out = collectOrphanLevels([containerHk], [level('Barre Chocolatée 26/27 (FCN)', 0, 62), level('Bonbons 26/27 (FCN/LMFC)', 6, 0)]);
    expect(out.map((o) => o.level.itemKey)).toEqual(['Barre Chocolatée 26/27 (FCN)', 'Bonbons 26/27 (FCN/LMFC)']);
  });

  it('ignore les articles du référentiel et les niveaux des autres éléments', () => {
    expect(collectOrphanLevels([containerHk], [level('Popcorn sucré (140g)', 0, 5), level('Twix', 0, 3, 'autre')])).toEqual([]);
  });
});
