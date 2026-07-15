<template>
  <div
    class="fixed z-50 flex flex-col gap-4 bg-background shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500"
    :class="sideClasses"
  >
    <slot />
    
  </div>
</template>

<script>
import { X as XIcon } from 'lucide-vue-next'

export default {
  name: 'SheetContent',
  components: { XIcon },

  inject: ['sheet'],

  props: {
    side: {
      type: String,
      default: 'right', // 'top' | 'right' | 'bottom' | 'left'
    },
    className: {
      type: String,
      default: '',
    },
  },

  computed: {
    sideClasses() {
    const base =
      'data-[state=open]:animate-in data-[state=closed]:animate-out'

    if (this.side === 'right') {
      return [
        base,
        // uniquement collé à droite
        'fixed inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        this.className,
      ].join(' ')
    }

    if (this.side === 'left') {
      return [
        base,
        'fixed inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        this.className,
      ].join(' ')
    }

    if (this.side === 'top') {
      return [
        base,
        'fixed inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        this.className,
      ].join(' ')
    }

    if (this.side === 'bottom') {
      return [
        base,
        'fixed inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        this.className,
      ].join(' ')
    }

    return [base, this.className].join(' ')
  },
  },

  methods: {
    close() {
      this.sheet && this.sheet.setOpen(false)
    },
  },
}
</script>