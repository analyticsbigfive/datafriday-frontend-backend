// Bug shop 5A (cf. docs/PLAN_EVENTPREDICT_SPACE_MENU_SELECTION.md) : un [] explicite
// (tout décoché) ne doit JAMAIS retomber sur derived (attachés Space Menu) — sinon
// "tout décoché" redevient coché, en LIVE (pas besoin de reload).
import { mergeEffectiveMenuConfig } from '@/utils/menuConfigSelection';

describe('mergeEffectiveMenuConfig — clé explicite vide ne fallback pas', () => {
  it('shop avec [] explicite (tout décoché) → reste [], PAS de fallback derived', () => {
    const derived = { '5A': ['Frites', 'Burger', 'Soda'] };
    const explicit = { '5A': [] };
    expect(mergeEffectiveMenuConfig(explicit, derived)).toEqual({ '5A': [] });
  });

  it('shop absent de explicit (jamais touché) → fallback derived', () => {
    const derived = { '5A': ['Frites', 'Burger', 'Soda'] };
    expect(mergeEffectiveMenuConfig({}, derived)).toEqual({ '5A': ['Frites', 'Burger', 'Soda'] });
  });

  it('shop avec sélection explicite partielle (2/3) → utilisée telle quelle', () => {
    const derived = { '5A': ['Frites', 'Burger', 'Soda'] };
    const explicit = { '5A': ['Burger', 'Soda'] };
    expect(mergeEffectiveMenuConfig(explicit, derived)).toEqual({ '5A': ['Burger', 'Soda'] });
  });

  it('trace clic par clic 5A : le dernier décochage ne fait PAS réapparaître les 2 précédents', () => {
    const derived = { '5A': ['Frites', 'Burger', 'Soda'] };
    // Clic 1 : décoche Frites.
    expect(mergeEffectiveMenuConfig({ '5A': ['Burger', 'Soda'] }, derived)['5A']).toEqual(['Burger', 'Soda']);
    // Clic 2 : décoche Burger.
    expect(mergeEffectiveMenuConfig({ '5A': ['Soda'] }, derived)['5A']).toEqual(['Soda']);
    // Clic 3 : décoche Soda (dernier) → doit rester [], pas [Frites,Burger,Soda].
    expect(mergeEffectiveMenuConfig({ '5A': [] }, derived)['5A']).toEqual([]);
  });

  it('plusieurs shops : seul celui avec clé explicite est figé, les autres restent dérivés', () => {
    const derived = { '5A': ['Frites'], '6B': ['Eau'] };
    const explicit = { '5A': [] };
    expect(mergeEffectiveMenuConfig(explicit, derived)).toEqual({ '5A': [], '6B': ['Eau'] });
  });

  it('valeur explicite non-array (état invalide) → traitée comme vide, pas de crash', () => {
    const derived = { '5A': ['Frites'] };
    const explicit = { '5A': null };
    expect(mergeEffectiveMenuConfig(explicit, derived)).toEqual({ '5A': [] });
  });

  it('explicit/derived null ou undefined → ne crash pas, retourne {}', () => {
    expect(mergeEffectiveMenuConfig(null, null)).toEqual({});
    expect(mergeEffectiveMenuConfig(undefined, undefined)).toEqual({});
  });
});
