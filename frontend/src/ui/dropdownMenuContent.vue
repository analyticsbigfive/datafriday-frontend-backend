<template>
  <teleport to="body">
    <div
      v-if="isOpen"
      ref="contentEl"
      data-slot="dropdown-menu-content"
      :style="contentStyle"
      class="bg-popover text-popover-foreground z-50 max-h-[var(--radix-dropdown-menu-content-available-height,auto)] min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md
             data-[state=open]:animate-in data-[state=closed]:animate-out
             data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
             data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
      v-bind="$attrs"
    >
      <slot />
    </div>
  </teleport>
</template>

<script>
export default {
  name: 'DropdownMenuContent',
  inheritAttrs: false,

  props: {
    sideOffset: { type: Number, default: 4 },
    align: { type: String, default: 'start' }, // start | center | end
    side: { type: String, default: 'bottom' }, // bottom | top
  },

  inject: ['dropdownMenu'],

  data() {
    return {
      contentStyle: {
        position: 'fixed',
        top: '0px',
        left: '0px',
      },
    }
  },

  computed: {
    isOpen() {
      const api = this.dropdownMenu
      return api && api.getOpen ? api.getOpen() : false
    },
  },

  watch: {
    isOpen(open) {
      if (open) {
        this.$nextTick(() => {
          this.updatePosition()
          window.addEventListener('resize', this.updatePosition)
          window.addEventListener('scroll', this.updatePosition, true)
        })
      } else {
        window.removeEventListener('resize', this.updatePosition)
        window.removeEventListener('scroll', this.updatePosition, true)
      }
    },
  },

  beforeUnmount() {
    window.removeEventListener('resize', this.updatePosition)
    window.removeEventListener('scroll', this.updatePosition, true)
  },

  methods: {
    updatePosition() {
      const api = this.dropdownMenu
      const triggerEl = api && api.getTriggerEl ? api.getTriggerEl() : null
      const contentEl = this.$refs.contentEl

      if (!triggerEl || !triggerEl.getBoundingClientRect || !contentEl) return

      const rect = triggerEl.getBoundingClientRect()
      const contentWidth = contentEl.offsetWidth
      const contentHeight = contentEl.offsetHeight

      let top
      if (this.side === 'top') {
        top = rect.top - this.sideOffset - contentHeight
      } else {
        top = rect.bottom + this.sideOffset
      }

      let left
      if (this.align === 'end') {
        left = rect.right - contentWidth
      } else if (this.align === 'center') {
        left = rect.left + rect.width / 2 - contentWidth / 2
      } else {
        left = rect.left
      }

      this.contentStyle = {
        position: 'fixed',
        top: `${Math.max(0, top)}px`,
        left: `${Math.max(0, left)}px`,
      }
    },
  },
}
</script>