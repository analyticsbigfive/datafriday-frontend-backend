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
  getCostTrackingArticleHistory: jest.fn(),
  getCostTrackingArticleIngredients: jest.fn().mockResolvedValue({ lines: [{ id: 'i1', name: 'Pain', lineKind: 'ingredient' }] }),
}))

import { createStore } from 'vuex'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import costTracking from '@/store/modules/costTracking'
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
  it('article et ingrédient filtrés : mode ingrédient ; article seul : mode article', () => {
    expect(defaultGroupBy({ menuItemId: 'a', ingredientId: 'i' })).toBe('ingredient')
    expect(defaultGroupBy({ menuItemId: 'a' })).toBe('article')
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
