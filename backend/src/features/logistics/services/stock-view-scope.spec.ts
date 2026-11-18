import { resolveStockConfigId, stockElementIdsOf } from './stock-view-scope';

const configs = [{ id: 'cfg-a' }, { id: 'cfg-b' }];

describe('resolveStockConfigId', () => {
  it('configId explicite valide > config de l event > 1re config', () => {
    expect(resolveStockConfigId(configs, 'cfg-b', 'cfg-a')).toBe('cfg-b');
    expect(resolveStockConfigId(configs, undefined, 'cfg-b')).toBe('cfg-b');
    expect(resolveStockConfigId(configs, undefined, undefined)).toBe('cfg-a');
  });

  it('configId inconnu ou config d event inconnue : on retombe sur la suivante', () => {
    expect(resolveStockConfigId(configs, 'cfg-x', 'cfg-b')).toBe('cfg-b');
    expect(resolveStockConfigId(configs, 'cfg-x', 'cfg-y')).toBe('cfg-a');
    expect(resolveStockConfigId(configs, undefined, null)).toBe('cfg-a');
  });

  it('sentinel all : court-circuite, meme sans configuration', () => {
    expect(resolveStockConfigId(configs, 'all', 'cfg-b')).toBe('all');
    expect(resolveStockConfigId([], 'all', null)).toBe('all');
  });

  it('aucune configuration : null', () => {
    expect(resolveStockConfigId([], undefined, 'cfg-a')).toBeNull();
    expect(resolveStockConfigId([], 'cfg-a', null)).toBeNull();
  });
});

describe('stockElementIdsOf', () => {
  it('garde les elements avec du stock (colis ou unites > 0), dedoublonnes', () => {
    const ids = stockElementIdsOf([
      { elementId: 'a', packedUnits: 1, looseUnits: 0 },
      { elementId: 'a', packedUnits: 0, looseUnits: 2 },
      { elementId: 'b', packedUnits: 0, looseUnits: 0 },
      { elementId: 'c', packedUnits: -1, looseUnits: 0 },
    ]);
    expect([...ids]).toEqual(['a']);
  });
});
