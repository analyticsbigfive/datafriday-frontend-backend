<template>
  <tr
    data-slot="table-row"
    class="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors"
  >
    <slot />
  </tr>
</template>

<script>
export default {
  name: 'TableRow',
}
</script>