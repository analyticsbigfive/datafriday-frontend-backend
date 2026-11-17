import { loadComponentDetails, COMPONENT_DETAIL_BATCH_SIZE } from '@/utils/componentDetailBatch'
import { hydrateSubComponents } from '@/utils/componentCatalog'

const detail = (id, extra = {}) => ({
  id,
  numberOfUnitsRecipe: 10,
  ingredients: [{ ingredientId: `ing-${id}`, quantity: 2, unit: 'kg', ingredient: { name: `Ingrédient ${id}` } }],
  children: [],
  ...extra,
})

describe('loadComponentDetails', () => {
  it('un seul appel pour moins de 50 ids, détails indexés par id', async () => {
    const fetchBatch = jest.fn().mockResolvedValue({ data: [detail('a'), detail('b')] })
    const { details, failedIds } = await loadComponentDetails({ ids: ['a', 'b'], fetchBatch })
    expect(fetchBatch).toHaveBeenCalledTimes(1)
    expect(fetchBatch).toHaveBeenCalledWith(['a', 'b'])
    expect([...details.keys()]).toEqual(['a', 'b'])
    expect(failedIds.size).toBe(0)
  })

  it('découpe en lots de 50 : 43 ids = 1 appel, 120 ids = 3 appels', async () => {
    const ids = (n) => Array.from({ length: n }, (_, i) => `c${i}`)
    const f1 = jest.fn().mockResolvedValue({ data: [] })
    await loadComponentDetails({ ids: ids(43), fetchBatch: f1 })
    expect(f1).toHaveBeenCalledTimes(1)
    const f2 = jest.fn().mockResolvedValue({ data: [] })
    await loadComponentDetails({ ids: ids(120), fetchBatch: f2 })
    expect(f2).toHaveBeenCalledTimes(3)
    expect(f2.mock.calls.map((c) => c[0].length)).toEqual([COMPONENT_DETAIL_BATCH_SIZE, COMPONENT_DETAIL_BATCH_SIZE, 20])
  })

  it('ignore les doublons et les ids vides', async () => {
    const fetchBatch = jest.fn().mockResolvedValue({ data: [] })
    await loadComponentDetails({ ids: ['a', 'a', '', null, undefined, 'b'], fetchBatch })
    expect(fetchBatch).toHaveBeenCalledWith(['a', 'b'])
  })

  it('aucun id : aucun appel', async () => {
    const fetchBatch = jest.fn()
    const out = await loadComponentDetails({ ids: [], fetchBatch })
    expect(fetchBatch).not.toHaveBeenCalled()
    expect(out.details.size).toBe(0)
    expect(out.failedIds.size).toBe(0)
  })

  it('un lot en échec ne perd que ses ids, les autres lots sont gardés', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `c${i}`)
    const fetchBatch = jest.fn(async (chunk) => {
      if (chunk[0] === 'c0') throw new Error('429')
      return { data: chunk.map((id) => detail(id)) }
    })
    const { details, failedIds } = await loadComponentDetails({ ids, fetchBatch })
    expect(failedIds.size).toBe(50)
    expect(failedIds.has('c0')).toBe(true)
    expect(details.size).toBe(10)
    expect(details.has('c55')).toBe(true)
  })

  it('un id absent d un lot réussi (inconnu, supprimé, hors périmètre) n est ni détail ni échec', async () => {
    const fetchBatch = jest.fn().mockResolvedValue({ data: [detail('a')] })
    const { details, failedIds } = await loadComponentDetails({ ids: ['a', 'gone'], fetchBatch })
    expect(details.has('a')).toBe(true)
    expect(details.has('gone')).toBe(false)
    expect(failedIds.has('gone')).toBe(false)
  })

  it('réponse inattendue : tout le lot est en échec', async () => {
    for (const bad of [null, {}, { data: 'x' }, { data: { foo: 1 } }]) {
      const { failedIds } = await loadComponentDetails({ ids: ['a'], fetchBatch: jest.fn().mockResolvedValue(bad) })
      expect(failedIds.has('a')).toBe(true)
    }
  })

  it('accepte les formes tableau, { data: [] } et { data: { data: [] } }', async () => {
    for (const shape of [[detail('a')], { data: [detail('a')] }, { data: { data: [detail('a')] } }]) {
      const { details } = await loadComponentDetails({ ids: ['a'], fetchBatch: jest.fn().mockResolvedValue(shape) })
      expect(details.has('a')).toBe(true)
    }
  })

  it('sans fonction de lot : tous les ids sont à relire par un autre chemin', async () => {
    const { failedIds } = await loadComponentDetails({ ids: ['a', 'b'], fetchBatch: null })
    expect([...failedIds]).toEqual(['a', 'b'])
  })
})

