<template>
  <span data-slot="popover-anchor" ref="anchor">
    <slot />
  </span>
</template>

<script>
export default {
  name: 'PopoverAnchor',
  inject: ['popover'],

  mounted() {
    if (this.popover) {
      this.popover.setAnchorEl(this.$refs.anchor)
    }
  },

  beforeUnmount() {
    if (this.popover && this.popover.anchorEl === this.$refs.anchor) {
      this.popover.setAnchorEl(null)
    }
  },
}
</script>