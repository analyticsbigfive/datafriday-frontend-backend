<template>
  <div
    v-if="isOpen"
    data-slot="select-content"
    class="bg-popover text-popover-foreground absolute left-0 mt-1 z-50 max-h-[var(--radix-select-content-available-height,auto)] min-w-[8rem] origin-top overflow-x-hidden overflow-y-auto rounded-md border shadow-md
           data-[state=open]:animate-in data-[state=closed]:animate-out
           data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
           data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
    v-bind="$attrs"
  >
    <div class="p-1">
      <slot />
    </div>
  </div>
</template>

<script>
export default {
  name: 'SelectContent',

  inheritAttrs: false,

  props: {
    position: {
      type: String,
      default: 'popper',
    },
  },

  inject: ['selectContext'],

  computed: {
    isOpen() {
      const api = this.selectContext
      return api && api.getOpen ? api.getOpen() : false
    },
  },
}
</script>