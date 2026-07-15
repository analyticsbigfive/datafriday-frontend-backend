<!-- AlertDialogDescription.vue -->
<template>
  <p
    data-slot="alert-dialog-description"
    class="text-sm text-muted-foreground"
  >
    <slot />
  </p>
</template>

<script>
export default { name: 'AlertDialogDescription' }
</script>