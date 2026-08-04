import Component from '@/components/EventPredictMenusSection.vue';
import { normalizeStr } from '@/utils/predictiveAnalytics';

const methods = Component.methods;

// NB : le garde-fou est GÉNÉRIQUE (aucun nom codé en dur). 2A/FRITES ne sont
// qu'un exemple ; « Bar Nord »/« Biere » ci-dessous prouve que la même logique
// s'applique à N'IMPORTE quel PDV et N'IMPORTE quel item.
const membership = new Map([
  [
    normalizeStr('2A'),
    {
      ids: new Set(['uuid-tenders', 'uuid-barre', 'uuid-burger']),
      names: new Set(
        ['2x Tenders Frites', 'Barre Chocolatee', 'Burger + Frites'].map(normalizeStr),
      ),
    },
  ],
  [
    normalizeStr('Bar Nord'),
    {
      ids: new Set(['uuid-biere', 'uuid-eau']),
      names: new Set(['Biere Pression', 'Eau Plate'].map(normalizeStr)),
    },
  ],
]);

const element = { id: 'el-2a', name: '2A' };

describe('garde-fou appartenance Space Menu (ouverture PDV fermé)', () => {
  const ctxMembership = (over = {}) => ({
    isItemAssigned: () => false,
    shopMenuMembership: membership,
    ...over,
  });

  it('isInShopMenu : item déjà assigné (enabled) → true', () => {
    const ctx = ctxMembership({ isItemAssigned: () => true });
    expect(methods.isInShopMenu.call(ctx, element, 'nimporte', 'X')).toBe(true);
  });

  it('isInShopMenu : item du menu par id (assigné mais désactivé, shop fermé) → true', () => {
    const ctx = ctxMembership();
    expect(methods.isInShopMenu.call(ctx, element, 'uuid-tenders', 'peu importe')).toBe(true);
  });

  it('isInShopMenu : item du menu par nom (clé synthétique) → true', () => {
    const ctx = ctxMembership();
    expect(methods.isInShopMenu.call(ctx, element, 'barre chocolatee', 'Barre Chocolatee')).toBe(true);
  });

  it('isInShopMenu : item hors menu (FRITES Weezevent non mappé) → false', () => {
    const ctx = ctxMembership();
    expect(methods.isInShopMenu.call(ctx, element, 'frites', 'FRITES')).toBe(false);
  });

  it('isInShopMenu : membership non chargé → true (rétro-compat, garde-fou inactif)', () => {
    const ctx = ctxMembership({ shopMenuMembership: null });
    expect(methods.isInShopMenu.call(ctx, element, 'frites', 'FRITES')).toBe(true);
  });

  it('isInShopMenu : shop inconnu dans membership → false', () => {
    const ctx = ctxMembership();
    expect(methods.isInShopMenu.call(ctx, { id: 'x', name: 'ZZ' }, 'uuid-tenders', 'X')).toBe(false);
  });

  // Généralité : la logique ne dépend d'aucun nom précis — elle vaut pour tout PDV.
  it('isInShopMenu : générique — item du menu d’un AUTRE shop (Bar Nord) → true', () => {
    const barNord = { id: 'el-bn', name: 'Bar Nord' };
    const ctx = ctxMembership();
    expect(methods.isInShopMenu.call(ctx, barNord, 'uuid-biere', 'Biere Pression')).toBe(true);
    expect(methods.isInShopMenu.call(ctx, barNord, 'eau plate', 'Eau Plate')).toBe(true);
  });

  it('isInShopMenu : générique — item d’un shop ne « fuit » pas vers un autre', () => {
    const barNord = { id: 'el-bn', name: 'Bar Nord' };
    const ctx = ctxMembership();
    // uuid-tenders appartient à 2A, PAS à Bar Nord → bloqué côté Bar Nord.
    expect(methods.isInShopMenu.call(ctx, barNord, 'uuid-tenders', '2x Tenders Frites')).toBe(false);
    // ...et Biere (Bar Nord) n'est pas dans le menu de 2A.
    expect(methods.isInShopMenu.call(ctx, element, 'uuid-biere', 'Biere Pression')).toBe(false);
  });
});

