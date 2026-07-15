<template>
  <caption
    data-slot="table-caption"
    class="text-muted-foreground mt-4 text-sm"
  >
    <slot />
  </caption>
</template>

<script>
export default {
  name: 'TableCaption',
}
</script>