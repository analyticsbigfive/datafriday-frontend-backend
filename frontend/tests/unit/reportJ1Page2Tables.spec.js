import { rowCapacity, paginate, clampAtWord, donutLegend } from '@/utils/reportJ1Page2Tables'

describe('rowCapacity', () => {
  it('compte les lignes entières sous l en-tête', () => {
    expect(rowCapacity(300, 28, 32)).toBe(9)
    expect(rowCapacity(300, 28)).toBe(10)
  })
  it('ne renvoie jamais de valeur négative ni NaN', () => {
    expect(rowCapacity(20, 28, 32)).toBe(0)
    expect(rowCapacity(300, 0, 0)).toBe(0)
  })
})

describe('paginate', () => {
  it('coupe et compte les lignes masquées', () => {
    expect(paginate([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], hiddenCount: 2 })
  })
  it('tout afficher si la capacité suffit', () => {
    expect(paginate([1, 2], 5)).toEqual({ shown: [1, 2], hiddenCount: 0 })
    expect(paginate(null, 2)).toEqual({ shown: [], hiddenCount: 0 })
  })
})

describe('clampAtWord', () => {
  it('ne touche pas un texte court', () => {
    expect(clampAtWord('Bière blonde', 20)).toBe('Bière blonde')
  })
  it('coupe à un espace et ajoute une ellipse', () => {
    const out = clampAtWord('Bière blonde pression 50cl', 15)
    expect(out).toBe('Bière blonde…')
  })
  it('garde un mot unique trop long entier', () => {
    expect(clampAtWord('Supercalifragilistic mot', 5)).toBe('Supercalifragilistic…')
  })
  it('ne coupe jamais en plein mot', () => {
    const out = clampAtWord('un deux trois quatre', 9)
    expect(out.replace('…', '').split(' ').every((w) => ['un', 'deux', 'trois', 'quatre'].includes(w))).toBe(true)
  })
})

describe('donutLegend', () => {
  const e = (n, v) => ({ label: n, value: v, color: '#000' })
  it('laisse intacte une légende qui tient', () => {
    expect(donutLegend([e('a', 3), e('b', 2)], 3)).toHaveLength(2)
  })
  it('regroupe la queue dans Autres', () => {
    const out = donutLegend([e('a', 5), e('b', 4), e('c', 3), e('d', 2)], 3, { othersLabel: 'Autres' })
    expect(out).toHaveLength(3)
    expect(out[2]).toMatchObject({ label: 'Autres', value: 5, isOthers: true })
  })
})
