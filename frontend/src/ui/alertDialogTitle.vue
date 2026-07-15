<!-- AlertDialogTitle.vue -->
<template>
  <h2
    data-slot="alert-dialog-title"
    class="text-lg font-semibold"
  >
    <slot />
  </h2>
</template>

<script>
export default { name: 'AlertDialogTitle' }
</script>