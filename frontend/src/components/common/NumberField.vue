<template>
  <div class="number-field" :class="{ 'number-field--disabled': disabled }" :style="wrapperStyle">
    <button
      v-if="steppers"
      type="button"
      class="number-field__btn"
      tabindex="-1"
      :aria-label="t('numberFieldDecrease')"
      :disabled="disabled || atMin"
      @click="stepDown"
    >
      −
    </button>
    <input
      ref="inputEl"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      class="number-field__input"
      v-bind="inputAttrs"
      :value="display"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <button
      v-if="steppers"
      type="button"
      class="number-field__btn"
      tabindex="-1"
      :aria-label="t('numberFieldIncrease')"
      :disabled="disabled || atMax"
      @click="stepUp"
    >
      +
    </button>
  </div>
</template>

<script>
/**
 * NumberField — champ numérique commun, locale-aware.
 *
 * - Accepte la virgule ET le point à la frappe (type="text" + inputmode="decimal",
 *   jamais type="number" qui vide silencieusement "2,50" en locale fr).
 * - Affiche selon la langue de l'app : fr → "12,50", en → "12.50".
 * - Boutons +/− optionnels (`steppers`) au pas de `step` (0.01 par défaut pour
 *   les prix), en préservant les décimales déjà saisies (2,55 + 1 → 3,55).
 * - Émet toujours un `number` JS (point décimal) — jamais de virgule vers l'API.
 *
 * Remplace les <input type="number"> monétaires et src/ui/numericInput.vue.
 */
import { computed, ref, useAttrs, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useNumberFormat } from '@/composables/useNumberFormat'
import { clampNumber, parseLocaleNumber, roundTo, stepBy } from '@/utils/number'

export default {
  name: 'NumberField',

  inheritAttrs: false,

  props: {
    modelValue: { type: [Number, String], default: null },
    /** Nombre de décimales conservées (arrondi au blur et après chaque pas). */
    decimals: { type: Number, default: 2 },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    /** Pas des boutons +/− et des flèches clavier. */
    step: { type: Number, default: 0.01 },
    /** Affiche les boutons +/−. */
    steppers: { type: Boolean, default: false },
    /** Force les zéros de fin à l'affichage ("12,50" plutôt que "12,5"). */
    pad: { type: Boolean, default: false },
    /** Valeur émise quand le champ est vidé (null par défaut). */
    emptyValue: { type: [Number, Object], default: null },
    placeholder: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
  },

  emits: ['update:modelValue', 'change'],

  setup(props, { emit }) {
    const { t } = useI18n()
    const { intlLocale, formatDecimal } = useNumberFormat()
    const attrs = useAttrs()

    // `style` (souvent une largeur) s'applique au wrapper — sinon le wrapper
    // garde son width:100% et un champ inline "width:70px" casse la mise en page.
    // Tout le reste (class, id, aria…) va à l'<input> interne.
    const wrapperStyle = computed(() => attrs.style)
    const inputAttrs = computed(() => {
      const { style: _style, ...rest } = attrs
      return rest
    })

    const inputEl = ref(null)
    const focused = ref(false)
    const display = ref('')

    const modelNumber = computed(() => {
      const n = parseLocaleNumber(props.modelValue)
      return n == null ? null : n
    })

    const decimalSep = computed(() => (intlLocale.value === 'fr-FR' ? ',' : '.'))

    // Représentation éditable (pas de séparateur de milliers, séparateur
    // décimal de la langue) — utilisée pendant la frappe.
    const toEditable = (n) => {
      if (n == null) return ''
      return String(roundTo(n, props.decimals)).replace('.', decimalSep.value)
    }

    const toDisplay = (n) => {
      if (n == null) return ''
      return formatDecimal(roundTo(n, props.decimals), props.decimals, { pad: props.pad })
    }

    const refreshDisplay = () => {
      display.value = focused.value
        ? toEditable(modelNumber.value)
        : toDisplay(modelNumber.value)
    }
    refreshDisplay()

    watch([modelNumber, intlLocale, () => props.decimals, () => props.pad], () => {
      if (!focused.value) refreshDisplay()
    })

    const atMin = computed(
      () => props.min != null && modelNumber.value != null && modelNumber.value <= props.min
    )
    const atMax = computed(
      () => props.max != null && modelNumber.value != null && modelNumber.value >= props.max
    )

    const commit = (n) => {
      let out
      if (n == null) {
        out = props.emptyValue
      } else {
        out = roundTo(clampNumber(n, props.min, props.max), props.decimals)
      }
      emit('update:modelValue', out)
      emit('change', out)
      return out
    }

    const onInput = (event) => {
      const raw = event.target.value
      // Chiffres + un seul séparateur (virgule ou point) + signe ; sinon on
      // rejette le caractère (même approche que ComponentCreateView).
      if (/^-?\d*[.,]?\d*$/.test(raw)) {
        display.value = raw
      } else {
        event.target.value = display.value
      }
    }

    const onFocus = () => {
      focused.value = true
      display.value = toEditable(modelNumber.value)
    }

    const onBlur = () => {
      focused.value = false
      const parsed = parseLocaleNumber(display.value)
      const out = commit(parsed)
      display.value = toDisplay(typeof out === 'number' ? out : null)
    }

    const applyStep = (direction) => {
      const current = focused.value ? parseLocaleNumber(display.value) : modelNumber.value
      const base = current != null ? current : typeof props.emptyValue === 'number' ? props.emptyValue : 0
      const next = clampNumber(stepBy(base, direction * props.step, props.decimals), props.min, props.max)
      commit(next)
      display.value = focused.value ? toEditable(next) : toDisplay(next)
    }

    const stepUp = () => applyStep(1)
    const stepDown = () => applyStep(-1)

    const onKeydown = (event) => {
      if (event.key === 'Enter') {
        event.currentTarget.blur()
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        applyStep(1)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        applyStep(-1)
      }
    }

    return {
      t,
      inputEl,
      display,
      wrapperStyle,
      inputAttrs,
      atMin,
      atMax,
      onInput,
      onFocus,
      onBlur,
      onKeydown,
      stepUp,
      stepDown,
    }
  },
}
</script>

<style scoped>
.number-field {
  display: inline-flex;
  align-items: stretch;
  gap: 4px;
  width: 100%;
}

.number-field__input {
  flex: 1;
  min-width: 0;
  font: inherit;
  color: inherit;
}

.number-field__btn {
  flex: 0 0 auto;
  width: 28px;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1;
  cursor: pointer;
}

.number-field__btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.number-field--disabled {
  opacity: 0.7;
}
</style>
