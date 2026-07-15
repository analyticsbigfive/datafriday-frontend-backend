<!-- dialogTrigger.vue -->
<template>
  <button
    type="button"
    data-slot="dialog-trigger"
    v-bind="$attrs"
    @click="toggle"
  >
    <slot />
  </button>
</template>

<script>
export default {
  name: 'DialogTrigger',
  inject: ['dialogContext'],
  methods: {
    toggle(e) {
      this.$emit('click', e)
      const api = this.dialogContext
      if (api && api.setOpen && api.getOpen) {
        api.setOpen(!api.getOpen())
      }
    },
  },
}
</script>