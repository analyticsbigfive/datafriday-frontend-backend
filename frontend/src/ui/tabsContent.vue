<template>
  <div
    v-show="isActive"
    data-slot="tabs-content"
    class="flex-1 outline-none"
    :class="className"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'TabsContent',

  inject: {
    tabsContext: {
      from: 'tabsContext',
      default: null,
    },
  },

  props: {
    value: {
      type: String,
      required: true,
    },
    className: {
      type: String,
      default: '',
    },
  },

  computed: {
    isActive() {
      if (!this.tabsContext) return false
      return this.tabsContext.getValue() === this.value
    },
  },
}
</script>