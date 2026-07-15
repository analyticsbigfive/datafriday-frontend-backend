<!-- SheetTitle.vue -->
<template>
  <h2
    data-slot="sheet-title"
    class="text-foreground font-semibold"
  >
    <slot />
  </h2>
</template>

<script>
export default { name: 'SheetTitle' }
</script>