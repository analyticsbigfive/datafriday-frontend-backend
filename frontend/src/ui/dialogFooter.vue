<template>
  <div
    data-slot="dialog-footer"
    class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'DialogFooter',
}
</script>