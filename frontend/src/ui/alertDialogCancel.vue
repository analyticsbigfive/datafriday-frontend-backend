<!-- AlertDialogCancel.vue -->
<template>
  <UiButton
    data-slot="alert-dialog-cancel"
    variant="outline"
    v-bind="$attrs"
    @click="onClick"
  >
    <slot />
  </UiButton>
</template>

<script>
import UiButton from './button.vue'

export default {
  name: 'AlertDialogCancel',
  components: { UiButton },
  inject: ['alertDialog'],

  methods: {
    onClick(event) {
      this.$emit('click', event)
      this.alertDialog && this.alertDialog.setOpen(false)
    },
  },
}
</script>