<template>
  <input
    ref="inputEl"
    type="text"
    inputmode="decimal"
    autocomplete="off"
    class="number-field__input"
    :class="{ 'number-field__input--bare': !hasCustomClass, 'number-field--disabled': disabled }"
    :style="wrapperStyle"
    v-bind="inputAttrs"
    :value="display"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="onInput"
    @focus="onFocus"
    @blur="onBlur"
    @keydown="onKeydown"
  />
</template>

<script>
/**
 * NumberField — champ numérique commun, locale-aware.
 *
 * - Accepte la virgule ET le point à la frappe (type="text" + inputmode="decimal",
 *   jamais type="number" qui vide silencieusement "2,50" en locale fr).
 * - Affiche selon la langue de l'app : fr → "12,50", en → "12.50".
 * - Aucun bouton +/− visible : simple champ de saisie. Les flèches clavier
 *   ↑/↓ incrémentent/décrémentent au pas `step` (par défaut 10^-decimals —
 *   0,01 pour 2 décimales, 1 pour un entier), en préservant les décimales
 *   déjà saisies (2,55 + 1 → 3,55 : on ajoute 1 à la valeur, pas à la partie
 *   entière seule).
 * - Émet toujours un `number` JS (point décimal) — jamais de virgule vers l'API.
 *
 * Remplace les <input type="number"> monétaires et src/ui/numericInput.vue.
 */
import { computed, ref, useAttrs, watch } from 'vue'
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
    /**
     * Pas des flèches clavier ↑/↓. Par défaut 10^-decimals (0,01 pour 2
     * décimales, 1 pour un entier) — cohérent avec la précision affichée,
     * pas un +1/-1 arbitraire. Ne fournir explicitement que pour un pas
     * métier différent (ex. un objectif qui avance par paliers de 10).
     */
    step: { type: Number, default: null },
    /** Force les zéros de fin à l'affichage ("12,50" plutôt que "12,5"). */
    pad: { type: Boolean, default: false },
    /**
     * Séparateur de milliers au repos (12 345 / 12,345). Faux par défaut : la
     * plupart des usages sont des quantités techniques affichées en ligne
     * (« of 1003 Pc ») où le regroupement surprend plus qu'il n'aide. Activer
     * explicitement sur les champs prix/montant (grands nombres lus isolément).
     */
    grouping: { type: Boolean, default: false },
    /** Valeur émise quand le champ est vidé (null par défaut). */
    emptyValue: { type: [Number, Object], default: null },
    placeholder: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
  },

  emits: ['update:modelValue', 'change'],

  setup(props, { emit }) {
    const { intlLocale, formatDecimal } = useNumberFormat()
    const attrs = useAttrs()

    // Pas effectif : celui fourni explicitement, sinon 10^-decimals (0,01
    // pour 2 décimales, 1 pour un entier) — jamais un +1 arbitraire qui
    // ignorerait la précision affichée.
    const effectiveStep = computed(() =>
      props.step != null ? props.step : Math.pow(10, -props.decimals)
    )

    const inputAttrs = computed(() => {
      const { style: _style, ...rest } = attrs
      return rest
    })

    // Style par défaut appliqué UNIQUEMENT si l'appelant ne fournit aucune
    // classe (donc aucune bordure/fond à lui) — décidé en JS, pas par
    // spécificité CSS : `:where()` pour neutraliser une classe consommateur
    // s'est révélé peu fiable avec le compilateur scoped de ce projet (la
    // règle ne s'appliquait tout simplement pas). Ici, zéro ambiguïté
    // possible : soit l'appelant stylise lui-même l'input (sa classe est
    // seule), soit personne ne l'a fait et NumberField prend le relais.
    const hasCustomClass = computed(() => !!attrs.class)

    // Largeur naturelle en `ch` (largeur de caractère "0"), pas en px absolus :
    // strictement ce qu'il faut pour afficher la plus grande valeur possible.
    // Chiffres entiers dérivés de `max` si fourni, sinon repli à 4 (quantité
    // courante) ; +1 pour le séparateur décimal si `decimals` > 0 ; +1 pour le
    // signe si une valeur négative est possible ; +2 de confort de frappe.
    const naturalWidth = computed(() => {
      const intDigits =
        props.max != null && Number.isFinite(props.max)
          ? Math.max(1, String(Math.floor(Math.abs(props.max))).length)
          : 4
      const decimalChars = props.decimals > 0 ? props.decimals + 1 : 0
      const signChar = props.min == null || props.min < 0 ? 1 : 0
      const chars = intDigits + decimalChars + signChar + 2
      return `${chars}ch`
    })

    // `style` explicite de l'appelant = priorité absolue (comportement inchangé).
    // Sans classe NI style : NumberField choisit lui-même une largeur au
    // strict nécessaire plutôt que de s'étirer sur 100% du conteneur.
    // Avec une classe (déjà stylisée par ailleurs) mais sans style : on ne
    // touche à rien, la classe de l'appelant gère sa propre largeur.
    const isBare = computed(() => !hasCustomClass.value && attrs.style == null)
    const wrapperStyle = computed(() => {
      if (attrs.style != null) return attrs.style
      if (isBare.value) return { maxWidth: naturalWidth.value }
      return undefined
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
      return formatDecimal(roundTo(n, props.decimals), props.decimals, {
        pad: props.pad,
        grouping: props.grouping,
      })
    }

    const refreshDisplay = () => {
      display.value = focused.value
        ? toEditable(modelNumber.value)
        : toDisplay(modelNumber.value)
    }
    refreshDisplay()

    watch(
      [modelNumber, intlLocale, () => props.decimals, () => props.pad, () => props.grouping],
      () => {
        if (!focused.value) refreshDisplay()
      }
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
      const next = clampNumber(
        stepBy(base, direction * effectiveStep.value, props.decimals),
        props.min,
        props.max
      )
      commit(next)
      display.value = focused.value ? toEditable(next) : toDisplay(next)
    }

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
      inputEl,
      display,
      wrapperStyle,
      inputAttrs,
      hasCustomClass,
      onInput,
      onFocus,
      onBlur,
      onKeydown,
    }
  },
}
</script>

<style scoped>
.number-field__input {
  font: inherit;
  color: inherit;
  width: 100%;
}

/*
 * Apparence par défaut — seulement quand l'appelant ne fournit AUCUNE classe
 * (`hasCustomClass` en JS, cf. script). Une vraie classe, spécificité
 * normale : ne dépend d'aucun ordre de chargement ni astuce de sélecteur.
 */
.number-field__input--bare {
  padding: 6px 10px;
  border: 1.5px solid #9ca3af;
  border-radius: 8px;
  background: #fff;
  text-align: center;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.number-field__input--bare:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
  outline: none;
}

.number-field__input--bare:disabled {
  background: #f3f4f6;
  cursor: not-allowed;
}

@media (prefers-color-scheme: dark) {
  .number-field__input--bare {
    border-color: rgba(255, 255, 255, 0.3);
    background: #1e293b;
    color: #f1f5f9;
  }
  .number-field__input--bare:disabled {
    background: #111827;
  }
}

.number-field--disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
