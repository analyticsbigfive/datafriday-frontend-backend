<template>
  <teleport to="body">
    <div v-if="isOpen">
      <!-- Overlay -->
      <div
        class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        data-slot="dialog-overlay"
        @click="handleOverlayClick"
      />

      <!-- Content centré -->
      <div
        data-slot="dialog-content"
        class="bg-background fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg dark:border-gray-600 dark:shadow-[inset_0_1px_2px_0_rgba(255,255,255,0.1),0_20px_25px_-5px_rgba(0,0,0,0.5)]"
        v-bind="$attrs"
        :aria-describedby="ariaDescribedBy"
      >
        <slot />

        <!-- Bouton de fermeture -->
        <button
          type="button"
          class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 outline-none disabled:pointer-events-none"
          data-slot="dialog-close"
          @click="close"
        >
          <XIcon class="w-4 h-4" />
          <span class="sr-only">Close</span>
        </button>
      </div>
    </div>
  </teleport>
</template>

<script>
import { X as XIcon } from 'lucide-vue-next'

export default {
  name: 'DialogContent',

  components: { XIcon },

  inheritAttrs: false,

  props: {
    closeOnOverlayClick: {
      type: Boolean,
      default: true,
    },
  },

  inject: ['dialogContext'],

  computed: {
    isOpen() {
      const api = this.dialogContext
      return api && api.getOpen ? api.getOpen() : false
    },

    ariaDescribedBy() {
      // si l'attribut est passé (comme en React), on le renvoie, sinon undefined
      return this.$attrs['aria-describedby'] ?? undefined
    },
  },

  methods: {
    close() {
      const api = this.dialogContext
      if (api && api.setOpen) {
        api.setOpen(false)
      }
    },
    handleOverlayClick() {
      if (!this.closeOnOverlayClick) return
      this.close()
    },
  },
}
</script>