<template>
  <component
    :is="asChild ? 'span' : 'button'"
    :type="asChild ? undefined : 'button'"
    data-slot="dropdown-menu-trigger"
    v-bind="$attrs"
    @click="handleClick"
  >
    <slot />
  </component>
</template>

<script>
export default {
  name: 'DropdownMenuTrigger',
  inheritAttrs: false,

  props: {
    asChild: { type: Boolean, default: false },
  },

  inject: ['dropdownMenu'],

  mounted() {
    const api = this.dropdownMenu
    if (api && api.setTriggerEl) {
      api.setTriggerEl(this.$el)
    }
  },

  methods: {
    handleClick(event) {
      this.$emit('click', event)
      const api = this.dropdownMenu
      if (api && api.setOpen) {
        api.setOpen(!api.getOpen())
      }
    },
  },
}
</script>