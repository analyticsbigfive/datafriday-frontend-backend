<template>
  <div
    data-slot="table-container"
    class="relative w-full overflow-x-auto"
  >
    <table
      data-slot="table"
      class="w-full caption-bottom text-sm"
    >
      <slot />
    </table>
  </div>
</template>

<script>
export default {
  name: 'Table',
}
</script>