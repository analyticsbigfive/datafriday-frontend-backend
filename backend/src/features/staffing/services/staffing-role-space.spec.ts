import { roleSpaceRank } from './staffing-context.service';

const role = (...spaceIdsPerSupplier: string[][]) => ({
  suppliers: spaceIdsPerSupplier.map((spaceIds) => ({ supplier: { spaceIds } })),
});

describe('roleSpaceRank', () => {
  it('rôle sans agence : jamais affiché', () => {
    expect(roleSpaceRank(role(), 'beaujoire')).toBe(0);
  });
  it('agence desservant uniquement un autre espace : exclu', () => {
    expect(roleSpaceRank(role(['aix']), 'beaujoire')).toBe(0);
  });
  it('agence desservant cet espace : affiché', () => {
    expect(roleSpaceRank(role(['beaujoire']), 'beaujoire')).toBe(2);
  });
  it('agence sans espace associé : jamais affiché', () => {
    expect(roleSpaceRank(role([]), 'beaujoire')).toBe(0);
  });
  it('une agence d\'un autre espace et une de cet espace : affiché', () => {
    expect(roleSpaceRank(role(['aix'], ['beaujoire']), 'beaujoire')).toBe(2);
  });
});
