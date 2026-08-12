// Bug shop 5A (cf. docs/PLAN_EVENTPREDICT_SPACE_MENU_SELECTION.md) : un [] explicite
// (tout décoché) ne doit JAMAIS retomber sur derived (attachés Space Menu) — sinon
// "tout décoché" redevient coché, en LIVE (pas besoin de reload).
import { mergeEffectiveMenuConfig, applyAssignToExplicit } from '@/utils/menuConfigSelection';

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

// Auto-sélection à la réactivation (maquettes 08/2026) : la clé explicite
// masque la sélection dérivée du refetch Space Menus → il faut y répercuter
// l'assignation, sinon un article réactivé via le kebab reste décoché.
describe('applyAssignToExplicit — répercussion d\'une assignation dans la sélection explicite', () => {
  it('clé shop présente + enabled → article ajouté à la sélection', () => {
    const explicit = { '5A': ['Burger'] };
    expect(applyAssignToExplicit(explicit, '5A', 'Frites', true)).toEqual({
      '5A': ['Burger', 'Frites'],
    });
  });

  it('clé shop présente + disabled → article retiré de la sélection', () => {
    const explicit = { '5A': ['Burger', 'Frites'] };
    expect(applyAssignToExplicit(explicit, '5A', 'Frites', false)).toEqual({
      '5A': ['Burger'],
    });
  });

  it('clé shop ABSENTE → explicit inchangé (même référence) : le dérivé fait le travail', () => {
    const explicit = { '5A': ['Burger'] };
    expect(applyAssignToExplicit(explicit, '6B', 'Frites', true)).toBe(explicit);
  });

  it('article déjà présent + enabled → aucun doublon, même référence', () => {
    const explicit = { '5A': ['Frites'] };
    expect(applyAssignToExplicit(explicit, '5A', 'Frites', true)).toBe(explicit);
  });

  it('article absent + disabled → rien à retirer, même référence', () => {
    const explicit = { '5A': ['Burger'] };
    expect(applyAssignToExplicit(explicit, '5A', 'Frites', false)).toBe(explicit);
  });

  it('clé explicite [] (tout décoché) + réactivation → article recoché', () => {
    const explicit = { '5A': [] };
    expect(applyAssignToExplicit(explicit, '5A', 'Frites', true)).toEqual({ '5A': ['Frites'] });
  });

  it('ne mute pas l\'objet d\'entrée', () => {
    const explicit = { '5A': ['Burger'] };
    applyAssignToExplicit(explicit, '5A', 'Frites', true);
    expect(explicit).toEqual({ '5A': ['Burger'] });
  });

  it('entrées invalides (null, ids manquants) → pas de crash, entrée rendue', () => {
    expect(applyAssignToExplicit(null, '5A', 'Frites', true)).toEqual({});
    const explicit = { '5A': [] };
    expect(applyAssignToExplicit(explicit, null, 'Frites', true)).toBe(explicit);
    expect(applyAssignToExplicit(explicit, '5A', null, true)).toBe(explicit);
  });
});
