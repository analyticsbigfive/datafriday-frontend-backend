jest.mock('@/api/endpoints/cost-tracking.api', () => ({
  getCostTrackingCatalog: jest.fn().mockResolvedValue({
    types: [{
      id: 't1', name: 'Food',
      categories: [{ id: 'c1', name: 'Burgers', articles: [{ id: 'a1', name: 'Burger' }] }],
      articlesWithoutCategory: [],
    }],
    articlesWithoutType: [],
  }),
  getCostTrackingSeries: jest.fn().mockResolvedValue({ lines: [], events: [] }),
  getCostTrackingOptions: jest.fn().mockResolvedValue({
    suppliers: [{ key: 's1', name: 'Metro', brickCount: 2 }],
    components: [{ id: 'k1', name: 'Sauce', articleCount: 1 }],
  }),
  getCostTrackingArticleHistory: jest.fn(),
  getCostTrackingArticleIngredients: jest.fn().mockResolvedValue({ lines: [{ id: 'i1', name: 'Pain', lineKind: 'ingredient' }] }),
}))

import { createStore } from 'vuex'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import costTracking from '@/store/modules/costTracking'
import { getCostTrackingOptions, getCostTrackingSeries } from '@/api/endpoints/cost-tracking.api'
import { defaultGroupBy, useCostTracking } from '@/composables/useCostTracking'

function setup() {
  const store = createStore({ modules: { costTracking } })
  let ct
  const Host = defineComponent({
    setup() {
      ct = useCostTracking({ spaceId: ref('s1') })
      return () => null
    },
  })
  mount(Host, { global: { plugins: [store] } })
  return { ct: () => ct }
}

describe('defaultGroupBy', () => {
  it('un article filtré (avec ou sans ingrédient) : mode ingrédient', () => {
    expect(defaultGroupBy({ menuItemId: 'a', ingredientId: 'i' })).toBe('ingredient')
    expect(defaultGroupBy({ menuItemId: 'a' })).toBe('ingredient')
    expect(defaultGroupBy({ categoryId: 'c' })).toBe('article')
    expect(defaultGroupBy({ typeId: 't' })).toBe('category')
  })
})

describe('useCostTracking : descente par clic (drill)', () => {
  it('type puis catégorie puis article puis ingrédient, en filtrant à chaque niveau', async () => {
    const { ct } = setup()
    await flushPromises()

    ct().drill({ kind: 'type', id: 't1' })
    expect(ct().typeId.value).toBe('t1')
    expect(ct().groupBy.value).toBe('category')

    ct().drill({ kind: 'category', id: 'c1' })
    expect(ct().categoryId.value).toBe('c1')
    expect(ct().groupBy.value).toBe('article')

    ct().drill({ kind: 'article', id: 'a1' })
    await flushPromises()
    expect(ct().menuItemId.value).toBe('a1')
    expect(ct().groupBy.value).toBe('ingredient')
    expect(ct().ingredientOptions.value.map((o) => o.id)).toEqual(['i1'])

    ct().drill({ kind: 'ingredient', id: 'i1' })
    expect(ct().ingredientId.value).toBe('i1')
    expect(ct().groupBy.value).toBe('ingredient')
  })

  it('vider l article vide l ingrédient et quitte le mode ingrédient', async () => {
    const { ct } = setup()
    await flushPromises()
    ct().drill({ kind: 'article', id: 'a1' })
    ct().setIngredient('i1')
    ct().setArticle(null)
    await flushPromises()
    expect(ct().ingredientId.value).toBeNull()
    expect(ct().groupBy.value).not.toBe('ingredient')
    expect(ct().ingredientOptions.value).toEqual([])
  })
})

describe('useCostTracking : fournisseurs et composants', () => {
  it('les listes viennent de /options et suivent type, catégorie, article', async () => {
    const { ct } = setup()
    await flushPromises()
    expect(ct().supplierOptions.value.map((o) => o.key)).toEqual(['s1'])
    expect(ct().componentOptions.value.map((o) => o.id)).toEqual(['k1'])
    getCostTrackingOptions.mockClear()
    ct().setType('t1')
    await flushPromises()
    expect(getCostTrackingOptions).toHaveBeenCalledWith('s1', expect.objectContaining({
      typeId: 't1', categoryId: undefined, menuItemId: undefined,
      from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }))
  })

  it('une sélection absente de la nouvelle liste est vidée', async () => {
    const { ct } = setup()
    await flushPromises()
    ct().setSupplier('s1')
    await flushPromises()
    expect(ct().supplierKey.value).toBe('s1')
    getCostTrackingOptions.mockResolvedValueOnce({ suppliers: [], components: [] })
    ct().setType('t1')
    await flushPromises()
    expect(ct().supplierKey.value).toBeNull()
  })

  it('supplierKey et componentId partent dans les paramètres de séries', async () => {
    const { ct } = setup()
    await flushPromises()
    getCostTrackingSeries.mockClear()
    ct().setSupplier('s1')
    ct().setComponent('k1')
    await flushPromises()
    const calls = getCostTrackingSeries.mock.calls.map((c) => c[1])
    expect(calls.some((p) => p.supplierKey === 's1' && p.componentId === 'k1' && p.groupBy === 'article')).toBe(true)
  })

  it('second appel groupBy=supplier tant que le mode n est pas fournisseur, supprimé en mode fournisseur', async () => {
    const { ct } = setup()
    await flushPromises()
    expect(getCostTrackingSeries.mock.calls.some((c) => c[1].groupBy === 'supplier')).toBe(true)
    getCostTrackingSeries.mockClear()
    ct().setGroupBy('supplier')
    await flushPromises()
    const groups = getCostTrackingSeries.mock.calls.map((c) => c[1].groupBy)
    expect(groups).toEqual(['supplier'])
    expect(ct().groupBy.value).toBe('supplier')
  })

  it('le mode ingrédient reste valable sans article ; retirer l article revient au mode auto', async () => {
    const { ct } = setup()
    await flushPromises()
    ct().setGroupBy('ingredient')
    expect(ct().groupBy.value).toBe('ingredient')
    ct().setGroupBy('component')
    expect(ct().groupBy.value).toBe('component')
  })

  it('drill d un fournisseur ou d un composant applique son filtre', async () => {
    const { ct } = setup()
    await flushPromises()
    ct().setGroupBy('supplier')
    ct().drill({ kind: 'supplier', id: 's1' })
    expect(ct().supplierKey.value).toBe('s1')
    expect(ct().groupBy.value).toBe('article')
    ct().drill({ kind: 'component', id: 'k1' })
    expect(ct().componentId.value).toBe('k1')
  })
})
