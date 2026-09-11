import { buildUnitInfoByItemId, formatQuantityWithPack, sharedUnitInfo } from '@/utils/reconciliationUnits'
import { buildPostEventReconciliationLines, reconciliationKey as K } from '@/utils/postEventReconciliation'

// Formateur neutre : l'espace fine insécable d'Intl rendrait l'attendu illisible.
const fmt = (n) => String(Math.round(Number(n) * 100) / 100)
const KEG = { unit: 'L', unitsPerPack: 30, packaging: 'Fut' }

describe('formatQuantityWithPack', () => {
  it('« 840 L (28 Fut de 30 L) » : unité à droite, équivalent colis entre parenthèses', () => {
    expect(formatQuantityWithPack(840, KEG, { formatNumber: fmt, ofWord: 'de' })).toBe('840 L (28 Fut de 30 L)')
  })
  it('colis non entiers conservés à 1 décimale, négatif (surplus) aussi', () => {
    expect(formatQuantityWithPack(3626.85, KEG, { formatNumber: fmt, ofWord: 'de' })).toBe('3626.85 L (120.9 Fut de 30 L)')
    expect(formatQuantityWithPack(-60, KEG, { formatNumber: fmt, ofWord: 'de' })).toBe('-60 L (-2 Fut de 30 L)')
  })
  it('withPack=false (Vendu / Prédit) : unité seule', () => {
    expect(formatQuantityWithPack(3626.85, KEG, { formatNumber: fmt, ofWord: 'de', withPack: false })).toBe('3626.85 L')
  })
  it('sans unité (document antérieur) : nombre nu ; sans conditionnement ou colis unitaire : pas de parenthèse', () => {
    expect(formatQuantityWithPack(12, null, { formatNumber: fmt })).toBe('12')
    expect(formatQuantityWithPack(12, { unit: 'pcs', unitsPerPack: 1, packaging: 'Carton' }, { formatNumber: fmt })).toBe('12 pcs')
    expect(formatQuantityWithPack(12, { unit: 'pcs', unitsPerPack: 6, packaging: null }, { formatNumber: fmt })).toBe('12 pcs')
  })
  it('null → tiret', () => {
    expect(formatQuantityWithPack(null, KEG, { formatNumber: fmt })).toBe('—')
  })
})

describe('buildUnitInfoByItemId', () => {
  it('article compté : unit / inventoryQuantityPackaged / inventoryPackaging ; market price en repli champ par champ', () => {
    const info = buildUnitInfoByItemId({
      countedItems: [
        { id: 'mp-keg', unit: 'L', inventoryQuantityPackaged: 30, inventoryPackaging: 'Fut' },
        { id: 'ing-x', marketPriceId: 'mp-x', unit: null, inventoryQuantityPackaged: 0 },
      ],
      marketPrices: [
        { id: 'mp-x', unit: 'kg', packedUnits: 5, inventoryPackaging: 'Sac' },
        { id: 'mp-only', unit: 'cl', packedUnits: 24, inventoryPackaging: 'Pack' },
      ],
    })
    expect(info['mp-keg']).toEqual(KEG)
    expect(info['ing-x']).toEqual({ unit: 'kg', unitsPerPack: 5, packaging: 'Sac' })
    // Vendu mais non compté : catalogue direct.
    expect(info['mp-only']).toEqual({ unit: 'cl', unitsPerPack: 24, packaging: 'Pack' })
  })
})

describe('sharedUnitInfo', () => {
  it('unité commune → info ; unités mélangées (mode PdV) → null ; sans unité → null', () => {
    expect(sharedUnitInfo([{ ...KEG }, { ...KEG }])).toEqual(KEG)
    expect(sharedUnitInfo([{ ...KEG }, { unit: 'pcs', unitsPerPack: null, packaging: null }])).toBeNull()
    expect(sharedUnitInfo([{ unit: null }])).toBeNull()
  })
})

describe('buildPostEventReconciliationLines : unité archivée sur la ligne', () => {
  it('porte unit / unitsPerPack / packaging depuis unitInfoByItemId, null sinon', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'mp-keg')]: 840, [K('el1', 'other')]: 1 },
      unitInfoByItemId: { 'mp-keg': KEG },
    })
    const by = Object.fromEntries(lines.map((l) => [l.itemKey, l]))
    expect(by['mp-keg']).toMatchObject(KEG)
    expect(by.other).toMatchObject({ unit: null, unitsPerPack: null, packaging: null })
  })
})
