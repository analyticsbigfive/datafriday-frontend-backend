/**
 * Estimation 0 (fiche 311_01) — event FUTUR sans historique comparable.
 *
 * Avant : timeline prédite vide → predictionItemsContext = 'not-calculated' →
 * les sections Configuration + Stock up affichent « Aucun article disponible »
 * et la saisie manuelle (manualQuantities) est inatteignable.
 *
 * Après : bouton « Démarrez une estimation » → mode estimation actif → la
 * branche 'not-calculated' devient 'ready' et la grille PDV × articles se rend
 * depuis le Space Menu de la configuration, prédictions à 0.
 *
 * La logique de contexte/éligibilité vit dans utils/estimationMode.js
 * (EventPredictView.vue n'est pas importable en Jest — même précédent que
 * mergeEffectiveMenuConfig).
 */
import {
  resolveItemsContext,
  isEstimationEligible,
  uniformValue,
  applyFanoutQuantity,
  splitQuantityAcrossKeys,
  estimationSliderMax,
} from '@/utils/estimationMode'
import EventPredictMenusSection from '@/components/space-workspace/event-predict/sections/EventPredictMenusSection.vue'

const menus = EventPredictMenusSection.methods

// Cas nominal : event futur, timeline vide, config avec shops et assignation OK.
const base = {
  loading: false,
  hasConfigShops: true,
  assignmentMissing: false,
  isPastEvent: false,
  timelineEmpty: true,
  estimationActive: false,
}

describe('resolveItemsContext — Estimation 0', () => {
  it("sans estimation : event futur + timeline vide → 'not-calculated' (comportement historique)", () => {
    expect(resolveItemsContext(base)).toBe('not-calculated')
  })

  it("estimation active : la même situation devient 'ready'", () => {
    expect(resolveItemsContext({ ...base, estimationActive: true })).toBe('ready')
  })

  it("les états prioritaires gagnent toujours sur l'estimation", () => {
    expect(resolveItemsContext({ ...base, estimationActive: true, loading: true })).toBe('loading')
    expect(resolveItemsContext({ ...base, estimationActive: true, hasConfigShops: false })).toBe('no-config')
    expect(resolveItemsContext({ ...base, estimationActive: true, assignmentMissing: true })).toBe('no-mapping')
  })

  it("event passé ou timeline non vide → 'ready' inchangé, estimation sans effet", () => {
    expect(resolveItemsContext({ ...base, isPastEvent: true, timelineEmpty: false })).toBe('ready')
    expect(resolveItemsContext({ ...base, timelineEmpty: false, estimationActive: true })).toBe('ready')
  })
})

describe('isEstimationEligible', () => {
  const eligible = {
    isPastEvent: false,
    timelineEmpty: true,
    assignmentLoaded: true,
    assignmentMissing: false,
    configShopCount: 3,
  }

  it('vrai pour le cas nominal (futur, sans timeline, assignation chargée, ≥1 shop)', () => {
    expect(isEstimationEligible(eligible)).toBe(true)
  })

  it.each([
    ['event passé', { isPastEvent: true }],
    ['timeline présente', { timelineEmpty: false }],
    ['assignation pas encore chargée', { assignmentLoaded: false }],
    ['aucun item assigné (no-mapping prioritaire)', { assignmentMissing: true }],
    ['aucun shop dans la config', { configShopCount: 0 }],
  ])('faux si %s', (_label, over) => {
    expect(isEstimationEligible({ ...eligible, ...over })).toBe(false)
  })
})

describe('EventPredictMenusSection — comportements gardés par estimationActive', () => {
  it("getShopTab : défaut 'noSales' en mode estimation (l'onglet ventes est vide), 'sales' sinon", () => {
    expect(menus.getShopTab.call({ shopTab: {}, estimationActive: true }, 'shop-1')).toBe('noSales')
    expect(menus.getShopTab.call({ shopTab: {}, estimationActive: false }, 'shop-1')).toBe('sales')
    // Choix explicite de l'utilisateur : toujours prioritaire sur le défaut.
    expect(
      menus.getShopTab.call({ shopTab: { 'shop-1': 'sales' }, estimationActive: true }, 'shop-1'),
    ).toBe('sales')
  })

  it('manualSliderMax : plafond étendu par la valeur tapée (volumes stade > 500)', () => {
    const ctx = {
      manualQtyMax: 500,
      manualQuantities: { 'shop-1-mi-1': 1200 },
      getManualQuantity: menus.getManualQuantity,
    }
    expect(menus.manualSliderMax.call(ctx, 'shop-1', 'mi-1')).toBe(1200)
    expect(menus.manualSliderMax.call(ctx, 'shop-1', 'mi-2')).toBe(500)
  })

  it('handleManualQuantity : accepte la valeur string de l\'input number (clamp + round)', () => {
    const emitted = []
    const ctx = {
      manualQuantities: {},
      isMenuItemSelected: () => true,
      $emit: (evt, payload) => emitted.push([evt, payload]),
    }
    menus.handleManualQuantity.call(ctx, 'shop-1', 'mi-1', '1200')
    expect(emitted).toEqual([['update:manualQuantities', { 'shop-1-mi-1': 1200 }]])
    emitted.length = 0
    menus.handleManualQuantity.call(ctx, 'shop-1', 'mi-1', '-5')
    expect(emitted).toEqual([['update:manualQuantities', { 'shop-1-mi-1': 0 }]])
  })
})

