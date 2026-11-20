/**
 * ForecastModificationsForm : rendu et interactions (fumée), sans Vuetify (v-icon neutralisé),
 * avec le vrai composable useForecastModificationsForm et le dictionnaire FR réel.
 */
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useForecastModificationsForm } from '@/composables/useForecastModificationsForm'
import { FORECAST_MODIFICATION_TYPES as T, PERCAP_MODES } from '@/utils/forecastModificationModel'
import { translations } from '@/i18n/translations'
import ForecastModificationsForm from '@/components/space-workspace/analyse/forecast/ForecastModificationsForm.vue'

const FR = translations.fr

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
const BASES = { transformationRate: 12.5, perCapita: 8, basket: 15 }

let formRef
function mountForm({ hasReport = false, baseValues = BASES } = {}) {
  const onRun = jest.fn()
  const onBack = jest.fn()
  const Harness = defineComponent({
    setup() {
      const form = useForecastModificationsForm({ articleRecords: RECORDS, catalogById, spaceId: null })
      formRef = form
      return () => h(ForecastModificationsForm, { form, baseValues, hasReport, onRun, onBack })
    },
  })
  const w = mount(Harness, { global: { stubs: { 'v-icon': true } } })
  return { w, onRun, onBack }
}

const typeSelect = (w) => w.findAll('select')[0]
const addButton = (w) => w.find('.fc-add')
const applyButton = (w) => w.find('.fc-btn--primary')

async function chooseType(w, type) {
  await typeSelect(w).setValue(type)
}
async function addItemPrice(w, id, price) {
  await w.findAll('select')[1].setValue(id)
  await w.find('input.fc-num').setValue(String(price))
  await addButton(w).trigger('click')
}

