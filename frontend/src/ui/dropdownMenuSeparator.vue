<template>
  <div
    data-slot="dropdown-menu-separator"
    class="bg-border -mx-1 my-1 h-px"
    v-bind="$attrs"
  />
</template>

<script>
export default {
  name: 'DropdownMenuSeparator',
}
</script>