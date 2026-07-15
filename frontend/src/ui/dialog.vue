<template>
  <!-- On ne rend rien de particulier, on fournit juste le contexte -->
  <slot />
</template>

<script>
export default {
  name: 'Dialog',

  props: {
    open: {
      type: Boolean,
      default: false,
    },
    onOpenChange: {
      type: Function,
      default: null,
    },
  },

  emits: ['update:open'],

  data() {
    return {
      internalOpen: this.open,
    }
  },

  watch: {
    open(val) {
      this.internalOpen = val
    },
  },

  provide() {
    return {
      dialogContext: {
        getOpen: () => this.internalOpen,
        setOpen: this.setOpen,
      },
    }
  },

  methods: {
    setOpen(val) {
      this.internalOpen = val
      this.$emit('update:open', val)
      this.onOpenChange && this.onOpenChange(val)
    },
  },
}
</script>