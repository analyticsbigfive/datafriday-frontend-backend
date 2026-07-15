<template>
  <div
    data-slot="dropdown-menu-label"
    :data-inset="inset || null"
    class="px-2 py-1.5 text-sm font-medium"
    :class="{ 'pl-8': inset }"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'DropdownMenuLabel',

  props: {
    inset: {
      type: Boolean,
      default: false,
    },
  },
}
</script>