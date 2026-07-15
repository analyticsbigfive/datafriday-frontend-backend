<template>
  <div
    v-show="collapsible ? collapsible.isOpen() : false"
    data-slot="collapsible-content"
    :data-state="collapsible && collapsible.isOpen() ? 'open' : 'closed'"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'CollapsibleContent',

  inject: {
    collapsible: {
      from: 'collapsible',
      default: null,
    },
  },
}
</script>