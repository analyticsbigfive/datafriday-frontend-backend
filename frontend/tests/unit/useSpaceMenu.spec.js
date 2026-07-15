import { useSpaceMenu } from '@/composables/useSpaceMenu'
import * as api from '@/utils/api'

jest.mock('@/utils/api', () => ({
  getSpaceMenuConfiguration: jest.fn(),
  saveSpaceMenuConfiguration: jest.fn(),
}))

describe('useSpaceMenu — réconciliation souple (Règle 1)', () => {
  beforeEach(() => {
    api.getSpaceMenuConfiguration.mockReset()
    api.saveSpaceMenuConfiguration.mockReset()
    api.saveSpaceMenuConfiguration.mockResolvedValue({})
  })

  it('pré-remplit les PDV vierges mais garde la sélection sauvegardée', async () => {
    // e1 sauvegardé avec a=true,b=false (l'utilisateur a retiré b)
    api.getSpaceMenuConfiguration.mockResolvedValue({
      menuItems: { e1: { a: true, b: false } },
    })
    const suggestions = new Map([
      ['e1', new Set(['a', 'b'])],
      ['e2', new Set(['z'])], // PDV vierge
    ])
    const sm = useSpaceMenu()
    await sm.load('sp', 'cfg', suggestions)

    // e1 configuré -> b NON réinjecté malgré la suggestion
    expect([...sm.selection.value.get('e1')]).toEqual(['a'])
    // e2 vierge -> pré-rempli depuis le mapping
    expect([...sm.selection.value.get('e2')]).toEqual(['z'])
  })

  it('persiste explicitement true/false pour chaque item disponible', async () => {
    api.getSpaceMenuConfiguration.mockResolvedValue({ menuItems: {} })
    const sm = useSpaceMenu()
    await sm.load('sp', 'cfg', new Map())
    sm.setForElement('e1', ['a'])

    await sm.persist('sp', 'cfg', { e1: ['a', 'b'] })

    expect(api.saveSpaceMenuConfiguration).toHaveBeenCalledWith('sp', 'cfg', {
      e1: { a: true, b: false },
    })
    // après persist, e1 est marqué configuré
    expect(sm.savedElementIds.value.has('e1')).toBe(true)
  })

  it('toggle ajoute/retire un item', async () => {
    api.getSpaceMenuConfiguration.mockResolvedValue({ menuItems: {} })
    const sm = useSpaceMenu()
    await sm.load('sp', 'cfg', new Map())
    sm.toggle('e1', 'a')
    expect(sm.isSelected('e1', 'a')).toBe(true)
    sm.toggle('e1', 'a')
    expect(sm.isSelected('e1', 'a')).toBe(false)
  })
})
