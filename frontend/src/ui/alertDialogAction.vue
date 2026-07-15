<!-- AlertDialogAction.vue -->
<template>
  <UiButton
    data-slot="alert-dialog-action"
    variant="destructive"
    v-bind="$attrs"
    @click="onClick"
  >
    <slot />
  </UiButton>
</template>

<script>
import UiButton from './button.vue'

export default {
  name: 'AlertDialogAction',
  components: { UiButton },
  inject: ['alertDialog'],

  methods: {
    onClick(event) {
      this.$emit('click', event)
      // on laisse le parent décider de fermer ou non après l’action
    },
  },
}
</script>