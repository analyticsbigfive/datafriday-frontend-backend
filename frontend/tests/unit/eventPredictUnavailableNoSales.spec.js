/**
 * BUG-291-02 — un article assigné au Space Menu du PDV mais NON DISPONIBLE côté
 * serveur (recette absente, ingrédient inactif / sans fournisseur, ou fournisseur
 * ne livrant pas l'espace) ne prévoit AUCUNE vente : ni quantité, ni CA, ni ligne
 * de stock-up. Il reste néanmoins VISIBLE dans l'onglet « Sans ventes prévues »
 * avec sa raison — disparaître sans explication est ce qu'on cherche à éviter.
 *
 * ⚠️ Distinct de `enabled === false` (article désactivé sur le menu du PDV), qui
 * garde son flux « réactiver » : les deux cohabitent dans le même écran et c'est
 * exactement là que le bug d'origine se logeait.
 */
import EventPredictStockUpSection from '@/components/EventPredictStockUpSection.vue'
import EventPredictMenusSection from '@/components/EventPredictMenusSection.vue'

const stockUp = EventPredictStockUpSection.methods
const menus = EventPredictMenusSection.methods

const SHOP = { id: 'shop-1', name: 'Bar Nord' }

// Cookie indisponible (pas de recette), Burger produisible.
const unavailableMap = new Map([
  ['bar nord', { ids: new Set(['mi-cookie']), names: new Set(['cookie']) }],
])

const menuItemsById = new Map([
  ['mi-burger', { id: 'mi-burger', name: 'Burger 25/26 (Aux)' }],
  ['mi-cookie', { id: 'mi-cookie', name: 'Cookie' }],
])

// ---------------------------------------------------------------- Stock-up ---

const stockUpCtx = (over = {}) => ({
  shopMenuUnavailable: unavailableMap,
  menuItemsById,
  fbElements: [SHOP],
  timelineDataIndex: new Map([
    ['shop-1|mi-burger', 95],
    ['shop-1|mi-cookie', 7],
  ]),
  quantityAdjustments: {},
  manualQuantities: {},
  isItemUnavailable: stockUp.isItemUnavailable,
  getPredictedQuantity: stockUp.getPredictedQuantity,
  getAdjustedQuantity: stockUp.getAdjustedQuantity,
  ...over,
})

describe('Stock-up — quantités d\'un article non produisible', () => {
  it('quantité prédite forcée à 0 malgré une timeline qui en porte', () => {
    const ctx = stockUpCtx()
    expect(ctx.getPredictedQuantity.call(ctx, SHOP, 'mi-cookie')).toBe(0)
    // L'article produisible du même PDV n'est pas affecté.
    expect(ctx.getPredictedQuantity.call(ctx, SHOP, 'mi-burger')).toBe(95)
  })

  it('RÉGRESSION : une quantité MANUELLE ne ressuscite pas un article indisponible', () => {
    // Le piège du correctif lui-même : `getAdjustedQuantity` bascule sur la
    // quantité manuelle dès que la base vaut 0. Forcer le prédit à 0 sans garder
    // aussi l'ajusté rouvrirait la porte que ce lot ferme, et l'article
    // franchirait le garde `adjustedQty === 0` de `shopStockData`.
    const ctx = stockUpCtx({ manualQuantities: { 'shop-1-mi-cookie': 12 } })
    expect(ctx.getAdjustedQuantity.call(ctx, 'shop-1', 'mi-cookie')).toBe(0)
  })

  it('appariement par NOM quand l\'index ne connaît pas l\'id interrogé', () => {
    const ctx = stockUpCtx({
      menuItemsById: new Map([['ext-weez-cookie', { id: 'ext-weez-cookie', name: 'Cookie' }]]),
    })
    expect(ctx.isItemUnavailable.call(ctx, SHOP, 'ext-weez-cookie')).toBe(true)
  })

  it('prop absente → comportement strictement inchangé (rétro-compat)', () => {
    const ctx = stockUpCtx({ shopMenuUnavailable: null })
    expect(ctx.isItemUnavailable.call(ctx, SHOP, 'mi-cookie')).toBe(false)
    expect(ctx.getPredictedQuantity.call(ctx, SHOP, 'mi-cookie')).toBe(7)
  })

  it('shop absent de l\'index → tous ses articles restent prévus', () => {
    const other = { id: 'shop-2', name: 'Bar Sud' }
    const ctx = stockUpCtx({
      fbElements: [SHOP, other],
      timelineDataIndex: new Map([['shop-2|mi-cookie', 7]]),
    })
    expect(ctx.getPredictedQuantity.call(ctx, other, 'mi-cookie')).toBe(7)
  })
})

