/**
 * Inventaire : lectures lancées avec le contexte (attendus, plan de réarmement).
 *  - elles ne partent que dans les mêmes conditions que les lectures d'origine ;
 *  - une lecture anticipée n'est réutilisée que si elle correspond exactement (espace, event, mode) ;
 *  - sinon, ou sans lecture anticipée, l'appel direct d'avant est refait ;
 *  - une erreur est relancée telle quelle au consommateur et ne crée jamais de rejet non géré.
 */
jest.mock('@/api/endpoints/inventory.api', () => ({
  getPreEventBaseline: jest.fn(),
  getPostEventBaseline: jest.fn(),
}))
jest.mock('@/api/endpoints/restock.api', () => ({
  listRestockPlans: jest.fn(),
  getRestockPlan: jest.fn(),
}))
jest.mock('@/api/endpoints/menu.api', () => ({
  getConfigShopMenuItemsLight: jest.fn(),
}))

import { getPreEventBaseline, getPostEventBaseline } from '@/api/endpoints/inventory.api'
import { listRestockPlans, getRestockPlan } from '@/api/endpoints/restock.api'
import { getConfigShopMenuItemsLight } from '@/api/endpoints/menu.api'
import { settle, startShopItemsBatch } from '@/utils/inventoryShopItemsBatch'
import {
  takeSettled,
  startInventoryEarlyReads,
  readBaseline,
  readRestockLines,
  readRestockLinesForEvent,
} from '@/utils/inventoryEarlyReads'

const BASE = {
  spaceId: 'sp1', currentSpaceId: 'sp1', eventId: 'ev1', isPreMode: false,
  canSeeExpected: true, canSeePredicted: true, demo: false,
}
const ask = { spaceId: 'sp1', eventId: 'ev1', isPreMode: false }
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  jest.clearAllMocks()
  getPreEventBaseline.mockResolvedValue({ expected: { pre: true } })
  getPostEventBaseline.mockResolvedValue({ expected: { post: true } })
  listRestockPlans.mockResolvedValue([{ id: 'plan-1', selectedEventIds: ['ev1', 'ev2'] }])
  getRestockPlan.mockResolvedValue({ restockLines: [{ id: 'l1' }] })
})

describe('settle / takeSettled', () => {
  it('ne rejette jamais, et takeSettled relance l\'erreur d\'origine', async () => {
    const err = new Error('boom')
    const r = await settle(Promise.reject(err))
    expect(r).toEqual({ ok: false, error: err })
    await expect(takeSettled(Promise.resolve(r))).rejects.toBe(err)
    await expect(takeSettled(settle(Promise.resolve(7)))).resolves.toBe(7)
  })
})

describe('startInventoryEarlyReads : mêmes conditions de départ que les lectures d\'origine', () => {
  it('lance les attendus (post) et le plan de réarmement', async () => {
    const early = startInventoryEarlyReads(BASE)
    expect(getPostEventBaseline).toHaveBeenCalledWith('sp1', 'ev1')
    expect(getPreEventBaseline).not.toHaveBeenCalled()
    expect(listRestockPlans).toHaveBeenCalledWith('sp1')
    expect(early.baseline).not.toBeNull()
    expect(early.restock).not.toBeNull()
    await flush()
  })

  it('mode pre : lit l\'attendu pré-event', () => {
    startInventoryEarlyReads({ ...BASE, isPreMode: true })
    expect(getPreEventBaseline).toHaveBeenCalledWith('sp1', 'ev1')
    expect(getPostEventBaseline).not.toHaveBeenCalled()
  })

  it('démo, pas d\'event : rien ne part', () => {
    expect(startInventoryEarlyReads({ ...BASE, demo: true })).toBeNull()
    expect(startInventoryEarlyReads({ ...BASE, eventId: null })).toBeNull()
    expect(getPostEventBaseline).not.toHaveBeenCalled()
    expect(listRestockPlans).not.toHaveBeenCalled()
  })

  it('sans la permission « attendus », pas de lecture des attendus (le plan part quand même)', () => {
    const early = startInventoryEarlyReads({ ...BASE, canSeeExpected: false })
    expect(early.baseline).toBeNull()
    expect(getPostEventBaseline).not.toHaveBeenCalled()
    expect(listRestockPlans).toHaveBeenCalledTimes(1)
  })

  it('sans la permission « besoin prédit », pas de lecture du plan', () => {
    const early = startInventoryEarlyReads({ ...BASE, canSeePredicted: false })
    expect(early.restock).toBeNull()
    expect(listRestockPlans).not.toHaveBeenCalled()
    expect(getPostEventBaseline).toHaveBeenCalledTimes(1)
  })
})