describe('ForecastModificationsForm', () => {
  it('le menu « Type de modification » propose les 6 types, libellés traduits', () => {
    const { w } = mountForm()
    const options = typeSelect(w).findAll('option')
    expect(options.map((o) => o.attributes('value'))).toEqual(Object.values(T))
    expect(options).toHaveLength(6)
    expect(options.map((o) => o.text())).toEqual([
      FR.fcstTypeItemPrice, FR.fcstTypeCategoryPct, FR.fcstTypeTypePct,
      FR.fcstTypeTransformation, FR.fcstTypePercap, FR.fcstTypeBasket,
    ])
    expect(w.find('form').attributes('aria-label')).toBe(FR.fcstFormLabel)
    expect(w.text()).toContain(FR.fcstIntro)
  })

  it('départ : prix d\'article, Ajouter et Appliquer désactivés, liste vide', () => {
    const { w } = mountForm()
    expect(w.find('input.fc-num').exists()).toBe(true)
    expect(addButton(w).attributes('disabled')).toBeDefined()
    expect(applyButton(w).attributes('disabled')).toBeDefined()
    expect(w.text()).toContain(FR.fcstListEmpty)
    expect(w.findAll('.fc-row')).toHaveLength(0)
  })

  it('article sans prix catalogue : option désactivée avec mention', () => {
    const { w } = mountForm()
    const opts = w.findAll('select')[1].findAll('option')
    const noPrice = opts.find((o) => o.attributes('value') === 'm3')
    expect(noPrice.attributes('disabled')).toBeDefined()
    expect(noPrice.text()).toContain(FR.fcstItemNoPrice)
  })

  it('ajout via le bouton : une ligne dans la liste, saisie remise à zéro', async () => {
    const { w } = mountForm()
    await w.findAll('select')[1].setValue('m1')
    await w.find('input.fc-num').setValue('7.5')
    expect(addButton(w).attributes('disabled')).toBeUndefined()
    await addButton(w).trigger('click')
    const rows = w.findAll('.fc-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('Prix TTC Bière blonde')
    expect(formRef.list.value).toHaveLength(1)
    expect(w.find('input.fc-num').element.value).toBe('')
    expect(addButton(w).attributes('disabled')).toBeDefined()
    expect(applyButton(w).attributes('disabled')).toBeUndefined()
  })

  it('Entrée dans le champ prix (submit du formulaire) ajoute aussi', async () => {
    const { w } = mountForm()
    await w.findAll('select')[1].setValue('m2')
    await w.find('input.fc-num').setValue('2')
    await w.find('form').trigger('submit')
    expect(formRef.list.value).toHaveLength(1)
  })

  it('prix HT affiché sous le champ quand le taux de TVA est connu', async () => {
    const { w } = mountForm()
    await w.findAll('select')[1].setValue('m1')
    await w.find('input.fc-num').setValue('11')
    expect(w.find('.cf-hint').exists()).toBe(true)
    expect(w.find('.cf-hint').text()).toContain('HT')
    // Eau : pas de taux de TVA, pas de HT.
    await w.findAll('select')[1].setValue('m2')
    expect(w.find('.cf-hint').exists()).toBe(false)
  })

  it('prix négatif : message d\'erreur, Ajouter désactivé', async () => {
    const { w } = mountForm()
    await w.findAll('select')[1].setValue('m1')
    await w.find('input.fc-num').setValue('-3')
    expect(w.find('.cf-hint').text()).toBe(FR.fcstPriceInvalid)
    expect(w.find('input.fc-num').attributes('aria-invalid')).toBe('true')
    expect(addButton(w).attributes('disabled')).toBeDefined()
  })

  it('même cible ajoutée deux fois : une seule ligne et note « remplace »', async () => {
    const { w } = mountForm()
    await addItemPrice(w, 'm1', 7)
    await addItemPrice(w, 'm1', 9)
    expect(w.findAll('.fc-row')).toHaveLength(1)
    expect(w.find('.fc-list__note').text()).toContain('Bière blonde')
    expect(w.find('.fc-row').text()).toContain('9')
  })

  it('retirer une ligne via son bouton', async () => {
    const { w } = mountForm()
    await addItemPrice(w, 'm1', 7)
    await addItemPrice(w, 'm2', 2)
    expect(w.findAll('.fc-row')).toHaveLength(2)
    const rm = w.findAll('.fc-row__rm')[0]
    expect(rm.attributes('aria-label')).toContain('Bière blonde')
    await rm.trigger('click')
    expect(w.findAll('.fc-row')).toHaveLength(1)
    expect(w.find('.fc-row').text()).toContain('Eau')
  })

  it('« Tout effacer » vide la liste ; désactivé quand elle est vide', async () => {
    const { w } = mountForm()
    const clear = () => w.findAll('.fc-btn--ghost')[0]
    expect(clear().attributes('disabled')).toBeDefined()
    await addItemPrice(w, 'm1', 7)
    expect(clear().attributes('disabled')).toBeUndefined()
    await clear().trigger('click')
    expect(w.findAll('.fc-row')).toHaveLength(0)
    expect(applyButton(w).attributes('disabled')).toBeDefined()
  })

  it('Appliquer émet run avec { kind: forecast, modifications } (copie)', async () => {
    const { w, onRun } = mountForm()
    await addItemPrice(w, 'm1', 7.5)
    await chooseType(w, T.BASKET)
    await w.find('input[type="range"]').setValue(10)
    await addButton(w).trigger('click')
    await applyButton(w).trigger('click')
    expect(onRun).toHaveBeenCalledTimes(1)
    const model = onRun.mock.calls[0][0]
    expect(model.kind).toBe('forecast')
    expect(model.modifications).toHaveLength(2)
    expect(model.modifications[0]).toMatchObject({ type: T.ITEM_PRICE, target: 'm1', value: 7.5 })
    expect(model.modifications[1]).toMatchObject({ type: T.BASKET, value: 10 })
    expect(model.modifications).not.toBe(formRef.list.value)
  })

  it('élasticité : champ absent sans modification de prix, puis réglable et transmise à run', async () => {
    const { w, onRun } = mountForm()
    const elasticity = () => w.find('input[id$="-elasticity"]')
    expect(elasticity().exists()).toBe(false)
    await addItemPrice(w, 'm1', 8.8)
    expect(elasticity().exists()).toBe(true)
    expect(w.text()).toContain(FR.fcstElasticityHintZero)
    await elasticity().setValue('-1')
    await elasticity().trigger('change')
    expect(w.text()).toContain(FR.fcstElasticityHint.replace('{pct}', '-9,1 %'))
    await elasticity().setValue('-9')
    await elasticity().trigger('change')
    expect(elasticity().element.value).toBe('-3')
    await applyButton(w).trigger('click')
    expect(onRun.mock.calls[0][0].elasticity).toBe(-3)
  })

  it('Appliquer ne fait rien quand la liste est vide', async () => {
    const { w, onRun } = mountForm()
    await applyButton(w).trigger('click')
    expect(onRun).not.toHaveBeenCalled()
  })

  it('curseurs : data-swipe-lock sur chaque input[type=range]', async () => {
    const { w } = mountForm()
    expect(w.find('input[type="range"]').exists()).toBe(false)
    for (const type of [T.CATEGORY_PCT, T.TYPE_PCT, T.TRANSFORMATION, T.PERCAP, T.BASKET]) {
      await chooseType(w, type)
      const ranges = w.findAll('input[type="range"]')
      expect(ranges).toHaveLength(1)
      expect(ranges[0].attributes('data-swipe-lock')).toBeDefined()
      expect(ranges[0].attributes('min')).toBe('-100')
      expect(ranges[0].attributes('max')).toBe('100')
    }
  })

  it('curseur : % signé, valeur de base du rapport et valeur simulée', async () => {
    const { w } = mountForm()
    await chooseType(w, T.TRANSFORMATION)
    await w.find('input[type="range"]').setValue(20)
    expect(w.find('.fc-slider__pct').text()).toBe('+20 %')
    expect(w.find('.fc-slider__res').exists()).toBe(true)
    expect(w.find('input[type="range"]').attributes('aria-valuetext')).toContain('+20')
    // Prix d'une catégorie : pas de valeur de base, seulement le %.
    await chooseType(w, T.CATEGORY_PCT)
    expect(w.find('.fc-slider__res').exists()).toBe(false)
  })

  it('sans valeur de base (rapport vide), le curseur n\'affiche que le %', async () => {
    const { w } = mountForm({ baseValues: null })
    await chooseType(w, T.BASKET)
    expect(w.find('.fc-slider__res').exists()).toBe(false)
  })

  it('catégorie : menu des catégories du rapport, ajout, ligne lisible', async () => {
    const { w } = mountForm()
    await chooseType(w, T.CATEGORY_PCT)
    const target = w.findAll('select')[1]
    expect(target.findAll('option').map((o) => o.attributes('value'))).toEqual(['', 'Bières', 'Softs'])
    expect(addButton(w).attributes('disabled')).toBeDefined()
    await target.setValue('Softs')
    await w.find('input[type="range"]').setValue(-10)
    await addButton(w).trigger('click')
    expect(w.find('.fc-row').text()).toBe('Catégorie Softs : -10 %')
  })

  it('percap : deux modes en boutons radio, mode obligatoire pour ajouter', async () => {
    const { w } = mountForm()
    await chooseType(w, T.PERCAP)
    const radios = w.findAll('input[type="radio"]')
    expect(radios.map((r) => r.attributes('value'))).toEqual([PERCAP_MODES.TRANSFORMATION, PERCAP_MODES.BASKET])
    expect(w.find('[role="radiogroup"]').attributes('aria-labelledby')).toBeTruthy()
    await w.find('input[type="range"]').setValue(5)
    expect(addButton(w).attributes('disabled')).toBeDefined()
    await radios[1].setValue(true)
    expect(addButton(w).attributes('disabled')).toBeUndefined()
    await addButton(w).trigger('click')
    expect(w.find('.fc-row').text()).toBe('Percap (panier plus gros) : +5 %')
  })

  it('changer de type remet la saisie à zéro, la liste est conservée', async () => {
    const { w } = mountForm()
    await addItemPrice(w, 'm1', 7)
    await w.findAll('select')[1].setValue('m2')
    await chooseType(w, T.BASKET)
    await chooseType(w, T.ITEM_PRICE)
    expect(w.findAll('select')[1].element.value).toBe('')
    expect(w.findAll('.fc-row')).toHaveLength(1)
  })

  it('« Retour au rapport » visible seulement quand un rapport existe, et émet back', async () => {
    const without = mountForm({ hasReport: false })
    expect(without.w.findAll('.fc-btn--ghost')).toHaveLength(1)
    const withReport = mountForm({ hasReport: true })
    const ghosts = withReport.w.findAll('.fc-btn--ghost')
    expect(ghosts).toHaveLength(2)
    await ghosts[1].trigger('click')
    expect(withReport.onBack).toHaveBeenCalledTimes(1)
    await nextTick()
  })
})
