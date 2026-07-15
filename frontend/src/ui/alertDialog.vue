<template>
  <!-- Trigger optionnel via slot nommé -->
  <slot name="trigger" :open="openState" :setOpen="setOpen"></slot>

  <teleport to="body">
    <div v-if="openState">
      <div
        class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />
      <slot :open="openState" :setOpen="setOpen"></slot>
    </div>
  </teleport>
</template>

<script>
export default {
  name: 'AlertDialog',
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
  computed: {
    openState() {
      return this.internalOpen
    },
  },
  provide() {
    return {
      alertDialog: {
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