// ---- Fiche 311_02 : sliders fan-out ABSOLUS (base prédite 0 → % inopérant) ----

describe('uniformValue', () => {
  it('LA valeur si toutes identiques, null si mixte ou vide', () => {
    expect(uniformValue([40, 40, 40])).toBe(40)
    expect(uniformValue([40, 60])).toBeNull()
    expect(uniformValue([])).toBeNull()
    // Valeurs d'input string normalisées en nombre.
    expect(uniformValue(['40', 40])).toBe(40)
  })
})

describe('applyFanoutQuantity', () => {
  it('pose la quantité (entier ≥ 0) sur chaque clé, sans muter l\'objet source', () => {
    const current = { 'shop-1-mi-1': 5, 'shop-2-mi-9': 12 }
    const next = applyFanoutQuantity(current, ['shop-1-mi-1', 'shop-1-mi-2'], '40.6')
    expect(next).toEqual({ 'shop-1-mi-1': 41, 'shop-1-mi-2': 41, 'shop-2-mi-9': 12 })
    expect(current).toEqual({ 'shop-1-mi-1': 5, 'shop-2-mi-9': 12 })
  })

  it('clamp à 0 les valeurs négatives ou invalides', () => {
    expect(applyFanoutQuantity({}, ['k'], -5)).toEqual({ k: 0 })
    expect(applyFanoutQuantity({}, ['k'], 'abc')).toEqual({ k: 0 })
  })
})

// ---- BUG-316-01 : le slider article répartit un TOTAL (plus de duplication ×N) ----

describe('splitQuantityAcrossKeys', () => {
  it('équiréparti au plus juste, somme strictement égale au total, sans muter la source', () => {
    const current = { 'shop-9-mi-9': 7 }
    const next = splitQuantityAcrossKeys(current, ['a', 'b', 'c', 'd'], 129)
    expect(next).toEqual({ 'shop-9-mi-9': 7, a: 33, b: 32, c: 32, d: 32 })
    expect(Object.values({ a: next.a, b: next.b, c: next.c, d: next.d }).reduce((s, v) => s + v, 0)).toBe(129)
    expect(current).toEqual({ 'shop-9-mi-9': 7 })
  })

  it('le reste va aux premières clés (ordre d\'entrée)', () => {
    expect(splitQuantityAcrossKeys({}, ['a', 'b', 'c'], 5)).toEqual({ a: 2, b: 2, c: 1 })
  })

  it('total 0, négatif ou invalide → 0 partout ; liste vide → objet inchangé', () => {
    expect(splitQuantityAcrossKeys({}, ['a', 'b'], 0)).toEqual({ a: 0, b: 0 })
    expect(splitQuantityAcrossKeys({}, ['a'], -12)).toEqual({ a: 0 })
    expect(splitQuantityAcrossKeys({}, ['a'], 'abc')).toEqual({ a: 0 })
    expect(splitQuantityAcrossKeys({ x: 4 }, [], 50)).toEqual({ x: 4 })
  })

  it('valeur d\'input string arrondie comme applyFanoutQuantity', () => {
    expect(splitQuantityAcrossKeys({}, ['a', 'b'], '41.6')).toEqual({ a: 21, b: 21 })
  })
})

describe('estimationSliderMax', () => {
  it('échelle choisie, étendue par la valeur courante, défaut 1000', () => {
    expect(estimationSliderMax(1000, 0)).toBe(1000)
    expect(estimationSliderMax(200, 850)).toBe(850) // valeur posée > échelle
    expect(estimationSliderMax('', 0)).toBe(1000) // saisie vide → défaut
    expect(estimationSliderMax(0, 0)).toBe(1000)
  })
})

