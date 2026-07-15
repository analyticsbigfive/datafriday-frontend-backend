<template>
  <span
    data-slot="tooltip-trigger"
    class="inline-flex"
    v-bind="$attrs"
    @mouseenter="show"
    @mouseleave="hide"
    @focus="show"
    @blur="hide"
  >
    <slot />
  </span>
</template>

<script>
export default {
  name: 'TooltipTrigger',
  inject: ['tooltipContext'],
  props: {
    asChild: {
      type: Boolean,
      default: false,
    },
  },
  methods: {
    show(e) {
      this.$emit('mouseenter', e)
      this.tooltipContext && this.tooltipContext.setOpen(true)
    },
    hide(e) {
      this.$emit('mouseleave', e)
      this.tooltipContext && this.tooltipContext.setOpen(false)
    },
  },
}
</script>