import { mount } from '@vue/test-utils'
import NumberField from '@/components/common/NumberField.vue'

const setAppLocale = (locale) => localStorage.setItem('appLocale', locale)
const flat = (s) => s.replace(/[\s  ]/g, ' ')

afterEach(() => localStorage.removeItem('appLocale'))

const lastEmitted = (wrapper, event = 'update:modelValue') => {
  const all = wrapper.emitted(event)
  return all ? all[all.length - 1][0] : undefined
}

describe('NumberField — saisie virgule/point', () => {
  it('accepte la virgule française et émet un number à point décimal', async () => {
    setAppLocale('fr')
    const wrapper = mount(NumberField, { props: { modelValue: null } })
    const input = wrapper.find('input')
    await input.setValue('2,5')
    await input.trigger('blur')
    expect(lastEmitted(wrapper)).toBe(2.5)
  })

  it('accepte aussi le point', async () => {
    setAppLocale('en')
    const wrapper = mount(NumberField, { props: { modelValue: null } })
    const input = wrapper.find('input')
    await input.setValue('2.5')
    await input.trigger('blur')
    expect(lastEmitted(wrapper)).toBe(2.5)
  })

  it('arrondit à `decimals` et clampe sur min/max au blur', async () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: null, decimals: 2, min: 0, max: 100 },
    })
    const input = wrapper.find('input')
    await input.setValue('2,555')
    await input.trigger('blur')
    expect(lastEmitted(wrapper)).toBe(2.56)

    await input.setValue('-3')
    await input.trigger('blur')
    expect(lastEmitted(wrapper)).toBe(0)

    await input.setValue('250')
    await input.trigger('blur')
    expect(lastEmitted(wrapper)).toBe(100)
  })

  it('émet emptyValue quand le champ est vidé', async () => {
    const wrapper = mount(NumberField, { props: { modelValue: 5, emptyValue: 0 } })
    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('')
    await input.trigger('blur')
    expect(lastEmitted(wrapper)).toBe(0)
  })

  it('rejette les caractères non numériques pendant la frappe', async () => {
    const wrapper = mount(NumberField, { props: { modelValue: null } })
    const input = wrapper.find('input')
    await input.setValue('12a')
    // le caractère invalide est refusé : la valeur affichée reste celle d'avant
    expect(input.element.value).not.toBe('12a')
  })
})

describe('NumberField — affichage selon la langue', () => {
  it('fr : affiche "12,50" avec pad', () => {
    setAppLocale('fr')
    const wrapper = mount(NumberField, { props: { modelValue: 12.5, pad: true } })
    expect(wrapper.find('input').element.value).toBe('12,50')
  })

  it('en : affiche "12.50" avec pad', () => {
    setAppLocale('en')
    const wrapper = mount(NumberField, { props: { modelValue: 12.5, pad: true } })
    expect(wrapper.find('input').element.value).toBe('12.50')
  })

  it('fr : séparateur de milliers affiché hors focus, valeur éditable au focus', async () => {
    setAppLocale('fr')
    const wrapper = mount(NumberField, { props: { modelValue: 1234.5 } })
    const input = wrapper.find('input')
    expect(flat(input.element.value)).toBe('1 234,5')
    await input.trigger('focus')
    expect(input.element.value).toBe('1234,5')
  })
})

describe('NumberField — steppers +/−', () => {
  it('incrémente/décrémente de 0.01 (2 décimales) par défaut', async () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 2.5, steppers: true, min: 0 },
    })
    const [minus, plus] = wrapper.findAll('button')
    await plus.trigger('click')
    expect(lastEmitted(wrapper)).toBe(2.51)

    await wrapper.setProps({ modelValue: 2.51 })
    await minus.trigger('click')
    expect(lastEmitted(wrapper)).toBe(2.5)
  })

  it('respecte un step personnalisé en préservant les décimales (2,55 + 1 → 3,55)', async () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 2.55, steppers: true, step: 1 },
    })
    const [, plus] = wrapper.findAll('button')
    await plus.trigger('click')
    expect(lastEmitted(wrapper)).toBe(3.55)
  })

  it('clampe au min et désactive le bouton −', async () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 0, steppers: true, min: 0 },
    })
    const [minus] = wrapper.findAll('button')
    expect(minus.attributes('disabled')).toBeDefined()
  })

  it('les flèches clavier ↑/↓ appliquent le pas', async () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 1, step: 0.01 },
    })
    await wrapper.find('input').trigger('keydown', { key: 'ArrowUp' })
    expect(lastEmitted(wrapper)).toBe(1.01)
  })

  it('part de 0 (ou emptyValue) quand la valeur est vide', async () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: null, steppers: true, step: 0.01 },
    })
    const [, plus] = wrapper.findAll('button')
    await plus.trigger('click')
    expect(lastEmitted(wrapper)).toBe(0.01)
  })
})

describe('NumberField — attributs transmis', () => {
  it('class va à l’input, style au wrapper', () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 1 },
      attrs: { class: 'form-control', style: 'width: 70px' },
    })
    expect(wrapper.find('input').classes()).toContain('form-control')
    expect(wrapper.find('.number-field').attributes('style')).toContain('width: 70px')
  })
})
