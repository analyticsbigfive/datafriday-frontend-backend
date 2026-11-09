import { conditionnementText, conditionnementParts, packSizeText, packFieldLabel, packNounLabel } from '@/utils/packQuantityText'

const dict = { logiPackagingOf: 'de', logiNumberOf: 'Nombre de', logiPackagingNoun: 'conditionnement' }
const t = (k) => dict[k] || k

describe('conditionnementText', () => {
  it('type + contenance, pluriel au-dessus de 1', () => {
    expect(conditionnementText({ count: 10, packagingType: 'keg', unitsPerPack: 30, unit: 'L' }, t, 'fr')).toBe('10 fûts de 30 L')
    expect(conditionnementText({ count: 1, packagingType: 'keg', unitsPerPack: 30, unit: 'L' }, t, 'fr')).toBe('1 fût de 30 L')
  })
  it('pluriel forcé', () => {
    expect(conditionnementText({ count: 1, packagingType: 'Fût', unitsPerPack: 30, unit: 'L' }, t, 'fr', { plural: true })).toBe('1 fûts de 30 L')
  })
  it('type sans contenance', () => {
    expect(conditionnementText({ count: 3, packagingType: 'Carton' }, t, 'fr')).toBe('3 cartons')
  })
  it('sans type, contenance connue : unité réelle', () => {
    expect(conditionnementText({ count: 10, unitsPerPack: 30, unit: 'L' }, t, 'fr')).toBe('300 L')
  })
  it('sans type ni contenance : count + unité', () => {
    expect(conditionnementText({ count: 12, unit: 'pièces' }, t, 'fr')).toBe('12 pièces')
  })
  it('parts : valeur et libellé séparés', () => {
    expect(conditionnementParts({ count: 2, unitsPerPack: 5, unit: 'kg' }, t, 'fr')).toEqual({ value: 10, label: 'kg' })
  })
})

describe('packSizeText / packFieldLabel', () => {
  it('contenance par colis', () => {
    expect(packSizeText({ packagingType: 'Fût', unitsPerPack: 30, unit: 'L' }, 'fr')).toBe('30 L/fût')
    expect(packSizeText({ unitsPerPack: 30, unit: 'L' }, 'fr')).toBe('30 L')
    expect(packSizeText({ packagingType: 'Fût', unit: 'L' }, 'fr')).toBe('')
  })
  it('libellé de champ', () => {
    expect(packFieldLabel({ packagingType: 'Fût', unitsPerPack: 30, unit: 'L' }, t, 'fr')).toBe('Nombre de fûts de 30 L')
    expect(packFieldLabel({ packagingType: 'Fût' }, t, 'fr')).toBe('Nombre de fûts')
    expect(packFieldLabel({ unitsPerPack: 30, unit: 'L' }, t, 'fr')).toBe('Nombre de conditionnements de 30 L')
  })
})

describe('packNounLabel', () => {
  it('désignation du colis sans quantité', () => {
    expect(packNounLabel({ packagingType: 'Fût', unitsPerPack: 30, unit: 'L' }, t, 'fr')).toBe('fûts de 30 L')
    expect(packNounLabel({ packagingType: 'Fût' }, t, 'fr')).toBe('fûts')
    expect(packNounLabel({ unitsPerPack: 30, unit: 'L' }, t, 'fr')).toBe('conditionnements de 30 L')
    expect(packNounLabel({}, t, 'fr')).toBe('conditionnements')
  })
})
