import {
  buildDisplayNameIndex,
  resolveDisplayNameGroup,
  NO_DISPLAY_NAME_KEY,
} from '@/utils/analyseDimensions';
import { nextGroupSelection } from '@/composables/useFilters';

// Regroupement « par DisplayName » du panneau Performance des articles (17/08) :
// le référentiel DisplayName est N→1 au-dessus des MenuItem — plusieurs variantes
// d'un même produit commercial (Happy Hour, formats) doivent fusionner en une ligne.
describe('buildDisplayNameIndex', () => {
  const catalogue = [
    { id: 'mi-1', name: 'Coca-Cola CAN 33cl 25/26', displayName: { id: 'dn-1', name: 'Coca-Cola' } },
    { id: 'mi-2', name: 'Coca-Cola CAN 33cl HH 25/26', displayName: { id: 'dn-1', name: 'Coca-Cola' } },
    { id: 'mi-3', name: 'Bière blonde 50cl', displayName: null },
    { id: 'mi-4', name: 'Hot Dog' },
  ];

  it('indexe les articles porteurs d’un DisplayName, ignore les autres', () => {
    const idx = buildDisplayNameIndex(catalogue);

    expect(idx.nameByMenuItemId.get('mi-1')).toBe('Coca-Cola');
    expect(idx.nameByMenuItemId.get('mi-2')).toBe('Coca-Cola');
    expect(idx.nameByMenuItemId.has('mi-3')).toBe(false);
    expect(idx.nameByMenuItemId.has('mi-4')).toBe(false);
  });

  it('regroupe les noms d’articles membres, dédupliqués', () => {
    const idx = buildDisplayNameIndex([
      ...catalogue,
      // Doublon de nom (même article ré-émis par une autre page catalogue).
      { id: 'mi-5', name: 'Coca-Cola CAN 33cl 25/26', displayName: { id: 'dn-1', name: 'Coca-Cola' } },
    ]);

    expect(idx.itemNamesByDisplayName.get('Coca-Cola')).toEqual([
      'Coca-Cola CAN 33cl 25/26',
      'Coca-Cola CAN 33cl HH 25/26',
    ]);
  });

  it('accepte un DisplayName sérialisé en simple chaîne', () => {
    const idx = buildDisplayNameIndex([{ id: 'mi-9', name: 'Frites', displayName: 'Frites maison' }]);

    expect(idx.nameByMenuItemId.get('mi-9')).toBe('Frites maison');
  });

  it('catalogue vide ou absent → index vide, pas d’exception', () => {
    expect(buildDisplayNameIndex().nameByMenuItemId.size).toBe(0);
    expect(buildDisplayNameIndex([]).itemNamesByDisplayName.size).toBe(0);
  });
});

describe('resolveDisplayNameGroup', () => {
  const idx = buildDisplayNameIndex([
    { id: 'mi-1', name: 'Coca-Cola CAN 33cl 25/26', displayName: { id: 'dn-1', name: 'Coca-Cola' } },
    { id: 'mi-3', name: 'Bière blonde 50cl', displayName: null },
  ]);

  it('article mappé AVEC DisplayName → le libellé commercial', () => {
    expect(resolveDisplayNameGroup({ menuItemId: 'mi-1' }, idx)).toBe('Coca-Cola');
  });

  it('repli sur mappedMenuItemId quand menuItemId est absent', () => {
    expect(resolveDisplayNameGroup({ mappedMenuItemId: 'mi-1' }, idx)).toBe('Coca-Cola');
  });

  it('article mappé SANS DisplayName → bucket unique', () => {
    expect(resolveDisplayNameGroup({ menuItemId: 'mi-3' }, idx)).toBe(NO_DISPLAY_NAME_KEY);
  });

  // Décision produit 17/08 : un seul bucket, qui mêle « pas encore renseigné »
  // et « vente non rattachée au catalogue ».
  it('vente non rattachée (aucun id) → même bucket', () => {
    expect(resolveDisplayNameGroup({ itemName: 'Produit Weezevent inconnu' }, idx)).toBe(
      NO_DISPLAY_NAME_KEY,
    );
  });

  it('index vide → tout tombe dans le bucket (aucun crash)', () => {
    expect(resolveDisplayNameGroup({ menuItemId: 'mi-1' }, buildDisplayNameIndex([]))).toBe(
      NO_DISPLAY_NAME_KEY,
    );
    expect(resolveDisplayNameGroup({ menuItemId: 'mi-1' }, null)).toBe(NO_DISPLAY_NAME_KEY);
  });

  it('id numérique côté record, string côté catalogue → match quand même', () => {
    const numIdx = buildDisplayNameIndex([{ id: 42, name: 'Frites', displayName: { name: 'Frites' } }]);
    expect(resolveDisplayNameGroup({ menuItemId: 42 }, numIdx)).toBe('Frites');
  });
});

// Clic sur une ligne groupée : le filtre article porte sur TOUS les membres du
// groupe, en sémantique d'ensemble (pas un toggle membre par membre).
describe('nextGroupSelection — toggle groupé du filtre article', () => {
  const groupe = ['Coca-Cola CAN 33cl', 'Coca-Cola CAN 33cl HH'];

  it('aucun membre sélectionné → on ajoute tout le groupe', () => {
    expect(nextGroupSelection([], groupe)).toEqual(groupe);
  });

  it('sélection PARTIELLE → on complète (et on ne retire rien)', () => {
    expect(nextGroupSelection(['Coca-Cola CAN 33cl'], groupe)).toEqual([
      'Coca-Cola CAN 33cl',
      'Coca-Cola CAN 33cl HH',
    ]);
  });

  it('groupe entièrement sélectionné → on le retire en entier', () => {
    expect(nextGroupSelection([...groupe, 'Hot Dog'], groupe)).toEqual(['Hot Dog']);
  });

  it('préserve les valeurs hors groupe et ne duplique pas', () => {
    expect(nextGroupSelection(['Hot Dog', 'Coca-Cola CAN 33cl'], groupe)).toEqual([
      'Hot Dog',
      'Coca-Cola CAN 33cl',
      'Coca-Cola CAN 33cl HH',
    ]);
  });

  it('groupe vide → sélection inchangée', () => {
    expect(nextGroupSelection(['Hot Dog'], [])).toEqual(['Hot Dog']);
  });
});
