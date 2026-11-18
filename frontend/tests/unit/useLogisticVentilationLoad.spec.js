/**
 * useLogisticVentilation.loadForEvents : les lectures réseau (feuilles, dépôts, mouvements) ne
 * dépendent pas du stock. Seul le calcul des lignes (taille des packs) l'attend. Avant, tout
 * partait APRÈS le stock, en 5 vagues. Le résultat (lignes, mouvements) doit rester identique.
 */
jest.mock('@/api/endpoints/restock.api', () => ({
  listRestockPlans: jest.fn(),
  getRestockPlan: jest.fn(),
}))
jest.mock('@/api/endpoints/logistics.api', () => ({
  getVentilationDeposits: jest.fn(),
  listVentilationMovements: jest.fn(),
  cancelVentilationDeposit: jest.fn(),
  getVentilationStorages: jest.fn(),
}))
jest.mock('@/composables/usePredictedNeed', () => ({ buildRestockNeedIndex: jest.fn(() => null) }))
jest.mock('@/utils/ventilationPlans', () => ({
  pickPlansForEvents: jest.fn((list) => list),
  mergeRestockPlans: jest.fn((full) => ({ name: 'Feuille', eventIds: ['e1'], plans: full })),
  depositEventForPlan: jest.fn(),
  allocateDeposit: jest.fn(),
  splitMergedRowKey: jest.fn(),
}))
jest.mock('@/utils/restockDepositSheet', () => ({
  buildDepositLines: jest.fn((plan, enriched) => enriched.map((d) => ({ itemKey: d.itemKey, unitsPerPack: d.unitsPerPack }))),
  groupDepositLinesByItem: jest.fn((lines) => lines),
  pendingDepositGroups: jest.fn(() => []),
  depositPrefill: jest.fn(),
}))

import { listRestockPlans, getRestockPlan } from '@/api/endpoints/restock.api'
import { getVentilationDeposits, listVentilationMovements, getVentilationStorages } from '@/api/endpoints/logistics.api'
import { useLogisticVentilation } from '@/composables/useLogisticVentilation'

function deferred() {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

function makeVentilation() {
  const store = {
    getters: { 'logistics/levelFor': (elementId, itemKey) => (itemKey === 'biere' ? { unitsPerPack: 24 } : null) },
  }
  return useLogisticVentilation({ store, t: (k) => k })
}

beforeEach(() => {
  jest.clearAllMocks()
  listRestockPlans.mockResolvedValue([{ id: 'p1' }])
  getRestockPlan.mockResolvedValue({ id: 'p1' })
  getVentilationStorages.mockResolvedValue([])
  getVentilationDeposits.mockResolvedValue([{ elementId: 'el1', itemKey: 'biere' }])
  listVentilationMovements.mockResolvedValue([{ id: 'm1', cancelled: false }])
})

describe('useLogisticVentilation.loadForEvents, lectures anticipées', () => {
  it('lit dépôts et mouvements sans attendre le stock, calcule les lignes après lui', async () => {
    const v = makeVentilation()
    const stock = deferred()

    const done = v.loadForEvents('sp-1', ['e1'], { stockReady: stock.promise })
    await new Promise((r) => setTimeout(r, 10))

    // Stock pas prêt : les lectures réseau sont déjà faites, les lignes pas encore calculées.
    expect(getVentilationDeposits).toHaveBeenCalledTimes(1)
    expect(listVentilationMovements).toHaveBeenCalledTimes(1)
    expect(v.groups.value).toEqual([])

    stock.resolve(true)
    expect(await done).toBe(true)

    // Même résultat que si le stock avait été chargé avant : la taille des packs est connue.
    expect(v.groups.value).toEqual([{ itemKey: 'biere', unitsPerPack: 24 }])
    expect(v.movements.value).toEqual([{ id: 'm1', cancelled: false, cancellable: true }])
  })

  it('onPlanFound part avant la lecture des dépôts (validations en parallèle)', async () => {
    const v = makeVentilation()
    const deposits = deferred()
    getVentilationDeposits.mockReturnValue(deposits.promise)
    const onPlanFound = jest.fn()

    const done = v.loadForEvents('sp-1', ['e1'], { onPlanFound })
    await new Promise((r) => setTimeout(r, 10))

    expect(onPlanFound).toHaveBeenCalledTimes(1)
    expect(getVentilationDeposits).toHaveBeenCalledTimes(1)

    deposits.resolve([])
    await done
  })

  it('utilise la liste des feuilles déjà demandée au lieu de la relire', async () => {
    const v = makeVentilation()
    const plansPromise = Promise.resolve([{ id: 'p9' }])

    await v.loadForEvents('sp-1', ['e1'], { plansPromise })

    expect(listRestockPlans).not.toHaveBeenCalled()
    expect(getRestockPlan).toHaveBeenCalledWith('p9')
  })

  it('sans options : même comportement qu\'avant (liste lue, lignes calculées tout de suite)', async () => {
    const v = makeVentilation()

    expect(await v.loadForEvents('sp-1', ['e1'])).toBe(true)

    expect(listRestockPlans).toHaveBeenCalledWith('sp-1')
    expect(v.groups.value).toEqual([{ itemKey: 'biere', unitsPerPack: 24 }])
  })

  it('aucune feuille : renvoie false et ne lit ni dépôts ni mouvements', async () => {
    const v = makeVentilation()
    const { pickPlansForEvents } = require('@/utils/ventilationPlans')
    pickPlansForEvents.mockReturnValueOnce([])
    const onPlanFound = jest.fn()

    expect(await v.loadForEvents('sp-1', ['e1'], { onPlanFound })).toBe(false)

    expect(onPlanFound).not.toHaveBeenCalled()
    expect(getVentilationDeposits).not.toHaveBeenCalled()
  })

  it('liste des feuilles en échec : l\'erreur remonte (la vue retombe sur la prévision)', async () => {
    const v = makeVentilation()
    const plansPromise = Promise.reject(new Error('plans KO'))
    plansPromise.catch(() => {})

    await expect(v.loadForEvents('sp-1', ['e1'], { plansPromise })).rejects.toThrow('plans KO')
    expect(v.loading.value).toBe(false)
  })
})
