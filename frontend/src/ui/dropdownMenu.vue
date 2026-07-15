<template>
  <!-- On laisse les sous-composants utiliser provide/inject -->
  <slot />
</template>

<script>
export default {
  name: 'DropdownMenu',

  props: {
    open: { type: Boolean, default: false },
    onOpenChange: { type: Function, default: null },
  },

  data() {
    return {
      internalOpen: this.open,
      triggerEl: null,
    }
  },

  computed: {
    isControlled() {
      return this.onOpenChange !== null
    },
    openState() {
      return this.isControlled ? this.open : this.internalOpen
    },
  },

  watch: {
    open(val) {
      if (this.isControlled) {
        this.internalOpen = val
      }
    },
  },

  provide() {
    return {
      dropdownMenu: {
        getOpen: () => this.openState,
        setOpen: this.setOpen,

        setTriggerEl: this.setTriggerEl,
        getTriggerEl: () => this.triggerEl,
      },
    }
  },

  methods: {
    setOpen(val) {
      if (this.isControlled) {
        this.onOpenChange && this.onOpenChange(val)
        this.$emit('update:open', val)
      } else {
        this.internalOpen = val
        this.$emit('update:open', val)
        this.onOpenChange && this.onOpenChange(val)
      }
    },

    setTriggerEl(el) {
      this.triggerEl = el
    },
  },
}
</script>