<template>
  <button
    type="button"
    data-slot="collapsible-trigger"
    v-bind="$attrs"
    :data-state="collapsible && collapsible.isOpen() ? 'open' : 'closed'"
    :disabled="disabled || (collapsible && collapsible.disabled && collapsible.disabled())"
    @click="onClick"
  >
    <slot />
  </button>
</template>
<script>
export default {
  name: 'CollapsibleTrigger',
  inheritAttrs: false,
  emits: ['click'],
  inject: {
    collapsible: {
      from: 'collapsible',
      default: null,
    },
  },
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  methods: {
    onClick(event) {
      this.$emit('click', event)
      if (this.disabled || !this.collapsible) return
      this.collapsible.toggle()
    },
  },
}
</script>