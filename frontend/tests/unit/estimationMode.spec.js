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
import { resolveItemsContext, isEstimationEligible } from '@/utils/estimationMode'
import EventPredictMenusSection from '@/components/EventPredictMenusSection.vue'

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
