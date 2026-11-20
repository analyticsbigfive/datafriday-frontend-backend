/**
 * useForecastComparisonWiring : catalogue, formulaire, valeurs de départ des curseurs et règle de
 * changement d'outil (fermeture du drawer, brouillon vidé, modèle appliqué étranger oublié).
 * Le drawer est le vrai useComparisonDrawer.
 */
import { ref, nextTick } from 'vue'
import { useComparisonDrawer } from '@/composables/useComparisonDrawer'
import { useForecastComparisonWiring } from '@/composables/useForecastComparisonWiring'
import { FORECAST_MODIFICATION_TYPES as T } from '@/utils/forecastModificationModel'

const RECORDS = [
  { eventId: 'e1', shopId: 's1', menuItemId: 'm1', menuItemName: 'Bière blonde', menuItemCategory: 'Bières', menuItemType: 'Boisson', quantity: 1, revenue: 8 },
]
const MENU_ITEMS = [
  { id: 'm1', name: 'Bière blonde', basePrice: 8, pricing: { vatRate: 10 } },
  { id: 2, name: 'Eau', basePrice: 3 },
]
const FORECAST = { kind: 'forecast', modifications: [{ id: 'x', type: T.TRANSFORMATION, value: 10 }] }
const CLASSIC = { kind: 'event', eventIds: ['e1'] }

function setup({ toolbox = 'predict', snapshot = null } = {}) {
  const tool = ref(toolbox)
  const comparison = useComparisonDrawer()
  const mainSnapshot = ref(snapshot)
  const wiring = useForecastComparisonWiring({
    toolbox: tool,
    comparison,
    articleRecords: ref(RECORDS),
    menuItems: ref(MENU_ITEMS),
    spaceId: ref('sp1'),
    mainSnapshot,
  })
  return { tool, comparison, mainSnapshot, wiring }
}

describe('useForecastComparisonWiring', () => {
  it('catalogById : identifiants en chaînes, vide sans catalogue', () => {
    const { wiring } = setup()
    expect([...wiring.catalogById.value.keys()]).toEqual(['m1', '2'])
    expect(wiring.catalogById.value.get('2').name).toBe('Eau')

    const empty = useForecastComparisonWiring({
      toolbox: ref('predict'), comparison: useComparisonDrawer(), articleRecords: ref([]), menuItems: ref(null),
    })
    expect(empty.catalogById.value.size).toBe(0)
  })

  it('le formulaire propose les articles du principal et du catalogue', () => {
    const { wiring } = setup()
    expect(wiring.form.options.value.items.map((i) => i.id)).toEqual(['m1'])
    expect(wiring.form.options.value.items[0].priceable).toBe(true)
  })

  it('drawerForm : le formulaire en Forecast, null ailleurs', async () => {
    const { tool, wiring } = setup()
    expect(wiring.isForecast.value).toBe(true)
    expect(wiring.drawerForm.value).toBe(wiring.form)
    tool.value = 'analyse'
    await nextTick()
    expect(wiring.isForecast.value).toBe(false)
    expect(wiring.drawerForm.value).toBeNull()
  })

  it('baseValues : puces du principal, null quand absentes ou non numériques', () => {
    const { wiring, mainSnapshot } = setup()
    expect(wiring.baseValues.value).toEqual({ transformationRate: null, perCapita: null, basket: null })
    mainSnapshot.value = { chips: { transferRate: 12.5, perCapita: 8, avgTransaction: 15 } }
    expect(wiring.baseValues.value).toEqual({ transformationRate: 12.5, perCapita: 8, basket: 15 })
    // Forecast : transformation et panier sans objet, seul le percap existe.
    mainSnapshot.value = { chips: { transferRate: null, perCapita: 7.2, avgTransaction: null } }
    expect(wiring.baseValues.value).toEqual({ transformationRate: null, perCapita: 7.2, basket: null })
    mainSnapshot.value = { chips: { transferRate: NaN, perCapita: '8', avgTransaction: 0 } }
    expect(wiring.baseValues.value).toEqual({ transformationRate: null, perCapita: null, basket: 0 })
  })

  it('changement d\'outil : ferme le drawer ouvert', async () => {
    const { tool, comparison } = setup({ toolbox: 'analyse' })
    comparison.openDrawer()
    expect(comparison.open.value).toBe(true)
    tool.value = 'predict'
    await nextTick()
    expect(comparison.open.value).toBe(false)
  })

  it('changement d\'outil, drawer déjà fermé : rien à fermer, sans erreur', async () => {
    const { tool, comparison } = setup({ toolbox: 'analyse' })
    tool.value = 'predict'
    await nextTick()
    expect(comparison.open.value).toBe(false)
  })

  it('quitter Forecast vide la liste et la saisie ; entrer en Forecast ne les touche pas', async () => {
    const { tool, wiring } = setup({ toolbox: 'analyse' })
    wiring.form.setType(T.TRANSFORMATION)
    wiring.form.patch({ value: 10 })
    wiring.form.add()
    wiring.form.setType(T.BASKET)
    wiring.form.patch({ value: 5 })
    expect(wiring.form.list.value).toHaveLength(1)

    tool.value = 'predict'
    await nextTick()
    expect(wiring.form.list.value).toHaveLength(1)
    expect(wiring.form.draft.value).toBe(5)

    tool.value = 'analyse'
    await nextTick()
    expect(wiring.form.list.value).toEqual([])
    // La saisie repart de zéro (le type choisi reste affiché).
    expect(wiring.form.draft).toMatchObject({ type: T.BASKET, target: '', value: 0, mode: null })
  })

  it('Forecast vers Event Predict : brouillon vidé aussi (quitter Forecast, quelle que soit la destination)', async () => {
    const { tool, wiring } = setup()
    wiring.form.setType(T.TRANSFORMATION)
    wiring.form.patch({ value: 10 })
    wiring.form.add()
    tool.value = 'event-predict'
    await nextTick()
    expect(wiring.form.list.value).toEqual([])
  })

  it('oublie un modèle Forecast appliqué en quittant Forecast, retour au formulaire', async () => {
    const { tool, comparison } = setup()
    comparison.openDrawer()
    comparison.run(FORECAST)
    comparison.showReady()
    tool.value = 'analyse'
    await nextTick()
    expect(comparison.applied.value).toBeNull()
    expect(comparison.view.value).toBe('form')
  })

  it('oublie une comparaison classique appliquée en entrant en Forecast', async () => {
    const { tool, comparison } = setup({ toolbox: 'analyse' })
    comparison.openDrawer()
    comparison.run(CLASSIC)
    comparison.showReady()
    tool.value = 'predict'
    await nextTick()
    expect(comparison.applied.value).toBeNull()
    expect(comparison.view.value).toBe('form')
  })

  it('garde le modèle appliqué quand il reste cohérent avec l\'outil', async () => {
    const { tool, comparison } = setup({ toolbox: 'analyse' })
    comparison.run(CLASSIC)
    comparison.showReady()
    // Analyse vers Event Predict : une comparaison classique n'est pas Forecast, elle reste.
    tool.value = 'event-predict'
    await nextTick()
    expect(comparison.applied.value).toMatchObject({ kind: 'event' })
    expect(comparison.view.value).toBe('ready')
  })
})