describe('onItemCheckboxChange : émission selon appartenance', () => {
  const mkCtx = (over = {}) => {
    const emitted = [];
    return {
      isShopOpen: () => false,
      toggleMenuItem: () => {},
      isInShopMenu: () => true,
      // BUG-291-02 : `onItemCheckboxChange` consulte la disponibilité serveur en
      // tête. Ce `this` est construit à la main → la méthode doit y figurer.
      // Le refus d'un article indisponible est couvert par
      // `eventPredictUnavailableNoSales.spec.js` ; ici on teste l'appartenance.
      isItemUnavailable: () => false,
      $emit(name, payload) {
        emitted.push([name, payload]);
      },
      _emitted: emitted,
      ...over,
    };
  };

  it('shop ouvert + item attachable (catalogue) coché → toggle local + write-through assign-shop-item enabled:true', () => {
    const ctx = mkCtx({
      isShopOpen: () => true,
      toggleMenuItem: jest.fn(),
      rowAddKind: () => 'reactivate',
    });
    methods.onItemCheckboxChange.call(ctx, element, 'uuid-tenders', true, { name: 'X' });
    expect(ctx.toggleMenuItem).toHaveBeenCalled();
    expect(ctx._emitted).toEqual([
      ['assign-shop-item', { elementId: 'el-2a', shopName: '2A', menuItemId: 'uuid-tenders', enabled: true }],
    ]);
  });

  it('shop ouvert + item synthétique non-catalogue (remap requis) coché → toggle local SEUL, aucun émit', () => {
    const ctx = mkCtx({
      isShopOpen: () => true,
      toggleMenuItem: jest.fn(),
      rowAddKind: () => 'remap',
    });
    methods.onItemCheckboxChange.call(ctx, element, 'frites', true, { name: 'FRITES' });
    expect(ctx.toggleMenuItem).toHaveBeenCalled();
    expect(ctx._emitted).toHaveLength(0);
  });

  it('shop ouvert + décochage → toggle local + write-through assign-shop-item enabled:false (toujours attachable)', () => {
    const ctx = mkCtx({ isShopOpen: () => true, toggleMenuItem: jest.fn() });
    methods.onItemCheckboxChange.call(ctx, element, 'uuid-tenders', false, { name: 'X' });
    expect(ctx.toggleMenuItem).toHaveBeenCalled();
    expect(ctx._emitted).toEqual([
      ['assign-shop-item', { elementId: 'el-2a', shopName: '2A', menuItemId: 'uuid-tenders', enabled: false }],
    ]);
  });

  it('shop fermé + item du menu coché → assign-shop-item', () => {
    const ctx = mkCtx({ isInShopMenu: () => true });
    methods.onItemCheckboxChange.call(ctx, element, 'uuid-tenders', true, { name: '2x Tenders Frites' });
    expect(ctx._emitted).toEqual([
      ['assign-shop-item', { elementId: 'el-2a', shopName: '2A', menuItemId: 'uuid-tenders', enabled: true }],
    ]);
  });

  it('shop fermé + item hors menu coché → assign-blocked, PAS d’assignation', () => {
    const ctx = mkCtx({ isInShopMenu: () => false });
    methods.onItemCheckboxChange.call(ctx, element, 'frites', true, { name: 'FRITES' });
    expect(ctx._emitted).toEqual([['assign-blocked', { shopName: '2A', itemName: 'FRITES' }]]);
  });

  it('shop fermé + décochage (retrait) → toujours permis même hors menu', () => {
    const ctx = mkCtx({ isInShopMenu: () => false });
    methods.onItemCheckboxChange.call(ctx, element, 'frites', false, { name: 'FRITES' });
    expect(ctx._emitted).toEqual([
      ['assign-shop-item', { elementId: 'el-2a', shopName: '2A', menuItemId: 'frites', enabled: false }],
    ]);
  });
});

describe('lignes fantômes (id hors catalogue) : détection + retrait', () => {
  // Catalogue tenant = UUIDs réels. 'frites' (id synthétique) n'y est PAS.
  const catalog = new Set(['uuid-tenders', 'uuid-barre', 'uuid-burger']);
  const mkCtx = (over = {}) => ({
    getFilteredMenuItems: () => [],
    getShopSearchQuery: () => '',
    assignedItemsForElement: () => [
      { id: 'frites', name: 'FRITES' }, // ligne fantôme (posté avant garde-fou)
      { id: 'uuid-tenders', name: '2x Tenders Frites' }, // ligne légitime
    ],
    checkMenuItemAvailability: (it) => it,
    getPredictedQuantity: () => 0,
    assignmentFeatureActive: () => true,
    spaceCatalogIdSet: catalog,
    ...over,
  });

  it('getGroupedMenuItems : _ghost=true pour id hors catalogue, false pour id catalogue', () => {
    const out = methods.getGroupedMenuItems.call(mkCtx(), element);
    const byId = Object.fromEntries(out.map((it) => [it.id, it]));
    expect(byId['frites']._ghost).toBe(true);
    expect(byId['uuid-tenders']._ghost).toBe(false);
  });

  it('getGroupedMenuItems : catalogue vide (pas chargé) → détection off, zéro faux positif', () => {
    const out = methods.getGroupedMenuItems.call(
      mkCtx({ spaceCatalogIdSet: new Set() }),
      element,
    );
    expect(out.every((it) => it._ghost === false)).toBe(true);
  });

  it('removeAssignedItem : émet assign-shop-item enabled:false (nettoyage)', () => {
    const emitted = [];
    const ctx = { $emit: (name, payload) => emitted.push([name, payload]) };
    methods.removeAssignedItem.call(ctx, element, { id: 'frites', name: 'FRITES' });
    expect(emitted).toEqual([
      ['assign-shop-item', { elementId: 'el-2a', shopName: '2A', menuItemId: 'frites', enabled: false }],
    ]);
  });
});

