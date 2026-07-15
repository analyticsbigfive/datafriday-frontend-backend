<!-- SheetDescription.vue -->
<template>
  <p
    data-slot="sheet-description"
    class="text-muted-foreground text-sm"
  >
    <slot />
  </p>
</template>

<script>
export default { name: 'SheetDescription' }
</script>