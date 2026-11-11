// Checkmark de la Ventilation = dépôt réel : état déduit des dépôts, un geste écrit ou annule.

import { ref } from 'vue'
import { useVentilationDepositChecks } from '@/composables/useVentilationDepositChecks'

const baseChecks = { entries: {}, entry: () => ({ checked: false, quantity: null, comment: null }), load: jest.fn(), confirmRow: jest.fn() }

function setup({ rows, overrides = {} } = {}) {
  const groups = ref([{ itemKey: 'a', itemName: 'A', rows: rows || [
    { shopId: 'p1', quantity: 12, packs: 1, covered: false },
    { shopId: 'p2', quantity: 5, packs: null, covered: false },
    { shopId: 'st', quantity: 0, packs: null, covered: false },
  ] }])
  const deps = {
    deposit: jest.fn().mockResolvedValue(),
    cancel: jest.fn().mockResolvedValue(),
    afterBatch: jest.fn().mockResolvedValue(),
    onError: jest.fn(),
    ...overrides,
  }
  const checks = useVentilationDepositChecks({ base: baseChecks, groups: () => groups.value, ...deps })
  return { checks, groups, deps }
}

describe('useVentilationDepositChecks', () => {
  it('cocher une ligne écrit un dépôt puis relit', async () => {
    const { checks, deps } = setup()
    await checks.toggleRow('a', 'p1')
    expect(deps.deposit).toHaveBeenCalledTimes(1)
    expect(deps.deposit.mock.calls[0][0].row.shopId).toBe('p1')
    expect(deps.cancel).not.toHaveBeenCalled()
    expect(deps.afterBatch).toHaveBeenCalledWith({ deposited: 1, cancelled: 0 })
  })

  it('décocher une ligne couverte annule ses dépôts', async () => {
    const { checks, deps } = setup({ rows: [{ shopId: 'p1', quantity: 12, packs: 1, covered: true }] })
    expect(checks.isRowChecked('a', 'p1')).toBe(true)
    await checks.toggleRow('a', 'p1')
    expect(deps.cancel).toHaveBeenCalledTimes(1)
    expect(deps.deposit).not.toHaveBeenCalled()
    expect(deps.afterBatch).toHaveBeenCalledWith({ deposited: 0, cancelled: 1 })
  })

  it('ne dépose rien pour une ligne sans quantité prévue', async () => {
    const { checks, deps } = setup()
    await checks.toggleRow('a', 'st')
    expect(deps.deposit).not.toHaveBeenCalled()
    expect(deps.afterBatch).not.toHaveBeenCalled()
  })

  it('cocher plusieurs lignes dépose chacune une fois et saute les lignes déjà couvertes', async () => {
    const { checks, deps } = setup({ rows: [
      { shopId: 'p1', quantity: 12, covered: true },
      { shopId: 'p2', quantity: 5, covered: false },
      { shopId: 'p3', quantity: 7, covered: false },
    ] })
    await checks.setRows([['a', 'p1'], ['a', 'p2'], ['a', 'p3']], true)
    expect(deps.deposit.mock.calls.map((c) => c[0].row.shopId)).toEqual(['p2', 'p3'])
  })

  it("l'article est coché quand toutes ses lignes à déposer sont couvertes", () => {
    const { checks } = setup({ rows: [
      { shopId: 'p1', quantity: 12, covered: true },
      { shopId: 'p2', quantity: 5, covered: false },
      { shopId: 'st', quantity: 0, covered: false },
    ] })
    expect(checks.isItemChecked('a')).toBe(false)
    expect(checks.areRowsChecked([['a', 'p1']])).toBe(true)
    expect(checks.areRowsChecked([['a', 'p1'], ['a', 'p2']])).toBe(false)
  })

  it('un échec s\'arrête, signale l\'erreur et relit quand même', async () => {
    const boom = new Error('refus')
    const { checks, deps } = setup({ overrides: { deposit: jest.fn().mockResolvedValueOnce().mockRejectedValueOnce(boom) } })
    await checks.setRows([['a', 'p1'], ['a', 'p2']], true)
    expect(deps.deposit).toHaveBeenCalledTimes(2)
    expect(deps.onError).toHaveBeenCalledWith(boom)
    expect(deps.afterBatch).toHaveBeenCalledWith({ deposited: 1, cancelled: 0 })
    expect(checks.busy.value).toBe(false)
  })

  it('un second geste pendant le premier est ignoré (pas de double dépôt)', async () => {
    let release
    const { checks, deps } = setup({ overrides: { deposit: jest.fn(() => new Promise((resolve) => { release = resolve })) } })
    const first = checks.toggleRow('a', 'p1')
    await checks.toggleRow('a', 'p2')
    expect(deps.deposit).toHaveBeenCalledTimes(1)
    release()
    await first
  })
})
