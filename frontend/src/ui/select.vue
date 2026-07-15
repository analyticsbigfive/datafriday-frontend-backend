<template>
  <div data-slot="select">
    <slot />
  </div>
</template>

<script>
export default {
  name: 'Select',

  props: {
    modelValue: {
      type: String,
      default: null,
    },
    value: {
      type: String,
      default: null,
    },
    // pour coller à l’API React: <Select value={} onValueChange={} >
    onValueChange: {
      type: Function,
      default: null,
    },
  },

  data() {
    return {
      internalValue: this.value ?? this.modelValue,
      open: false,
      selectedLabel: null,
    }
  },

  computed: {
    currentValue() {
      return this.value != null ? this.value : this.internalValue
    },
  },

  watch: {
    value(val) {
      this.internalValue = val
    },
    modelValue(val) {
      if (this.value == null) {
        this.internalValue = val
      }
    },
  },

  provide() {
    return {
      selectContext: {
        getOpen: () => this.open,
        setOpen: this.setOpen,
        getValue: () => this.currentValue,
        getLabel: () => this.selectedLabel,
        setValue: this.setValue,
      },
    }
  },

  methods: {
    setOpen(val) {
      this.open = val
    },

    setValue(value, label) {
      this.internalValue = value
      this.selectedLabel = label

      this.$emit('update:model-value', value)
      this.$emit('update:value', value)
      this.onValueChange && this.onValueChange(value)
    },
  },
}
</script>