describe('Select All : write-through batch vers Space Menu', () => {
  const mkShopCtx = (over = {}) => {
    const emitted = [];
    return {
      menuItemsPerElement: new Map([
        ['el-2a', [
          { id: 'uuid-tenders', name: '2x Tenders Frites', isAvailable: true },
          { id: 'uuid-burger', name: 'Burger + Frites', isAvailable: true },
        ]],
      ]),
      selectedMenuItems: {},
      fbElementsById: new Map([['el-2a', element]]),
      rowAddKind: () => 'reactivate',
      isShopOpen: () => true,
      isInShopMenu: () => true,
      $emit(name, payload) { emitted.push([name, payload]) },
      _emitted: emitted,
      ...over,
    }
  };

  it('handleSelectAllForShop(true) : émet update local + 1 SEUL assign-shop-items batch avec tous les items', () => {
    const ctx = mkShopCtx();
    methods.handleSelectAllForShop.call(ctx, 'el-2a', true);
    expect(ctx._emitted).toEqual([
      ['update:selectedMenuItems', { 'el-2a': ['uuid-tenders', 'uuid-burger'] }],
      ['assign-shop-items', {
        elementId: 'el-2a',
        shopName: '2A',
        changes: { 'uuid-tenders': true, 'uuid-burger': true },
      }],
    ]);
  });

  it('handleSelectAllForShop(false) : batch enabled:false pour tous, même si rowAddKind dirait remap (décoche toujours permise)', () => {
    const ctx = mkShopCtx({ rowAddKind: () => 'remap' });
    methods.handleSelectAllForShop.call(ctx, 'el-2a', false);
    const batch = ctx._emitted.find(([name]) => name === 'assign-shop-items');
    expect(batch[1].changes).toEqual({ 'uuid-tenders': false, 'uuid-burger': false });
  });

  it('handleSelectAllForShop(true) : item remap-required (synthétique) exclu du batch, reste local only', () => {
    const ctx = mkShopCtx({
      rowAddKind: (el, id) => (id === 'uuid-tenders' ? 'reactivate' : 'remap'),
    });
    methods.handleSelectAllForShop.call(ctx, 'el-2a', true);
    const local = ctx._emitted.find(([name]) => name === 'update:selectedMenuItems');
    const batch = ctx._emitted.find(([name]) => name === 'assign-shop-items');
    // Local : les 2 items cochés (UX instantanée, cf. CA ajusté).
    expect(local[1]['el-2a']).toEqual(['uuid-tenders', 'uuid-burger']);
    // Batch : seul l'item attachable est persisté.
    expect(batch[1].changes).toEqual({ 'uuid-tenders': true });
  });

  it('handleSelectAllForShop : aucun item disponible → pas d\'émission assign-shop-items', () => {
    const ctx = mkShopCtx({ menuItemsPerElement: new Map([['el-2a', []]]) });
    methods.handleSelectAllForShop.call(ctx, 'el-2a', true);
    expect(ctx._emitted.some(([name]) => name === 'assign-shop-items')).toBe(false);
  });

  it('handleSelectAllForShop(true) sur shop FERMÉ : items hors Space Menu bloqués (pas de ligne fantôme), + assign-blocked', () => {
    const ctx = mkShopCtx({
      isShopOpen: () => false,
      isInShopMenu: (el, id) => id === 'uuid-tenders', // seul tenders est déjà membre
    });
    methods.handleSelectAllForShop.call(ctx, 'el-2a', true);
    const local = ctx._emitted.find(([name]) => name === 'update:selectedMenuItems');
    const batch = ctx._emitted.find(([name]) => name === 'assign-shop-items');
    const blocked = ctx._emitted.find(([name]) => name === 'assign-blocked');
    expect(local[1]['el-2a']).toEqual(['uuid-tenders']); // burger exclu, pas juste décoché visuellement
    expect(batch[1].changes).toEqual({ 'uuid-tenders': true });
    expect(blocked).toEqual(['assign-blocked', { shopName: '2A', itemName: '1 article(s) hors menu' }]);
  });

  it('handleSelectAllForShop(false) sur shop FERMÉ : décocher reste permis pour tous, aucun assign-blocked', () => {
    const ctx = mkShopCtx({ isShopOpen: () => false, isInShopMenu: () => false });
    methods.handleSelectAllForShop.call(ctx, 'el-2a', false);
    const batch = ctx._emitted.find(([name]) => name === 'assign-shop-items');
    expect(batch[1].changes).toEqual({ 'uuid-tenders': false, 'uuid-burger': false });
    expect(ctx._emitted.some(([name]) => name === 'assign-blocked')).toBe(false);
  });

  const barNord = { id: 'el-bn', name: 'Bar Nord' };
  const mkItemCtx = (over = {}) => {
    const emitted = [];
    return {
      groupByMenuItemArray: [
        {
          menuItemId: 'uuid-biere',
          menuItem: { name: 'Biere Pression' },
          shops: [{ element }, { element: barNord }],
        },
      ],
      isShopItemAvailable: () => true,
      selectedMenuItems: {},
      rowAddKind: () => 'reactivate',
      isShopOpen: () => true,
      isInShopMenu: () => true,
      $emit(name, payload) { emitted.push([name, payload]) },
      _emitted: emitted,
      ...over,
    }
  };

  it('handleSelectAllForMenuItem(true) : 1 assign-shop-item PAR shop attachable (pas de batch, 1 item par shop)', () => {
    const ctx = mkItemCtx();
    methods.handleSelectAllForMenuItem.call(ctx, 'uuid-biere', true);
    const assigns = ctx._emitted.filter(([name]) => name === 'assign-shop-item');
    expect(assigns).toEqual([
      ['assign-shop-item', { elementId: 'el-2a', shopName: '2A', menuItemId: 'uuid-biere', enabled: true }],
      ['assign-shop-item', { elementId: 'el-bn', shopName: 'Bar Nord', menuItemId: 'uuid-biere', enabled: true }],
    ]);
  });

  it('handleSelectAllForMenuItem(true) : shop remap-required exclu, l\'autre shop attachable reste émis', () => {
    const ctx = mkItemCtx({
      rowAddKind: (el) => (el.id === 'el-2a' ? 'reactivate' : 'remap'),
    });
    methods.handleSelectAllForMenuItem.call(ctx, 'uuid-biere', true);
    const assigns = ctx._emitted.filter(([name]) => name === 'assign-shop-item');
    expect(assigns).toEqual([
      ['assign-shop-item', { elementId: 'el-2a', shopName: '2A', menuItemId: 'uuid-biere', enabled: true }],
    ]);
  });

  it('handleSelectAllForMenuItem(false) : décoche toujours émise même si rowAddKind dirait remap', () => {
    const ctx = mkItemCtx({ rowAddKind: () => 'remap' });
    methods.handleSelectAllForMenuItem.call(ctx, 'uuid-biere', false);
    const assigns = ctx._emitted.filter(([name]) => name === 'assign-shop-item');
    expect(assigns).toEqual([
      ['assign-shop-item', { elementId: 'el-2a', shopName: '2A', menuItemId: 'uuid-biere', enabled: false }],
      ['assign-shop-item', { elementId: 'el-bn', shopName: 'Bar Nord', menuItemId: 'uuid-biere', enabled: false }],
    ]);
  });

  it('handleSelectAllForMenuItem(true) : shop FERMÉ non-membre exclu, shop ouvert (ou fermé membre) reste émis', () => {
    const ctx = mkItemCtx({
      isShopOpen: (id) => id === 'el-2a', // Bar Nord fermé
      isInShopMenu: () => false, // Bar Nord (fermé) : item pas membre → bloqué
    });
    methods.handleSelectAllForMenuItem.call(ctx, 'uuid-biere', true);
    const assigns = ctx._emitted.filter(([name]) => name === 'assign-shop-item');
    expect(assigns).toEqual([
      ['assign-shop-item', { elementId: 'el-2a', shopName: '2A', menuItemId: 'uuid-biere', enabled: true }],
    ]);
  });
});
