<template>
  <Input
    type="text"
    inputmode="decimal"
    :value="displayValue"
    @input="handleInput"
    @blur="handleBlur"
    @focus="handleFocus"
    @keydown="handleKeyDown"
    :class="className"
    :placeholder="placeholder"
    :disabled="disabled"
  />
</template>

<script>
import Input from './input.vue'

export default {
  name: 'NumericInput',

  components: {
    Input,
  },

  // IMPORTANT: prevents Vue from forwarding @change to the root <Input> as a native DOM listener
  // and enables proper v-model support.
  emits: ['change', 'update:modelValue'],

  props: {
    // v-model support
    modelValue: {
      type: Number,
      default: undefined,
    },

    // backward compatibility with :value="..."
    value: {
      type: Number,
      default: undefined,
    },

    decimals: {
      type: Number,
      default: 3,
    },
    min: {
      type: Number,
      default: 0.001,
    },
    max: Number,
    step: {
      type: Number,
      default: 0.001,
    },
    className: String,
    placeholder: String,
    disabled: {
      type: Boolean,
      default: false,
    },
  },

  data() {
    const externalValue =
      this.modelValue !== undefined ? this.modelValue : this.value !== undefined ? this.value : 0

    return {
      displayValue: Number(externalValue).toFixed(this.decimals),
      isFocused: false,
    }
  },

  watch: {
    modelValue(newValue) {
      if (!this.isFocused && newValue !== undefined) {
        this.displayValue = Number(newValue).toFixed(this.decimals)
      }
    },
    value(newValue) {
      if (!this.isFocused && this.modelValue === undefined && newValue !== undefined) {
        this.displayValue = Number(newValue).toFixed(this.decimals)
      }
    },
    decimals(newDecimals) {
      if (!this.isFocused) {
        const externalValue =
          this.modelValue !== undefined ? this.modelValue : this.value !== undefined ? this.value : 0
        this.displayValue = Number(externalValue).toFixed(newDecimals)
      }
    },
  },

  methods: {
    handleInput(event) {
      this.displayValue = event.target.value
    },

    handleBlur() {
      this.isFocused = false

      const normalizedValue = String(this.displayValue).replace(/,/g, '.')
      const parsedValue = parseFloat(normalizedValue)

      let finalValue

      if (isNaN(parsedValue) || parsedValue < this.min) {
        finalValue = this.min
      } else if (this.max !== undefined && parsedValue > this.max) {
        finalValue = this.max
      } else {
        finalValue = parsedValue
      }

      this.displayValue = Number(finalValue).toFixed(this.decimals)

      // v-model
      this.$emit('update:modelValue', finalValue)
      // compatibility with your current @change handlers
      this.$emit('change', finalValue)
    },

    handleFocus() {
      this.isFocused = true
    },

    handleKeyDown(event) {
      if (event.key === 'Enter') {
        event.currentTarget.blur()
      }
    },
  },
}
</script>