import {
  normalizeLayout, pageAt, pageCount, canAddPage, pageNumber, allSlots, placeInPage,
  removeSlotEverywhere, renameSlot, addPage, removePageAt, splitResultsByPage, MAX_PAGES,
} from '@/utils/reportJ1Pages'

const slot = (id, kind = 'donut', col = 0, row = 0) => ({ id, kind, variant: 'shop', col, row, filters: {}, options: {}, label: '' })

describe('normalizeLayout', () => {
  it('v1 devient une page', () => {
    const n = normalizeLayout({ version: 1, slots: [slot('a')] })
    expect(n.version).toBe(2)
    expect(n.pages).toHaveLength(1)
    expect(n.pages[0].slots[0].id).toBe('a')
  })
  it('vide ou absent = une page vide', () => {
    expect(normalizeLayout(null).pages).toEqual([{ slots: [] }])
    expect(normalizeLayout({}).pages).toEqual([{ slots: [] }])
  })
  it('v2 gardée, tronquée au maximum de pages', () => {
    const raw = { version: 2, pages: Array.from({ length: 6 }, () => ({ slots: [] })) }
    expect(pageCount(raw)).toBe(MAX_PAGES)
  })
})

describe('pages', () => {
  it('ajout jusqu au maximum puis plus rien', () => {
    let l = normalizeLayout(null)
    expect(canAddPage(l)).toBe(true)
    for (let i = 0; i < 5; i += 1) l = addPage(l)
    expect(pageCount(l)).toBe(MAX_PAGES)
    expect(canAddPage(l)).toBe(false)
  })
  it('numeros de page du rapport', () => {
    expect([0, 1, 3].map(pageNumber)).toEqual([2, 3, 5])
  })
  it('la meme case sur deux pages est posable', () => {
    let l = addPage(normalizeLayout(null))
    l = placeInPage(l, 0, slot('a'))
    l = placeInPage(l, 1, slot('b'))
    expect(allSlots(l).map((s) => s.id)).toEqual(['a', 'b'])
    expect(() => placeInPage(l, 1, slot('c'))).toThrow()
  })
  it('placeInPage sur une page inconnue leve', () => {
    expect(() => placeInPage(normalizeLayout(null), 2, slot('a'))).toThrow()
  })
  it('suppression d une page et de ses elements, derniere page videe', () => {
    let l = addPage(normalizeLayout(null))
    l = placeInPage(l, 0, slot('a'))
    l = placeInPage(l, 1, slot('b'))
    l = removePageAt(l, 0)
    expect(allSlots(l).map((s) => s.id)).toEqual(['b'])
    l = removePageAt(l, 0)
    expect(pageCount(l)).toBe(1)
    expect(allSlots(l)).toEqual([])
  })
  it('pageAt hors bornes = page vide', () => {
    expect(pageAt(normalizeLayout(null), 3)).toEqual({ slots: [] })
  })
})

describe('slots', () => {
  it('retrait et renommage sur n importe quelle page', () => {
    let l = addPage(normalizeLayout(null))
    l = placeInPage(l, 1, slot('b'))
    l = renameSlot(l, 'b', '  Mon titre  ')
    expect(allSlots(l)[0].label).toBe('Mon titre')
    l = renameSlot(l, 'b', '')
    expect(allSlots(l)[0].label).toBe('')
    expect(renameSlot(l, 'b', 'x'.repeat(300)).pages[1].slots[0].label).toHaveLength(120)
    expect(allSlots(removeSlotEverywhere(l, 'b'))).toEqual([])
  })
})

describe('splitResultsByPage', () => {
  it('rend les resultats par page non vide avec le numero du rapport', () => {
    let l = addPage(addPage(normalizeLayout(null)))
    l = placeInPage(l, 0, slot('a'))
    l = placeInPage(l, 2, slot('b'))
    l = placeInPage(l, 2, slot('c', 'donut', 1, 0))
    const results = ['ra', 'rb', 'rc']
    expect(splitResultsByPage(l, results)).toEqual([
      { number: 2, items: ['ra'] },
      { number: 4, items: ['rb', 'rc'] },
    ])
  })
})