describe('EventPredictMenusSection — fan-out absolu (mode estimation)', () => {
  const ctxShop = (emitted) => ({
    selectedMenuItems: { 'shop-1': ['mi-1', 'mi-2'] },
    manualQuantities: { 'shop-1-mi-1': 40 },
    getShopEstimationValues: menus.getShopEstimationValues,
    $emit: (evt, payload) => emitted.push([evt, payload]),
  })

  it('handleShopEstimationQty : pose la quantité sur tous les items cochés du shop', () => {
    const emitted = []
    menus.handleShopEstimationQty.call(ctxShop(emitted), 'shop-1', 40)
    expect(emitted).toEqual([
      ['update:manualQuantities', { 'shop-1-mi-1': 40, 'shop-1-mi-2': 40 }],
    ])
  })

  it('handleShopEstimationQty : no-op sans item coché (parité slider %)', () => {
    const emitted = []
    const ctx = { ...ctxShop(emitted), selectedMenuItems: {} }
    menus.handleShopEstimationQty.call(ctx, 'shop-1', 40)
    expect(emitted).toHaveLength(0)
  })

  it('getShopEstimationQty / isShopEstimationMixed : valeur commune sinon Mixed', () => {
    const uniform = {
      selectedMenuItems: { 'shop-1': ['mi-1', 'mi-2'] },
      manualQuantities: { 'shop-1-mi-1': 40, 'shop-1-mi-2': 40 },
      getShopEstimationValues: menus.getShopEstimationValues,
    }
    expect(menus.getShopEstimationQty.call(uniform, 'shop-1')).toBe(40)
    expect(menus.isShopEstimationMixed.call(uniform, 'shop-1')).toBe(false)
    const mixed = { ...uniform, manualQuantities: { 'shop-1-mi-1': 40, 'shop-1-mi-2': 60 } }
    expect(menus.getShopEstimationQty.call(mixed, 'shop-1')).toBe(0)
    expect(menus.isShopEstimationMixed.call(mixed, 'shop-1')).toBe(true)
  })

  it('shopEstimationSliderMax : échelle éditable, étendue par la valeur courante', () => {
    const ctx = {
      estimationScaleMax: 1000,
      selectedMenuItems: { 'shop-1': ['mi-1'] },
      manualQuantities: { 'shop-1-mi-1': 2500 },
      getShopEstimationValues: menus.getShopEstimationValues,
    }
    expect(menus.shopEstimationSliderMax.call(ctx, 'shop-1')).toBe(2500)
    expect(menus.shopEstimationSliderMax.call({ ...ctx, manualQuantities: {} }, 'shop-1')).toBe(1000)
  })

  it('onEstimationScaleMax : clamp saisie invalide → 1000, plancher 10', () => {
    const ctx = { estimationScaleMax: 1000 }
    menus.onEstimationScaleMax.call(ctx, '300')
    expect(ctx.estimationScaleMax).toBe(300)
    menus.onEstimationScaleMax.call(ctx, '')
    expect(ctx.estimationScaleMax).toBe(1000)
    menus.onEstimationScaleMax.call(ctx, '3')
    expect(ctx.estimationScaleMax).toBe(1000)
  })

  // BUG-316-01 : le slider article porte le TOTAL, réparti sur les PDV cochés
  // (25 saisis donnaient auparavant 25 × 2 shops = 50 au Stock up).
  it('handleItemEstimationQty : répartit le TOTAL sur les PDV cochés de l\'article', () => {
    const emitted = []
    const ctx = {
      fbElements: [{ id: 'shop-1' }, { id: 'shop-2' }, { id: 'shop-3' }],
      selectedMenuItems: { 'shop-1': ['mi-1'], 'shop-2': ['mi-1'], 'shop-3': ['mi-9'] },
      manualQuantities: {},
      getSelectedElementsForMenuItem: menus.getSelectedElementsForMenuItem,
      $emit: (evt, payload) => emitted.push([evt, payload]),
    }
    menus.handleItemEstimationQty.call(ctx, 'mi-1', 25)
    expect(emitted).toEqual([
      ['update:manualQuantities', { 'shop-1-mi-1': 13, 'shop-2-mi-1': 12 }],
    ])
  })

  it('getItemEstimationQty : SOMME des PDV cochés (total affiché), jamais « Mixed »', () => {
    const ctx = {
      fbElements: [{ id: 'shop-1' }, { id: 'shop-2' }],
      selectedMenuItems: { 'shop-1': ['mi-1'], 'shop-2': ['mi-1'] },
      manualQuantities: { 'shop-1-mi-1': 13, 'shop-2-mi-1': 12 },
      getSelectedElementsForMenuItem: menus.getSelectedElementsForMenuItem,
      getItemEstimationValues: menus.getItemEstimationValues,
    }
    expect(menus.getItemEstimationQty.call(ctx, 'mi-1')).toBe(25)
    expect(menus.isItemEstimationMixed.call(ctx, 'mi-1')).toBe(false)
  })

  it('itemEstimationSliderMax : le plafond couvre le TOTAL courant', () => {
    const ctx = {
      estimationScaleMax: 1000,
      fbElements: [{ id: 'shop-1' }, { id: 'shop-2' }],
      selectedMenuItems: { 'shop-1': ['mi-1'], 'shop-2': ['mi-1'] },
      manualQuantities: { 'shop-1-mi-1': 800, 'shop-2-mi-1': 700 },
      getSelectedElementsForMenuItem: menus.getSelectedElementsForMenuItem,
      getItemEstimationValues: menus.getItemEstimationValues,
      getItemEstimationQty: menus.getItemEstimationQty,
    }
    expect(menus.itemEstimationSliderMax.call(ctx, 'mi-1')).toBe(1500)
  })
})