// ------------------------------------------------------------------- Menus ---

const menusCtx = (over = {}) => ({
  shopMenuUnavailable: unavailableMap,
  menuItemsById,
  fbElementsById: new Map([['shop-1', SHOP]]),
  hasOpenData: false,
  timelineDataIndex: new Map([
    ['shop-1|mi-burger', 95],
    ['shop-1|mi-cookie', 7],
  ]),
  selectedMenuItems: {},
  quantityAdjustments: {},
  manualQuantities: {},
  spaceCatalogIdSet: new Set(['mi-burger', 'mi-cookie']),
  shopSearchQuery: {},
  isShopOpen: () => true,
  isItemUnavailable: menus.isItemUnavailable,
  getPredictedQuantity: menus.getPredictedQuantity,
  getAdjustedQuantity: menus.getAdjustedQuantity,
  getManualQuantity: menus.getManualQuantity,
  isMenuItemSelected: menus.isMenuItemSelected,
  itemCheckboxState: menus.itemCheckboxState,
  isItemAssigned: () => true,
  getShopSearchQuery: () => '',
  getFilteredMenuItems: () => [],
  checkMenuItemAvailability: (mi) => ({ ...mi, isAvailable: true, missingIngredients: [] }),
  assignedItemsForElement: () => [
    { id: 'mi-burger', name: 'Burger 25/26 (Aux)', available: true, hasRecipe: true },
    {
      id: 'mi-cookie',
      name: 'Cookie',
      available: false,
      hasRecipe: false,
      missingIngredients: [],
    },
  ],
  getGroupedMenuItems: menus.getGroupedMenuItems,
  ...over,
})

describe('Menus — bucket et sélection d\'un article non produisible', () => {
  it('range l\'article indisponible en « Sans ventes prévues », pas en « Non attachés »', () => {
    const ctx = menusCtx()
    const rows = ctx.getGroupedMenuItems.call(ctx, SHOP)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))

    expect(byId['mi-cookie']._bucket).toBe('noSales')
    expect(byId['mi-burger']._bucket).toBe('sales')
  })

  it('la vérité SERVEUR écrase la dérivation front de disponibilité', () => {
    // `checkMenuItemAvailability` renvoie ici `isAvailable: true` (règle front
    // obsolète « fournisseur sans sites = livre tous les espaces ») : l'override
    // doit être écrit APRÈS le spread, sinon la dérivation front reprend la main.
    const ctx = menusCtx()
    const cookie = ctx.getGroupedMenuItems.call(ctx, SHOP).find((r) => r.id === 'mi-cookie')

    expect(cookie.isAvailable).toBe(false)
    expect(cookie._serverUnavailable).toBe(true)
    // Aucune recette : c'est cette raison-là qu'on affiche, pas « Manquant : … ».
    expect(cookie._serverNoRecipe).toBe(true)
  })

  it('la case reste décochée même si une version sauvegardée le porte encore', () => {
    const ctx = menusCtx({ selectedMenuItems: { 'shop-1': ['mi-cookie'] } })
    expect(ctx.itemCheckboxState.call(ctx, SHOP, 'mi-cookie')).toBe(false)
    // Neutralisation à la LECTURE : la sélection persistée n'est pas réécrite.
    expect(ctx.selectedMenuItems['shop-1']).toEqual(['mi-cookie'])
  })

  it('prop absente → l\'article repasse en « Ventes prévues » (rétro-compat)', () => {
    const ctx = menusCtx({ shopMenuUnavailable: null })
    const cookie = ctx.getGroupedMenuItems.call(ctx, SHOP).find((r) => r.id === 'mi-cookie')
    expect(cookie._bucket).toBe('sales')
  })
})

// ------------------------------------------- Prédicats de construction (v2) ---

