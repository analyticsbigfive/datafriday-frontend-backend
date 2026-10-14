import { mount } from '@vue/test-utils'
import DeltaPill from '@/components/space-workspace/shared/DeltaPill.vue'

const texts = (w) => ({
  visible: w.find('span[aria-hidden="true"]').text(),
  sr: w.find('.delta-pill__sr').text(),
})

describe('DeltaPill', () => {
  it('affiche un écart chiffré avec ton et texte lisible', () => {
    const w = mount(DeltaPill, { props: { delta: { kind: 'delta', tone: 'good', text: '▲ 4,2 %' } } })
    expect(w.classes()).toContain('delta-pill--good')
    expect(texts(w).visible).toBe('▲ 4,2 %')
    expect(texts(w).sr).toBe('en hausse de 4,2 %')
  })

  it('traite une baisse mauvaise en rouge', () => {
    const w = mount(DeltaPill, { props: { delta: { kind: 'value', tone: 'bad', text: '▼ 1,0 pts' } } })
    expect(w.classes()).toContain('delta-pill--bad')
    expect(texts(w).sr).toBe('en baisse de 1,0 pts')
  })

  it('affiche « — » gris sans référence ou sans objet', () => {
    const none = mount(DeltaPill, { props: { delta: { kind: 'none', tone: 'neutral', text: '—' } } })
    expect(none.classes()).toContain('delta-pill--eq')
    expect(texts(none).visible).toBe('—')
    const nul = mount(DeltaPill, { props: { delta: null } })
    expect(texts(nul).visible).toBe('—')
  })

  it('affiche « nouveau » en violet', () => {
    const w = mount(DeltaPill, { props: { delta: { kind: 'new', isNew: true, tone: 'neutral', text: '—' }, size: 'sm' } })
    expect(w.classes()).toEqual(expect.arrayContaining(['delta-pill--new', 'delta-pill--sm']))
    expect(texts(w).visible).toBe('nouveau')
  })

  it('affiche « = du jour » avec info-bulle pour un stock identique', () => {
    const w = mount(DeltaPill, { props: { delta: { kind: 'same', tone: 'neutral', text: '=' } } })
    expect(texts(w).visible).toBe('= du jour')
    expect(w.attributes('title')).toContain('Stock Logistique du jour')
  })
})
