import { ref, nextTick } from 'vue'
import { useForecastModificationsForm } from '@/composables/useForecastModificationsForm'
import { FORECAST_MODIFICATION_TYPES as T, PERCAP_MODES } from '@/utils/forecastModificationModel'

const catalogById = new Map([
  ['m1', { id: 'm1', name: 'Bière blonde', basePrice: 8, pricing: { vatRate: 10 } }],
  ['m2', { id: 'm2', name: 'Eau', basePrice: 3 }],
  ['m3', { id: 'm3', name: 'Sans prix' }],
])

const rec = (over) => ({
  eventId: 'e1', shopId: 's1', menuItemId: 'm1', menuItemName: 'Bière blonde',
  menuItemCategory: 'Bières', menuItemType: 'Boisson', quantity: 1, revenue: 8,
  ...over,
})

const RECORDS = [
  rec({}),
  rec({ menuItemId: 'm2', menuItemName: 'Eau', menuItemCategory: 'Softs' }),
  rec({ menuItemId: 'm3', menuItemName: 'Sans prix', menuItemCategory: 'Softs' }),
]

const make = (over = {}) => useForecastModificationsForm({ articleRecords: RECORDS, catalogById, spaceId: null, ...over })

describe('useForecastModificationsForm', () => {
  it('démarre sur un prix d\'article vide, liste vide, rien d\'applicable', () => {
    const f = make()
    expect(f.draft).toMatchObject({ type: T.ITEM_PRICE, target: '', value: '', mode: null })
    expect(f.list.value).toEqual([])
    expect(f.canAdd.value).toBe(false)
    expect(f.canApply.value).toBe(false)
    expect(f.replaced.value).toBeNull()
  })

  it('options : articles, catégories et types issus des records', () => {
    const { options } = make()
    expect(options.value.items.map((i) => i.id)).toEqual(['m1', 'm2', 'm3'])
    expect(options.value.categories).toEqual(['Bières', 'Softs'])
    expect(options.value.types).toEqual(['Boisson'])
  })

  it('options réactives : suit un ref de records', async () => {
    const records = ref([rec({})])
    const f = useForecastModificationsForm({ articleRecords: records, catalogById })
    expect(f.options.value.items).toHaveLength(1)
    records.value = RECORDS
    await nextTick()
    expect(f.options.value.items).toHaveLength(3)
  })

  it('ajoute un prix d\'article, remet la saisie à zéro et rend la liste applicable', () => {
    const f = make()
    f.patch({ target: 'm1', value: '7.5' })
    expect(f.canAdd.value).toBe(true)
    expect(f.add()).toBe(true)
    expect(f.list.value).toHaveLength(1)
    expect(f.list.value[0]).toMatchObject({ type: T.ITEM_PRICE, target: 'm1', value: 7.5 })
    expect(f.draft).toMatchObject({ type: T.ITEM_PRICE, target: '', value: '', mode: null })
    expect(f.canApply.value).toBe(true)
  })

  it('une même cible remplace la précédente et renseigne `replaced`', () => {
    const f = make()
    f.patch({ target: 'm1', value: 7 })
    f.add()
    const first = f.list.value[0]
    f.patch({ target: 'm1', value: 9 })
    f.add()
    expect(f.list.value).toHaveLength(1)
    expect(f.list.value[0].value).toBe(9)
    expect(f.list.value[0].id).not.toBe(first.id)
    expect(f.replaced.value).toMatchObject({ id: first.id, value: 7 })
  })

  it('des cibles différentes coexistent et `replaced` reste vide', () => {
    const f = make()
    f.patch({ target: 'm1', value: 7 })
    f.add()
    f.patch({ target: 'm2', value: 2 })
    f.add()
    expect(f.list.value.map((m) => m.target)).toEqual(['m1', 'm2'])
    expect(f.replaced.value).toBeNull()
  })

  it('retrait par identifiant', () => {
    const f = make()
    f.patch({ target: 'm1', value: 7 })
    f.add()
    f.patch({ target: 'm2', value: 2 })
    f.add()
    const [a, b] = f.list.value
    f.remove(a.id)
    expect(f.list.value.map((m) => m.id)).toEqual([b.id])
    f.remove(b.id)
    expect(f.canApply.value).toBe(false)
  })

  it('remove efface l\'information « remplacé »', () => {
    const f = make()
    f.patch({ target: 'm1', value: 7 })
    f.add()
    f.patch({ target: 'm1', value: 9 })
    f.add()
    expect(f.replaced.value).not.toBeNull()
    f.remove(f.list.value[0].id)
    expect(f.replaced.value).toBeNull()
  })

  it('clear vide la liste, la saisie en cours et `replaced`', () => {
    const f = make()
    f.patch({ target: 'm1', value: 7 })
    f.add()
    f.patch({ target: 'm1', value: 9 })
    f.add()
    f.patch({ target: 'm2', value: 4 })
    f.clear()
    expect(f.list.value).toEqual([])
    expect(f.draft).toMatchObject({ type: T.ITEM_PRICE, target: '', value: '' })
    expect(f.replaced.value).toBeNull()
    expect(f.canApply.value).toBe(false)
  })

  it('toRunModel : { kind: forecast, modifications } cloné, indépendant de la liste', () => {
    const f = make()
    f.patch({ target: 'm1', value: 7 })
    f.add()
    const model = f.toRunModel()
    expect(model.kind).toBe('forecast')
    expect(model.modifications).toEqual(f.list.value)
    expect(model.modifications).not.toBe(f.list.value)
    expect(model.modifications[0]).not.toBe(f.list.value[0])
    model.modifications[0].value = 999
    expect(f.list.value[0].value).toBe(7)
    f.patch({ target: 'm2', value: 2 })
    f.add()
    expect(model.modifications).toHaveLength(1)
  })

  it('changer de type remet la saisie à zéro (cible, valeur, mode)', () => {
    const f = make()
    f.patch({ target: 'm1', value: 7 })
    f.setType(T.PERCAP)
    expect(f.draft).toMatchObject({ type: T.PERCAP, target: '', value: 0, mode: null })
    f.patch({ mode: PERCAP_MODES.BASKET, value: 5 })
    f.setType(T.ITEM_PRICE)
    expect(f.draft).toMatchObject({ type: T.ITEM_PRICE, target: '', value: '', mode: null })
  })

  it('changer de type efface `replaced` mais garde la liste', () => {
    const f = make()
    f.patch({ target: 'm1', value: 7 })
    f.add()
    f.patch({ target: 'm1', value: 8 })
    f.add()
    expect(f.replaced.value).not.toBeNull()
    f.setType(T.BASKET)
    expect(f.replaced.value).toBeNull()
    expect(f.list.value).toHaveLength(1)
  })

  it('canAdd faux : prix vide, négatif ou non numérique', () => {
    const f = make()
    f.patch({ target: 'm1', value: '' })
    expect(f.canAdd.value).toBe(false)
    f.patch({ value: -1 })
    expect(f.canAdd.value).toBe(false)
    f.patch({ value: 'abc' })
    expect(f.canAdd.value).toBe(false)
    f.patch({ value: 0 })
    expect(f.canAdd.value).toBe(true)
  })

  it('canAdd faux avec une cible inconnue, add ne fait rien', () => {
    const f = make()
    f.patch({ target: 'm404', value: 7 })
    expect(f.canAdd.value).toBe(false)
    expect(f.add()).toBe(false)
    expect(f.list.value).toEqual([])
    f.setType(T.CATEGORY_PCT)
    f.patch({ target: 'Inconnue', value: 10 })
    expect(f.canAdd.value).toBe(false)
    f.setType(T.TYPE_PCT)
    f.patch({ target: 'Inconnu', value: 10 })
    expect(f.canAdd.value).toBe(false)
  })

  it('canAdd faux pour un article non priceable (sans prix catalogue)', () => {
    const f = make()
    f.patch({ target: 'm3', value: 5 })
    expect(f.options.value.items.find((i) => i.id === 'm3').priceable).toBe(false)
    expect(f.canAdd.value).toBe(false)
    expect(f.add()).toBe(false)
  })

  it('catégorie et type : cible connue obligatoire, le curseur à 0 reste ajoutable', () => {
    const f = make()
    f.setType(T.CATEGORY_PCT)
    expect(f.canAdd.value).toBe(false)
    f.patch({ target: 'Bières', value: 10 })
    expect(f.canAdd.value).toBe(true)
    f.add()
    f.setType(T.TYPE_PCT)
    f.patch({ target: 'Boisson', value: -5 })
    f.add()
    expect(f.list.value.map((m) => [m.type, m.target, m.value])).toEqual([
      [T.CATEGORY_PCT, 'Bières', 10],
      [T.TYPE_PCT, 'Boisson', -5],
    ])
  })

  it('percap : le mode est obligatoire, et deux modes coexistent', () => {
    const f = make()
    f.setType(T.PERCAP)
    f.patch({ value: 5 })
    expect(f.canAdd.value).toBe(false)
    f.patch({ mode: PERCAP_MODES.TRANSFORMATION })
    expect(f.canAdd.value).toBe(true)
    f.add()
    f.setType(T.PERCAP)
    f.patch({ mode: PERCAP_MODES.BASKET, value: 3 })
    f.add()
    expect(f.list.value.map((m) => m.mode)).toEqual([PERCAP_MODES.TRANSFORMATION, PERCAP_MODES.BASKET])
  })

  it('transformation et panier : sans cible, une seule modification chacun', () => {
    const f = make()
    f.setType(T.TRANSFORMATION)
    f.patch({ value: 10 })
    expect(f.canAdd.value).toBe(true)
    f.add()
    f.setType(T.TRANSFORMATION)
    f.patch({ value: 20 })
    f.add()
    expect(f.list.value).toHaveLength(1)
    expect(f.list.value[0]).toMatchObject({ type: T.TRANSFORMATION, target: null, value: 20 })
    expect(f.replaced.value).toMatchObject({ type: T.TRANSFORMATION, value: 10 })
    f.setType(T.BASKET)
    f.patch({ value: -10 })
    f.add()
    expect(f.list.value.map((m) => m.type)).toEqual([T.TRANSFORMATION, T.BASKET])
  })

  it('patch : une cible nulle devient une chaîne vide, une cible numérique une chaîne', () => {
    const f = make()
    f.patch({ target: null })
    expect(f.draft.target).toBe('')
    f.patch({ target: 12 })
    expect(f.draft.target).toBe('12')
  })
})
