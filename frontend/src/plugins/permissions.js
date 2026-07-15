import store from '@/store'

function evaluate(binding) {
  const codes = Array.isArray(binding.value) ? binding.value : [binding.value]
  const can = store.getters['auth/can']
  return binding.modifiers.all ? codes.every(can) : codes.some(can)
}

export const canDirective = {
  mounted(el, binding) {
    if (!evaluate(binding)) {
      el.style.display = 'none'
      el.setAttribute('data-can-hidden', 'true')
    }
  },
  updated(el, binding) {
    const allowed = evaluate(binding)
    el.style.display = allowed ? '' : 'none'
  },
}