describe('hydrateSubComponents avec lots', () => {
  const ingredients = [
    { id: 'ing-a', name: 'Farine' },
    { id: 'ing-b', name: 'Sucre' },
  ]
  const comps = [
    { id: 'a', name: 'Pâte' },
    { id: 'b', name: 'Crème' },
    { id: 'c', name: 'Déjà hydraté', subComponents: [{ name: 'x' }] },
  ]

  it('hydrate par lot : 1 appel de lot, 0 appel par composant, composants déjà hydratés ignorés', async () => {
    const fetchComponentsBatch = jest.fn().mockResolvedValue({ data: [detail('a'), detail('b')] })
    const fetchComponent = jest.fn()
    const out = await hydrateSubComponents(comps, { ingredients, fetchComponent, fetchComponentsBatch })
    expect(fetchComponentsBatch).toHaveBeenCalledTimes(1)
    expect(fetchComponentsBatch).toHaveBeenCalledWith(['a', 'b'])
    expect(fetchComponent).not.toHaveBeenCalled()
    expect(out.hydrated).toBe(2)
    expect(out.missing).toBe(0)
    expect(out.components[0].subComponents[0]).toMatchObject({ itemType: 'Ingredient', id: 'ing-a' })
    expect(out.components[0].numberOfUnitsRecipe).toBe(10)
    expect(out.components[2].subComponents).toEqual([{ name: 'x' }])
  })

  it('lot en échec : relecture par composant des seuls ids du lot (comportement d avant)', async () => {
    const fetchComponentsBatch = jest.fn().mockRejectedValue(new Error('404 route inconnue'))
    const fetchComponent = jest.fn(async (id) => detail(id))
    const out = await hydrateSubComponents(comps, { ingredients, fetchComponent, fetchComponentsBatch })
    expect(fetchComponent).toHaveBeenCalledTimes(2)
    expect(out.hydrated).toBe(2)
    expect(out.components[1].subComponents).toHaveLength(1)
  })

  it('id absent d un lot réussi : pas de relecture, compté sans recette', async () => {
    const fetchComponentsBatch = jest.fn().mockResolvedValue({ data: [detail('a')] })
    const fetchComponent = jest.fn()
    const out = await hydrateSubComponents(comps, { ingredients, fetchComponent, fetchComponentsBatch })
    expect(fetchComponent).not.toHaveBeenCalled()
    expect(out.hydrated).toBe(1)
    expect(out.missing).toBe(1)
    expect(out.components[1].subComponents).toBeUndefined()
  })

  it('une relecture par composant qui échoue reste tolérée', async () => {
    const fetchComponentsBatch = jest.fn().mockRejectedValue(new Error('429'))
    const fetchComponent = jest.fn(async (id) => {
      if (id === 'a') throw new Error('429')
      return detail(id)
    })
    const out = await hydrateSubComponents(comps, { ingredients, fetchComponent, fetchComponentsBatch })
    expect(out.hydrated).toBe(1)
    expect(out.missing).toBe(1)
  })

  it('fetchComponent seul (sans lot injecté) : chemin par composant, comme avant', async () => {
    const fetchComponent = jest.fn(async (id) => detail(id))
    const out = await hydrateSubComponents(comps, { ingredients, fetchComponent })
    expect(fetchComponent).toHaveBeenCalledTimes(2)
    expect(out.hydrated).toBe(2)
  })

  it('même résultat par lot et par composant', async () => {
    const viaBatch = await hydrateSubComponents(comps, {
      ingredients,
      fetchComponent: jest.fn(),
      fetchComponentsBatch: jest.fn().mockResolvedValue({ data: [detail('a'), detail('b')] }),
    })
    const viaEach = await hydrateSubComponents(comps, { ingredients, fetchComponent: jest.fn(async (id) => detail(id)) })
    expect(viaBatch.components).toEqual(viaEach.components)
  })

  it('aucun composant à hydrater : aucun appel', async () => {
    const fetchComponentsBatch = jest.fn()
    const out = await hydrateSubComponents([{ id: 'c', subComponents: [{ name: 'x' }] }], { fetchComponentsBatch })
    expect(fetchComponentsBatch).not.toHaveBeenCalled()
    expect(out.hydrated).toBe(0)
  })
})
