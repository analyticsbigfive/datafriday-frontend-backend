<template>
  <p
    data-slot="dialog-description"
    class="text-muted-foreground text-sm"
    v-bind="$attrs"
  >
    <slot />
  </p>
</template>

<script>
export default {
  name: 'DialogDescription',
}
</script>