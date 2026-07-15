<!-- AlertDialogFooter.vue -->
<template>
  <div
    data-slot="alert-dialog-footer"
    class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2"
  >
    <slot />
  </div>
</template>

<script>
export default { name: 'AlertDialogFooter' }
</script>