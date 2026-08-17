// Tests de la logique pure de l'onglet « Espaces de stockage » du réarmement
// (utils/storageRestock.js) : normalisation des %, application au nécessaire,
// précédence individuel/global, détection des alertes de seuils min/max.

import {
  normalizeStoragePercent,
  applyStoragePercent,
  effectiveStoragePercent,
  detectStorageAlerts,
  STORAGE_PERCENT_DEFAULT,
} from '@/utils/storageRestock'

describe('normalizeStoragePercent', () => {
  it('clamp 0–200, arrondi entier', () => {
    expect(normalizeStoragePercent(0)).toBe(0)
    expect(normalizeStoragePercent(150)).toBe(150)
    expect(normalizeStoragePercent(250)).toBe(200)
    expect(normalizeStoragePercent(-10)).toBe(0)
    expect(normalizeStoragePercent(99.6)).toBe(100)
    expect(normalizeStoragePercent('85')).toBe(85)
  })

  it('non-nombre → défaut 100', () => {
    expect(normalizeStoragePercent(null)).toBe(STORAGE_PERCENT_DEFAULT)
    expect(normalizeStoragePercent(undefined)).toBe(STORAGE_PERCENT_DEFAULT)
    expect(normalizeStoragePercent('')).toBe(STORAGE_PERCENT_DEFAULT)
    expect(normalizeStoragePercent('abc')).toBe(STORAGE_PERCENT_DEFAULT)
    expect(normalizeStoragePercent(NaN)).toBe(STORAGE_PERCENT_DEFAULT)
    expect(normalizeStoragePercent(Infinity)).toBe(STORAGE_PERCENT_DEFAULT)
  })
})

describe('applyStoragePercent', () => {
  it('100 % = identité (arrondie)', () => {
    expect(applyStoragePercent(24, 100)).toBe(24)
  })

  it('arrondi round, pas floor/ceil', () => {
    expect(applyStoragePercent(3, 50)).toBe(2) // 1.5 → 2
    expect(applyStoragePercent(3, 45)).toBe(1) // 1.35 → 1
  })

  it('bornes : 0 % → 0, 200 % → double', () => {
    expect(applyStoragePercent(24, 0)).toBe(0)
    expect(applyStoragePercent(24, 200)).toBe(48)
  })

  it('base nulle, négative ou invalide → 0', () => {
    expect(applyStoragePercent(0, 150)).toBe(0)
    expect(applyStoragePercent(-5, 100)).toBe(0)
    expect(applyStoragePercent(NaN, 100)).toBe(0)
  })

  it('% invalide → traité comme 100', () => {
    expect(applyStoragePercent(24, null)).toBe(24)
  })
})

describe('effectiveStoragePercent', () => {
  it('individuel prime sur le global', () => {
    expect(effectiveStoragePercent({ individual: 80, globalPercent: 150, globalEnabled: true })).toBe(80)
  })

  it('sans individuel : global si activé', () => {
    expect(effectiveStoragePercent({ individual: null, globalPercent: 150, globalEnabled: true })).toBe(150)
  })

  it('global désactivé → 100', () => {
    expect(effectiveStoragePercent({ individual: null, globalPercent: 150, globalEnabled: false })).toBe(100)
  })

  it('individuel 0 est un réglage valide (pas un falsy ignoré)', () => {
    expect(effectiveStoragePercent({ individual: 0, globalPercent: 150, globalEnabled: true })).toBe(0)
  })

  it('défauts sans arguments → 100', () => {
    expect(effectiveStoragePercent()).toBe(100)
    expect(effectiveStoragePercent({})).toBe(100)
  })
})

describe('detectStorageAlerts', () => {
  const row = (over = {}) => ({
    name: 'Bière blonde 33cl',
    elementId: 'el-1',
    elementName: 'Réserve Centrale',
    remaining: 0,
    minStock: null,
    maxStock: null,
    ...over,
  })

  it('nearMax : restant >= 90 % du max (égalité incluse)', () => {
    expect(detectStorageAlerts([row({ maxStock: 100, remaining: 90 })])).toEqual([
      expect.objectContaining({ kind: 'nearMax', dedupeKey: 'el-1:Bière blonde 33cl:nearMax' }),
    ])
    expect(detectStorageAlerts([row({ maxStock: 100, remaining: 89 })])).toEqual([])
  })

  it('nearMin : restant <= 110 % du min (égalité incluse)', () => {
    expect(detectStorageAlerts([row({ minStock: 10, remaining: 11 })])).toEqual([
      expect.objectContaining({ kind: 'nearMin' }),
    ])
    expect(detectStorageAlerts([row({ minStock: 10, remaining: 12 })])).toEqual([])
  })

  it('minStock 0 ou absent → jamais de nearMin (anti-bruit JLH 13/08)', () => {
    expect(detectStorageAlerts([row({ minStock: 0, remaining: 0 })])).toEqual([])
    expect(detectStorageAlerts([row({ minStock: null, remaining: 0 })])).toEqual([])
  })

  it('maxStock 0 ou absent → jamais de nearMax', () => {
    expect(detectStorageAlerts([row({ maxStock: 0, remaining: 50 })])).toEqual([])
  })

  it('les deux seuils peuvent alerter sur la même ligne', () => {
    const alerts = detectStorageAlerts([row({ minStock: 40, maxStock: 45, remaining: 42 })])
    expect(alerts.map((a) => a.kind).sort()).toEqual(['nearMax', 'nearMin'])
  })

  it('entrées invalides tolérées', () => {
    expect(detectStorageAlerts(null)).toEqual([])
    expect(detectStorageAlerts([null, undefined])).toEqual([])
  })
})
