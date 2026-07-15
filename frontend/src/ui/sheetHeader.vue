<!-- SheetHeader.vue -->
<template>
  <div
    data-slot="sheet-header"
    class="flex flex-col gap-1.5 p-4"
  >
    <slot />
  </div>
</template>

<script>
export default { name: 'SheetHeader' }
</script>