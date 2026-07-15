<template>
  <tfoot
    data-slot="table-footer"
    class="bg-muted/50 border-t font-medium [&>tr]:last:border-b-0"
  >
    <slot />
  </tfoot>
</template>

<script>
export default {
  name: 'TableFooter',
}
</script>