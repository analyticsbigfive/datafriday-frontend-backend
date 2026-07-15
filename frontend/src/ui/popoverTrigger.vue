<template>
  <button
    data-slot="popover-trigger"
    type="button"
    ref="btn"
    @click="onClick"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>

<script>
export default {
  name: 'PopoverTrigger',
  inject: ['popover'],

  mounted() {
    if (this.popover) {
      this.popover.setTriggerEl(this.$refs.btn)
    }
  },

  beforeUnmount() {
    if (this.popover && this.popover.triggerEl === this.$refs.btn) {
      this.popover.setTriggerEl(null)
    }
  },

  methods: {
    onClick(e) {
      // laisse aussi les listeners externes fonctionner
      this.$emit?.('click', e)
      if (!this.popover) return
      this.popover.toggle()
    },
  },
}
</script>