describe('readBaseline', () => {
  it('réutilise la lecture anticipée correspondante : un seul appel réseau', async () => {
    const early = startInventoryEarlyReads(BASE)
    await expect(readBaseline(early, ask)).resolves.toEqual({ expected: { post: true } })
    expect(getPostEventBaseline).toHaveBeenCalledTimes(1)
  })

  it('refait l\'appel direct si l\'event ou le mode ont changé depuis', async () => {
    const early = startInventoryEarlyReads(BASE)
    await readBaseline(early, { ...ask, eventId: 'ev2' })
    await readBaseline(early, { ...ask, isPreMode: true })
    expect(getPostEventBaseline).toHaveBeenCalledTimes(2) // anticipé + event différent
    expect(getPreEventBaseline).toHaveBeenCalledTimes(1)
  })

  it('sans lecture anticipée : appel direct, comme avant', async () => {
    await expect(readBaseline(null, ask)).resolves.toEqual({ expected: { post: true } })
    expect(getPostEventBaseline).toHaveBeenCalledTimes(1)
  })

  it('une erreur HTTP (403/404) remonte intacte, pour que la vue la nomme', async () => {
    const err = Object.assign(new Error('forbidden'), { response: { status: 403 } })
    getPostEventBaseline.mockRejectedValue(err)
    const early = startInventoryEarlyReads(BASE)
    await expect(readBaseline(early, ask)).rejects.toBe(err)
  })

  it('une lecture anticipée jamais consommée ne crée pas de rejet non géré', async () => {
    const seen = []
    const onUnhandled = (e) => seen.push(e)
    process.on('unhandledRejection', onUnhandled)
    getPostEventBaseline.mockRejectedValue(new Error('jamais lue'))
    listRestockPlans.mockRejectedValue(new Error('jamais lu'))
    startInventoryEarlyReads(BASE)
    await flush()
    await flush()
    process.off('unhandledRejection', onUnhandled)
    expect(seen).toEqual([])
  })
})

describe('readRestockLines', () => {
  it('plan trouvé : renvoie ses lignes, lecture anticipée réutilisée (un seul aller-retour)', async () => {
    const early = startInventoryEarlyReads(BASE)
    await expect(readRestockLines(early, { spaceId: 'sp1', eventId: 'ev1' })).resolves.toEqual({
      matched: true, lines: [{ id: 'l1' }],
    })
    expect(listRestockPlans).toHaveBeenCalledTimes(1)
    expect(getRestockPlan).toHaveBeenCalledWith('plan-1')
  })

  it('aucun plan pour ce match : matched=false, getRestockPlan jamais appelé', async () => {
    listRestockPlans.mockResolvedValue([{ id: 'plan-9', selectedEventIds: ['autre'] }])
    await expect(readRestockLinesForEvent('sp1', 'ev1')).resolves.toEqual({ matched: false, lines: null })
    expect(getRestockPlan).not.toHaveBeenCalled()
  })

  it('compare les ids en texte (number vs string)', async () => {
    listRestockPlans.mockResolvedValue([{ id: 'plan-1', selectedEventIds: [12] }])
    const r = await readRestockLinesForEvent('sp1', '12')
    expect(r.matched).toBe(true)
  })

  it('autre event que celui anticipé : relit', async () => {
    const early = startInventoryEarlyReads(BASE)
    await readRestockLines(early, { spaceId: 'sp1', eventId: 'ev2' })
    expect(listRestockPlans).toHaveBeenCalledTimes(2)
  })

  it('échec de la liste des plans : remonte (la vue replie sur Event Predict)', async () => {
    const err = new Error('KO')
    listRestockPlans.mockRejectedValue(err)
    const early = startInventoryEarlyReads(BASE)
    await expect(readRestockLines(early, { spaceId: 'sp1', eventId: 'ev1' })).rejects.toBe(err)
  })
})

describe('startShopItemsBatch', () => {
  it('appelle le batch avec le périmètre « union des configurations »', async () => {
    getConfigShopMenuItemsLight.mockResolvedValue({ s1: { items: [] } })
    const r = await startShopItemsBatch('sp1', 'cfg-1')
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledWith('sp1', 'cfg-1', { itemsScope: 'space' })
    expect(r).toEqual({ ok: true, value: { s1: { items: [] } } })
  })

  it('« Voir tout l\'inventaire » élargit aussi les PdV', async () => {
    getConfigShopMenuItemsLight.mockResolvedValue({})
    await startShopItemsBatch('sp1', 'cfg-1', { allSpace: true })
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledWith('sp1', 'cfg-1', { itemsScope: 'space', shopsScope: 'space' })
  })

  it('échec : résultat { ok:false }, sans rejet', async () => {
    const err = new Error('batch KO')
    getConfigShopMenuItemsLight.mockRejectedValue(err)
    await expect(startShopItemsBatch('sp1', 'cfg-1')).resolves.toEqual({ ok: false, error: err })
  })
})
