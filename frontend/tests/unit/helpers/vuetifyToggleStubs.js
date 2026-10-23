// Doublures minimales de v-btn-toggle / v-btn pour les tests sans plugin Vuetify : le groupe émet
// update:modelValue, chaque bouton expose aria-pressed selon la valeur courante.
import { h, inject, provide } from 'vue'

export const VBtnToggleStub = {
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { slots, emit }) {
    provide('btnToggleStub', {
      isOn: (value) => props.modelValue === value,
      pick: (value) => value !== props.modelValue && emit('update:modelValue', value),
    })
    return () => h('div', slots.default && slots.default())
  },
}

export const VBtnStub = {
  props: { value: { type: String, default: '' } },
  setup(props, { slots }) {
    const group = inject('btnToggleStub')
    return () =>
      h(
        'button',
        { type: 'button', 'aria-pressed': String(group.isOn(props.value)), onClick: () => group.pick(props.value) },
        slots.default && slots.default(),
      )
  },
}

export const vuetifyToggleStubs = { 'v-btn-toggle': VBtnToggleStub, 'v-btn': VBtnStub }
