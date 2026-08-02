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

  it('pas de séparateur de milliers par défaut (quantité en ligne, ex. "of 1003 Pc")', () => {
    setAppLocale('fr')
    const wrapper = mount(NumberField, { props: { modelValue: 1234.5 } })
    expect(wrapper.find('input').element.value).toBe('1234,5')
  })

  it('grouping="true" active le séparateur de milliers hors focus (champs prix), valeur brute éditable au focus', async () => {
    setAppLocale('fr')
    const wrapper = mount(NumberField, { props: { modelValue: 1234.5, grouping: true } })
    const input = wrapper.find('input')
    expect(flat(input.element.value)).toBe('1 234,5')
    await input.trigger('focus')
    expect(input.element.value).toBe('1234,5')
  })
})

describe('NumberField — aucun bouton +/− : champ de saisie pur', () => {
  it('ne rend aucun bouton, quelles que soient les props', () => {
    const wrapper = mount(NumberField, { props: { modelValue: 1, min: 0, max: 100 } })
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('la racine du composant est directement l’input (pas de wrapper superflu)', () => {
    const wrapper = mount(NumberField, { props: { modelValue: 1 } })
    expect(wrapper.element.tagName).toBe('INPUT')
  })
})

describe('NumberField — flèches clavier ↑/↓, pas = 10^-decimals par défaut', () => {
  it('2 décimales → pas de 0,01 (pas un +1 arbitraire)', async () => {
    const wrapper = mount(NumberField, { props: { modelValue: 2.5, decimals: 2 } })
    await wrapper.find('input').trigger('keydown', { key: 'ArrowUp' })
    expect(lastEmitted(wrapper)).toBe(2.51)
  })

  it('entier (decimals=0) → pas de 1', async () => {
    const wrapper = mount(NumberField, { props: { modelValue: 5, decimals: 0 } })
    await wrapper.find('input').trigger('keydown', { key: 'ArrowUp' })
    expect(lastEmitted(wrapper)).toBe(6)
  })

  it('ArrowDown décrémente du même pas', async () => {
    const wrapper = mount(NumberField, { props: { modelValue: 2.5, decimals: 2, min: 0 } })
    await wrapper.find('input').trigger('keydown', { key: 'ArrowDown' })
    expect(lastEmitted(wrapper)).toBe(2.49)
  })

  it('un `step` explicite prime sur le calcul automatique (pas métier, ex. palier de 10)', async () => {
    const wrapper = mount(NumberField, { props: { modelValue: 2.55, decimals: 2, step: 1 } })
    await wrapper.find('input').trigger('keydown', { key: 'ArrowUp' })
    // 2,55 + 1 → 3,55 : on ajoute 1 à la valeur, la partie décimale n'est pas touchée
    expect(lastEmitted(wrapper)).toBe(3.55)
  })

  it('clampe sur min/max', async () => {
    const wrapper = mount(NumberField, { props: { modelValue: 100, decimals: 0, max: 100 } })
    await wrapper.find('input').trigger('keydown', { key: 'ArrowUp' })
    expect(lastEmitted(wrapper)).toBe(100)
  })

  it('part de 0 (ou emptyValue) quand la valeur est vide', async () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: null, decimals: 2, emptyValue: 0 },
    })
    await wrapper.find('input').trigger('keydown', { key: 'ArrowUp' })
    expect(lastEmitted(wrapper)).toBe(0.01)
  })
})

describe('NumberField — attributs transmis', () => {
  it('class et style vont tous les deux à l’input (pas de wrapper séparé)', () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 1 },
      attrs: { class: 'form-control', style: 'width: 70px' },
    })
    const input = wrapper.find('input')
    expect(input.classes()).toContain('form-control')
    expect(input.attributes('style')).toContain('width: 70px')
  })
})

describe('NumberField — style par défaut (bordure) quand personne ne stylise le champ', () => {
  it('sans classe fournie par l’appelant : la classe --bare (bordure) s’applique', () => {
    const wrapper = mount(NumberField, { props: { modelValue: 1 } })
    expect(wrapper.find('input').classes()).toContain('number-field__input--bare')
  })

  it('avec une classe fournie par l’appelant : --bare ne s’applique plus (l’appelant reprend la main)', () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 1 },
      attrs: { class: 'mic-qty-input' },
    })
    const classes = wrapper.find('input').classes()
    expect(classes).toContain('mic-qty-input')
    expect(classes).not.toContain('number-field__input--bare')
  })
})

describe('NumberField — largeur naturelle (ch, pas de px absolus)', () => {
  const inputStyle = (wrapper) => wrapper.find('input').attributes('style')

  it('sans classe ni style : une largeur en "ch" est posée sur l’input (repli 4 chiffres entiers)', () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 1, decimals: 2, min: 0 },
    })
    // 4 (repli) + 3 (2 décimales + séparateur) + 0 (pas de signe, min >= 0) + 2 (confort) = 9ch
    expect(inputStyle(wrapper)).toContain('max-width: 9ch')
  })

  it('avec `max` fourni : les chiffres entiers dérivent de `max`, pas du repli', () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 1, decimals: 0, min: 0, max: 100 },
    })
    // 3 (chiffres de 100) + 0 (decimals=0) + 0 (pas de signe) + 2 (confort) = 5ch
    expect(inputStyle(wrapper)).toContain('max-width: 5ch')
  })

  it('min négatif ou absent : un caractère de signe est réservé', () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 1, decimals: 0, max: 100 },
    })
    // 3 (chiffres) + 0 + 1 (signe, min non fourni) + 2 (confort) = 6ch
    expect(inputStyle(wrapper)).toContain('max-width: 6ch')
  })

  it('avec une classe fournie (déjà stylisée ailleurs) : pas de largeur imposée', () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 1 },
      attrs: { class: 'mic-qty-input' },
    })
    expect(inputStyle(wrapper) || '').not.toContain('max-width')
  })

  it('un style explicite reste prioritaire sur la largeur calculée', () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 1 },
      attrs: { style: 'width: 70px' },
    })
    expect(inputStyle(wrapper)).toContain('width: 70px')
    expect(inputStyle(wrapper) || '').not.toContain('max-width')
  })
})
