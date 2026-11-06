import { useVentilationChecks, depositUnits, checkKey } from '@/composables/useVentilationChecks'

const make = (saveCheck = jest.fn().mockResolvedValue({})) =>
  useVentilationChecks({ fetchChecks: async () => [{ itemKey: 'a', elementId: '', checked: true, quantity: null, comment: null }, { itemKey: 'a', elementId: 'p1', checked: true, quantity: 3, comment: 'ok' }], saveCheck })

describe('useVentilationChecks', () => {
  it('charge la coche article et les lignes', async () => {
    const c = make()
    await c.load()
    expect(c.isItemChecked('a')).toBe(true)
    expect(c.entry('a', 'p1')).toEqual({ checked: true, quantity: 3, comment: 'ok' })
    expect(checkKey('a')).toBe('a|||')
  })

  it("décocher une ligne décoche l'article", async () => {
    const save = jest.fn().mockResolvedValue({})
    const c = make(save)
    await c.load()
    await c.toggleRow('a', 'p1')
    expect(c.isRowChecked('a', 'p1')).toBe(false)
    expect(c.isItemChecked('a')).toBe(false)
    expect(save).toHaveBeenCalledWith({ itemKey: 'a', elementId: 'p1', checked: false })
  })

  it("restaure l'état si l'enregistrement échoue", async () => {
    const c = make(jest.fn().mockRejectedValue(new Error('x')))
    await c.load()
    await expect(c.toggleRow('a', 'p1')).rejects.toThrow()
    expect(c.isRowChecked('a', 'p1')).toBe(true)
    expect(c.isItemChecked('a')).toBe(true)
  })

  it('calcule les unités saisies', () => {
    expect(depositUnits({ packed: 2, loose: 5 }, 30)).toBe(65)
    expect(depositUnits({ packed: 0, loose: 4 }, null)).toBe(4)
  })
})
