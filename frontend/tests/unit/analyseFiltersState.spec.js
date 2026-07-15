// filtersState — état du panneau de filtres Analyse (audit 2026-07-06).
//
// Régression corrigée : le getter testait `catalogShopElements`, supprimé par la
// refonte data-driven → undefined → jamais `ready` → bandeau permanent
// « Failed to load the catalog » même quand tout était chargé. Contrat final :
//   - error/loading du CONTEXTE config ne s'appliquent que pour une config
//     PRÉCISE (sous « All Configurations », l'union différée ne doit jamais
//     afficher d'échec — le contexte n'est qu'un enrichissement) ;
//   - phases de chargement globales (loading / enriching sans records) → loading ;
//   - options absentes hors chargement → états vides NEUTRES (empty-no-*),
//     rendus avec un message dédié, jamais le texte d'échec ;
//   - sinon ready.

import analyseModule from '@/store/modules/analyse'

const { filtersState, salesMenuItemNames, salesMenuItemTypes, salesMenuItemCategories } =
  analyseModule.getters

const baseState = (over = {}) => ({
  configContextError: null,
  configContextLoading: false,
  loading: false,
  enriching: false,
  shopGranularData: [{ id: 'r1' }],
  filters: { selectedConfigurationId: null },
  ...over,
})
const baseGetters = (over = {}) => ({
  salesShopNames: ['Buvette Nord'],
  salesMenuItemNames: ['Bière'],
  ...over,
})
const withCfg = (st, cfg = 'cfg-1') => ({ ...st, filters: { selectedConfigurationId: cfg } })

describe('filtersState — cascade error / loading / empty / ready', () => {
  it('ready sous All Configurations (cfg null) quand ventes + articles présents', () => {
    expect(filtersState(baseState(), baseGetters())).toBe('ready')
  })

  it('erreur contexte IGNORÉE sous All Configurations (union différée = enrichissement)', () => {
    const st = baseState({ configContextError: 'boom' })
    expect(filtersState(st, baseGetters())).toBe('ready')
  })

  it('error / loading contexte quand une config précise est sélectionnée', () => {
    expect(filtersState(withCfg(baseState({ configContextError: 'boom' })), baseGetters())).toBe('error')
    expect(filtersState(withCfg(baseState({ configContextLoading: true })), baseGetters())).toBe('loading')
  })

  it('loading pendant la phase 1, et pendant la phase 2 tant qu’aucun record', () => {
    expect(filtersState(baseState({ loading: true }), baseGetters())).toBe('loading')
    expect(filtersState(baseState({ enriching: true, shopGranularData: [] }), baseGetters())).toBe('loading')
    // Phase 2 avec records déjà affichés → le panneau n'a pas à attendre.
    expect(filtersState(baseState({ enriching: true }), baseGetters())).toBe('ready')
  })

  it('empty-no-shops / empty-no-items quand les options data-driven sont vides', () => {
    expect(filtersState(baseState(), baseGetters({ salesShopNames: [] }))).toBe('empty-no-shops')
    expect(filtersState(baseState(), baseGetters({ salesMenuItemNames: [] }))).toBe('empty-no-items')
  })

  it('jamais un état vide pendant le chargement (anti-flash)', () => {
    const st = baseState({ loading: true })
    const g = baseGetters({ salesShopNames: [], salesMenuItemNames: [] })
    expect(filtersState(st, g)).toBe('loading')
  })
})

describe('salesMenuItem* — options articles data-driven (soldItemOptions, sans repli)', () => {
  it('lisent state.soldItemOptions (dédupliqué + trié), vide si rien de vendu', () => {
    const st = { soldItemOptions: { names: ['Coca', 'Bière', 'Coca'], types: ['Soft'], categories: [] } }
    expect(salesMenuItemNames(st)).toEqual(['Bière', 'Coca'])
    expect(salesMenuItemTypes(st)).toEqual(['Soft'])
    expect(salesMenuItemCategories(st)).toEqual([])
    expect(salesMenuItemNames({})).toEqual([]) // pas de repli assignés
  })

  it('les 3 getters existent (régression : consommés mais jamais définis → undefined)', () => {
    expect(typeof analyseModule.getters.salesMenuItemNames).toBe('function')
    expect(typeof analyseModule.getters.salesMenuItemTypes).toBe('function')
    expect(typeof analyseModule.getters.salesMenuItemCategories).toBe('function')
  })
})
