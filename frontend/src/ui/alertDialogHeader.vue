<!-- AlertDialogHeader.vue -->
<template>
  <div
    data-slot="alert-dialog-header"
    class="flex flex-col gap-2 mb-4"
  >
    <slot />
  </div>
</template>

<script>
export default { name: 'AlertDialogHeader' }
</script>