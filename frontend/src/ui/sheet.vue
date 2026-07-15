<template>
  <div>
    <!-- Slot pour le trigger (bouton) -->
    <slot name="trigger" :open="open" :setOpen="setOpen"></slot>

    <!-- Teleport du contenu vers body -->
    <teleport to="body">
      <div v-if="open">
        <!-- Overlay -->
        <div
          class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          @click="handleOverlayClick"
        ></div>

        <!-- Contenu (SheetContent.vue s’en charge) -->
        <slot :open="open" :setOpen="setOpen"></slot>
      </div>
    </teleport>
  </div>
</template>

<script>
export default {
  name: 'Sheet',

  props: {
    open: {
      type: Boolean,
      default: false,
    },
    // pour coller à l’API React: <Sheet open={} onOpenChange={} >
    onOpenChange: {
      type: Function,
      default: null,
    },
    closeOnOverlayClick: {
      type: Boolean,
      default: true,
    },
  },

  data() {
    return {
      internalOpen: this.open,
    }
  },

  computed: {
    isControlled() {
      return this.onOpenChange !== null
    },
  },

  watch: {
    open(val) {
      if (this.isControlled) {
        this.internalOpen = val
      }
    },
  },

  created() {
    // provide pour SheetContent / autres sous-composants
    this.$.appContext.provides.sheet = {
      getOpen: () => this.openState,
      setOpen: this.setOpen,
    }
  },

  computed: {
    openState() {
      return this.isControlled ? this.open : this.internalOpen
    },
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
    handleOverlayClick() {
      if (!this.closeOnOverlayClick) return
      this.setOpen(false)
    },
  },
}
</script>