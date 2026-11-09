import {
  packSizeOf, packLabelOf, unitsToPacks, packsToUnits, formatPacks, bufferPacksText,
  sharedPackLabel,
  bufferDisplayText,
} from '@/utils/bufferPackaging'

const dict = { logiPackagingOf: 'de' }
const t = (k) => dict[k] || k

const keg = { id: 'k', itemName: 'Bière', inventoryPackaging: 'Keg', inventoryQuantityPackaged: 20, unit: 'L' }
const pack4 = { id: 'p', itemName: 'Chips', inventoryPackaging: 'paquet', packedUnits: 4, unit: 'unités' }
const bare = { id: 'b', itemName: 'Citron', unit: 'kg' }

describe('packSizeOf', () => {
  it('inventoryQuantityPackaged prime, puis packedUnits, sinon 1', () => {
    expect(packSizeOf(keg)).toBe(20)
    expect(packSizeOf(pack4)).toBe(4)
    expect(packSizeOf({ inventoryQuantityPackaged: 0, packedUnits: 6 })).toBe(6)
    expect(packSizeOf(bare)).toBe(1)
    expect(packSizeOf(null)).toBe(1)
  })
})

describe('packLabelOf', () => {
  it('type traduit + contenance + unité', () => {
    expect(packLabelOf(keg, t, 'fr')).toBe('fût de 20 L')
    expect(packLabelOf(keg, t, 'fr', { plural: true })).toBe('fûts de 20 L')
    expect(packLabelOf(pack4, t, 'fr')).toBe('paquet de 4 unités')
  })
  it('sans conditionnement : unité réelle du Market Price, jamais de mot vague', () => {
    expect(packLabelOf(bare, t, 'fr')).toBe('kg')
    expect(packLabelOf(null, t, 'fr')).toBe('')
  })
  it('type sans contenance : le type seul', () => {
    expect(packLabelOf({ inventoryPackaging: 'Bag', unit: 'kg' }, t, 'en', { plural: true })).toBe('bags')
  })
})

describe('conversions', () => {
  it('12 fûts de 20 L = 240 unités, et inversement', () => {
    expect(packsToUnits(12, keg)).toBe(240)
    expect(unitsToPacks(240, keg)).toBe(12)
  })
  it('sans conditionnement : identité', () => {
    expect(packsToUnits(7, bare)).toBe(7)
    expect(unitsToPacks(7, null)).toBe(7)
  })
  it('colis décimaux permis, affichage à 2 décimales au plus', () => {
    expect(packsToUnits(1.5, keg)).toBe(30)
    expect(unitsToPacks(25, keg)).toBe(1.25)
    expect(unitsToPacks(10, { packedUnits: 3 })).toBe(3.33)
  })
  it('valeur invalide ou négative : 0', () => {
    expect(packsToUnits('abc', keg)).toBe(0)
    expect(packsToUnits(-2, keg)).toBe(0)
    expect(unitsToPacks(undefined, keg)).toBe(0)
  })
})

describe('textes', () => {
  it('formatPacks', () => {
    expect(formatPacks(12, 'fr')).toBe('12')
    expect(formatPacks(5.5, 'fr')).toBe('5,5')
    expect(formatPacks(5.5, 'en')).toBe('5.5')
    expect(formatPacks(3.14159, 'en')).toBe('3.14')
  })
  it('bufferPacksText : pluriel selon le nombre de colis', () => {
    expect(bufferPacksText(240, keg, t, 'fr')).toBe('12 fûts de 20 L')
    expect(bufferPacksText(20, keg, t, 'fr')).toBe('1 fût de 20 L')
    expect(bufferPacksText(20, pack4, t, 'fr')).toBe('5 paquets de 4 unités')
  })
  it('sharedPackLabel : commun, sinon null (un champ par produit)', () => {
    expect(sharedPackLabel([keg, keg], t, 'fr')).toBe('fûts de 20 L')
    expect(sharedPackLabel([keg, pack4], t, 'fr')).toBeNull()
    expect(sharedPackLabel([keg, null], t, 'fr')).toBeNull()
  })
})

describe('bufferDisplayText', () => {
  it('conditionnement connu : colis + quantité réelle entre parenthèses', () => {
    expect(bufferDisplayText(240, keg, t, 'fr', '240 L')).toBe('12 fûts de 20 L (240 L)')
  })
  it('sans conditionnement ou Market Price inconnu : unité réelle seule, jamais de mot vague', () => {
    expect(bufferDisplayText(300, bare, t, 'fr', '300 kg')).toBe('300 kg')
    expect(bufferDisplayText(300, null, t, 'fr', '300 L')).toBe('300 L')
  })
})
