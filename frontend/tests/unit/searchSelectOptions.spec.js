import {
  normalizeSearchText,
  normalizeSearchSelectOptions,
  filterSearchSelectOptions,
} from '@/components/menu-fb/views/market-prices/utils/searchSelectOptions';

describe('searchSelectOptions', () => {
  it('normalise les accents et la casse', () => {
    expect(normalizeSearchText('  Café Éclair ')).toBe('cafe eclair');
  });

  it('accepte des chaînes et des objets, écarte les titres vides', () => {
    const opts = normalizeSearchSelectOptions(['Alazard', '', null, { id: 'b', name: 'Belsia' }], 'name', 'id');
    expect(opts.map((o) => [o.title, o.value])).toEqual([['Alazard', 'Alazard'], ['Belsia', 'b']]);
  });

  it('conserve toutes les options sans plafond', () => {
    const items = Array.from({ length: 500 }, (_, i) => `Fournisseur ${i}`);
    expect(normalizeSearchSelectOptions(items)).toHaveLength(500);
  });

  it('filtre sans tenir compte des accents', () => {
    const opts = normalizeSearchSelectOptions(['Café Martin', 'Boivin', 'Arc en ciel']);
    expect(filterSearchSelectOptions(opts, 'cafe').map((o) => o.title)).toEqual(['Café Martin']);
    expect(filterSearchSelectOptions(opts, '')).toHaveLength(3);
    expect(filterSearchSelectOptions(opts, 'zzz')).toHaveLength(0);
  });
});
