// Effet discret « valeur qui vient de changer » : surbrillance courte (600 ms max)
// sur l'élément dont la valeur liée change. Aucune animation au premier rendu,
// seulement quand la valeur est mise à jour. Respecte prefers-reduced-motion.
//
// Usage : directives: { valuePulse: vValuePulse } puis <strong v-value-pulse="valeur">.

export const PULSE_DURATION_MS = 600
const PULSE_COLOR = 'rgba(255, 49, 49, 0.18)'

/** Vrai si la valeur a réellement changé (comparaison stricte, NaN égal à NaN). */
export function hasValueChanged(value, oldValue) {
  if (typeof value === 'number' && typeof oldValue === 'number' && Number.isNaN(value) && Number.isNaN(oldValue)) {
    return false
  }
  return value !== oldValue
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return !!window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Joue la surbrillance sur l'élément (sans effet si animations indisponibles). */
export function pulseElement(el, duration = PULSE_DURATION_MS) {
  if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return false
  el.animate([{ backgroundColor: PULSE_COLOR }, { backgroundColor: 'rgba(255, 49, 49, 0)' }], {
    duration: Math.min(duration, PULSE_DURATION_MS),
    easing: 'ease-out',
  })
  return true
}

/** Directive : `updated` ne se déclenche jamais au premier rendu. */
export const vValuePulse = {
  updated(el, binding) {
    if (hasValueChanged(binding.value, binding.oldValue)) pulseElement(el)
  },
}

export function useValuePulse() {
  return { vValuePulse }
}
