<template>
  <span data-slot="popover">
    <slot />
  </span>
</template>

<script>
export default {
  name: 'Popover',

  props: {
    open: { type: Boolean, required: false, default: undefined }, // mode contrôlé si défini
    defaultOpen: { type: Boolean, required: false, default: false },
  },

  emits: ['update:open', 'openChange'],

  data() {
    return {
      internalOpen: this.defaultOpen,
      triggerEl: null,
      anchorEl: null,
    }
  },

  computed: {
    isControlled() {
      return this.open !== undefined
    },
    isOpen() {
      return this.isControlled ? this.open : this.internalOpen
    },
  },

  methods: {
    setTriggerEl(el) {
      this.triggerEl = el
    },
    setAnchorEl(el) {
      this.anchorEl = el
    },

    setOpen(next) {
      if (!this.isControlled) this.internalOpen = next
      this.$emit('update:open', next)
      this.$emit('openChange', next)
    },

    toggle() {
      this.setOpen(!this.isOpen)
    },

    close() {
      this.setOpen(false)
    },
  },

  provide() {
    return {
      popover: this,
    }
  },
}
</script>