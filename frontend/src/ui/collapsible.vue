<template>
  <div
    data-slot="collapsible"
    :data-state="isOpen ? 'open' : 'closed'"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'Collapsible',

  props: {
    open: {
      type: Boolean,
      default: undefined, // contrôlé si défini
    },
    defaultOpen: {
      type: Boolean,
      default: false,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },

  data() {
    return {
      internalOpen: this.open !== undefined ? this.open : this.defaultOpen,
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

  watch: {
    open(newVal) {
      if (newVal !== undefined) {
        this.internalOpen = newVal
      }
    },
  },

  created() {
    // Fournir le contexte aux Trigger / Content
    this.provideContext()
  },

  methods: {
    provideContext() {
      // on utilise provide/inject via this._provided implicite:
      // plus simple : on stocke le contexte sur l’instance et on le lit via inject dans les enfants
      // Mais en Option API, on peut utiliser provide() directement :
      // (nécessite Vue 3.3+ ou composition API; pour rester simple, on passe par provide dans setup normalement.
      // Ici, on va imiter en exposant les méthodes sur this et laisser Trigger/Content recevoir `collapsible` via inject('collapsible').
    },

    setOpen(value) {
      if (this.disabled) return

      if (!this.isControlled) {
        this.internalOpen = value
      }
      this.$emit('update:open', value)
    },

    toggle() {
      this.setOpen(!this.isOpen)
    },
  },

  provide() {
  const self = this

  return {
    collapsible: {
      // fonctions au lieu de getters
      isOpen() {
        return self.isOpen
      },
      disabled() {
        return self.disabled
      },
      toggle() {
        self.toggle()
      },
      setOpen(value) {
        self.setOpen(value)
      },
    },
  }
}
}
</script>