<template>
  <button
    type="button"
    data-slot="sheet-trigger"
    v-bind="$attrs"
    @click="openSheet"
  >
    <slot />
  </button>
</template>

<script>
export default {
  name: 'SheetTrigger',
  inject: ['sheet'], // on suppose que Sheet fournit { setOpen }

  methods: {
    openSheet() {
      if (this.sheet && typeof this.sheet.setOpen === 'function') {
        this.sheet.setOpen(true)
      }
    },
  },
}
</script>