describe('Index d\'assignation — prédicats (correctif v2, capture Cookie 1 A)', () => {
  // Réplique à la main les trois filtres de `loadShopMenuAssignment`
  // (EventPredictView est intestable directement : il tire axios). Motif identique
  // à shopMenuAvailabilityStore.spec.js. Fixture = la capture réelle du 1 A :
  // Cookie DÉSACTIVÉ ET improduisible — le double état qui passait entre les
  // mailles du filtre v1 (`enabled === true && available === false`).
  const items = [
    { id: 'mi-burger', name: 'Burger', enabled: true, assigned: true, available: true },
    { id: 'mi-cookie', name: 'Cookie', enabled: false, assigned: true, available: false },
    { id: 'mi-chips', name: "Chips Lay's", enabled: false, assigned: true, available: true },
    { id: 'mi-hors-menu', name: 'Hors menu', enabled: false, assigned: false, available: false },
  ]

  const unavailablePred = (it) => it && it.available === false
  const idPred = (it) => it && it.enabled === true && it.available !== false
  const displayPred = (it) =>
    it && (it.enabled === true || (it.assigned === true && it.available === false))

  it('unavailableMap : `available === false` fait foi SEUL — Cookie y entre malgré enabled:false', () => {
    const ids = items.filter(unavailablePred).map((it) => it.id)
    expect(ids).toContain('mi-cookie')
    expect(ids).not.toContain('mi-chips')
    expect(ids).not.toContain('mi-burger')
  })

  it('itemMap (liste affichée) : activés + assignés-improduisibles, PAS les désactivés-disponibles', () => {
    const ids = items.filter(displayPred).map((it) => it.id)
    expect(ids).toEqual(['mi-burger', 'mi-cookie'])
    // Chips reste hors liste → bucket « Non attachés », badge « désactivé »,
    // flux réactiver inchangé. Un improduisible NON assigné reste invisible.
    expect(ids).not.toContain('mi-chips')
    expect(ids).not.toContain('mi-hors-menu')
  })

  it('idMap (auto-sélection) : activés produisibles seuls', () => {
    expect(items.filter(idPred).map((it) => it.id)).toEqual(['mi-burger'])
  })

  it('backend legacy sans champ `available` : rien d\'indisponible, menus intacts', () => {
    const legacy = [{ id: 'mi-x', name: 'X', enabled: true, assigned: true }]
    expect(legacy.filter(unavailablePred)).toHaveLength(0)
    expect(legacy.filter(idPred).map((it) => it.id)).toEqual(['mi-x'])
  })
})

describe('Menus — le zérotage ne déborde pas sur les désactivés-disponibles', () => {
  it('Chips (enabled:false, disponible, hors assignedItems) reste en « Non attachés » avec sa quantité', () => {
    const ctx = menusCtx({
      timelineDataIndex: new Map([
        ['shop-1|mi-burger', 95],
        ['shop-1|mi-cookie', 7],
        ['shop-1|mi-chips', 12],
      ]),
      getFilteredMenuItems: () => [{ id: 'mi-chips', name: "Chips Lay's" }],
    })
    const rows = ctx.getGroupedMenuItems.call(ctx, SHOP)
    const chips = rows.find((r) => r.id === 'mi-chips')
    expect(chips._bucket).toBe('unmapped')
  })
})

describe('Menus — auto-sélection d\'un événement neuf', () => {
  it('ne coche pas d\'office un article qu\'on ne peut pas fabriquer', () => {
    const emitted = []
    const ctx = {
      fbElements: [SHOP],
      menuItems: [{ id: 'mi-burger' }, { id: 'mi-cookie' }],
      selectedMenuItems: {},
      shopMenuUnavailable: unavailableMap,
      menuItemsById,
      assignmentFeatureActive: () => true,
      assignedIdsForElement: () => new Set(['mi-burger', 'mi-cookie']),
      isItemUnavailable: menus.isItemUnavailable,
      $emit: (name, payload) => emitted.push([name, payload]),
    }

    menus.autoSelectIfEmpty.call(ctx)

    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toBe('update:selectedMenuItems')
    expect(emitted[0][1]['shop-1']).toEqual(['mi-burger'])
  })
})
