<template>
  <h2
    data-slot="dialog-title"
    class="text-lg leading-none font-semibold"
    v-bind="$attrs"
  >
    <slot />
  </h2>
</template>

<script>
export default {
  name: 'DialogTitle',
}
</script>