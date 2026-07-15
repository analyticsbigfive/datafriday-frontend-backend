<template>
  <div
    data-slot="tabs"
    class="flex flex-col gap-2"
    :class="className"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'Tabs',

  props: {
    value: {
      type: String,
      default: undefined, // mode contrôlé si défini
    },
    defaultValue: {
      type: String,
      default: null,
    },
    onValueChange: {
      type: Function,
      default: null,
    },
    className: {
      type: String,
      default: '',
    },
  },

  data() {
    return {
      internalValue:
        this.value !== undefined ? this.value : this.defaultValue,
    }
  },

  computed: {
    isControlled() {
      return this.value !== undefined
    },
    currentValue() {
      return this.isControlled ? this.value : this.internalValue
    },
  },

  watch: {
    value(newVal) {
      if (newVal !== undefined) {
        this.internalValue = newVal
      }
    },
  },

  provide() {
    // Expose le contexte aux TabsList / TabsTrigger / TabsContent
    return {
      tabsContext: {
        getValue: () => this.currentValue,
        setValue: this.setValue,
      },
    }
  },

  methods: {
    setValue(newValue) {
      if (!this.isControlled) {
        this.internalValue = newValue
      }
      if (this.onValueChange) {
        this.onValueChange(newValue)
      }
      this.$emit('update:value', newValue)
    },
  },
}
</script>