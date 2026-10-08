import { mergeScopedSpaces } from './scoped-spaces';

describe('mergeScopedSpaces', () => {
  it('accès complet : liste demandée telle quelle', () => {
    expect(mergeScopedSpaces(['a', 'b', 'a'], ['c'], 'ALL')).toEqual({ spaces: ['a', 'b'], foreign: [] });
  });

  it("compte A : renvoyer [A, B] d'un composant déjà A + B est accepté", () => {
    expect(mergeScopedSpaces(['a', 'b'], ['a', 'b'], ['a'])).toEqual({ spaces: ['a', 'b'], foreign: [] });
  });

  it("compte A : l'espace B qu'il ne voit pas est conservé même s'il ne le renvoie pas", () => {
    expect(mergeScopedSpaces(['a'], ['a', 'b'], ['a'])).toEqual({ spaces: ['a', 'b'], foreign: [] });
    expect(mergeScopedSpaces([], ['a', 'b'], ['a'])).toEqual({ spaces: ['b'], foreign: [] });
  });

  it('compte A : ajouter un espace qui ne lui appartient pas est signalé', () => {
    expect(mergeScopedSpaces(['a', 'z'], ['a'], ['a']).foreign).toEqual(['z']);
  });
});
