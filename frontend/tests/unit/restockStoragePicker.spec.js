import { pickerProducts, filterPickerProducts } from '@/utils/restockStoragePicker'

describe('restockStoragePicker', () => {
  const cards = [
    { name: 'Coca', marketPriceId: '', reference: 'Coca', type: 'Boisson', category: 'Soft' },
    { name: 'coca', marketPriceId: 'mp1', reference: 'COC-33', type: 'Boisson', category: 'Soft' },
    { name: 'Bière blonde', marketPriceId: 'mp2', reference: 'Bière blonde', category: 'Bière' },
    { name: '  ', marketPriceId: 'x' },
  ]

  it('une entrée par nom, préfère la carte avec marketPriceId, trie par nom, ignore les noms vides', () => {
    const out = pickerProducts(cards)
    expect(out.map((p) => p.name)).toEqual(['Bière blonde', 'Coca'])
    expect(out[1].marketPriceId).toBe('mp1')
    expect(out[1].reference).toBe('COC-33')
  })

  it('entrée vide ou absente', () => {
    expect(pickerProducts(null)).toEqual([])
    expect(pickerProducts([])).toEqual([])
  })

  it('filtre sans casse par nom ou référence, requête vide = tout', () => {
    const items = pickerProducts(cards)
    expect(filterPickerProducts(items, 'BIÈRE').map((p) => p.name)).toEqual(['Bière blonde'])
    expect(filterPickerProducts(items, 'coc-33').map((p) => p.name)).toEqual(['Coca'])
    expect(filterPickerProducts(items, '  ')).toHaveLength(2)
    expect(filterPickerProducts(items, 'zzz')).toEqual([])
  })
})
