<!-- dialogClose.vue -->
<template>
  <button
    type="button"
    data-slot="dialog-close"
    v-bind="$attrs"
    @click="close"
  >
    <slot />
  </button>
</template>

<script>
export default {
  name: 'DialogClose',
  inject: ['dialogContext'],
  methods: {
    close(e) {
      this.$emit('click', e)
      const api = this.dialogContext
      api && api.setOpen && api.setOpen(false)
    },
  },
}
</script>