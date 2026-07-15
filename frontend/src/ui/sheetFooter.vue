<!-- SheetFooter.vue -->
<template>
  <div
    data-slot="sheet-footer"
    class="mt-auto flex flex-col gap-2 p-4"
  >
    <slot />
  </div>
</template>

<script>
export default { name: 'SheetFooter' }
</script>