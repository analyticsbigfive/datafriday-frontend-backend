<template>
  <div
    data-slot="dialog-header"
    class="flex flex-col gap-2 text-center sm:text-left"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'DialogHeader',
}
</script>