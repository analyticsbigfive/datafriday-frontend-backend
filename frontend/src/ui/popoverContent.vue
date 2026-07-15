<template>
  <Teleport to="body">
    <div
      v-if="popover && popover.isOpen"
      data-slot="popover-content"
      :data-state="popover.isOpen ? 'open' : 'closed'"
      :style="contentStyle"
      :class="contentClass"
      ref="content"
      v-bind="$attrs"
    >
      <slot />
    </div>
  </Teleport>
</template>

<script>
const BASE_CLASSES =
  'bg-popover text-popover-foreground z-50 w-72 rounded-md border p-4 shadow-md outline-hidden'

export default {
  name: 'PopoverContent',
  inheritAttrs: false,
  inject: ['popover'],

  props: {
    className: { type: String, required: false, default: '' },
    align: { type: String, required: false, default: 'center' }, // 'start' | 'center' | 'end'
    sideOffset: { type: Number, required: false, default: 4 },
  },

  data() {
    return {
      position: { top: 0, left: 0, visibility: 'hidden' },
    }
  },

  computed: {
    contentClass() {
      return [BASE_CLASSES, this.className].filter(Boolean).join(' ')
    },

    contentStyle() {
      return {
        position: 'absolute',
        top: `${this.position.top}px`,
        left: `${this.position.left}px`,
        visibility: this.position.visibility,
      }
    },
  },

  watch: {
    'popover.isOpen': {
      immediate: true,
      handler(open) {
        if (open) {
          this.$nextTick(() => this.reposition())
          // reposition sur resize/scroll
          window.addEventListener('resize', this.reposition, { passive: true })
          window.addEventListener('scroll', this.reposition, { passive: true, capture: true })
        } else {
          window.removeEventListener('resize', this.reposition)
          window.removeEventListener('scroll', this.reposition, true)
        }
      },
    },
  },

  beforeUnmount() {
    window.removeEventListener('resize', this.reposition)
    window.removeEventListener('scroll', this.reposition, true)
  },

  methods: {
    reposition() {
      if (!this.popover) return

      const referenceEl = this.popover.anchorEl || this.popover.triggerEl
      const contentEl = this.$refs.content
      if (!referenceEl || !contentEl) return

      const refRect = referenceEl.getBoundingClientRect()
      const contentRect = contentEl.getBoundingClientRect()

      // Placement: bottom (comme usage courant), avec sideOffset
      const top = refRect.bottom + this.sideOffset + window.scrollY

      let left = refRect.left + window.scrollX
      if (this.align === 'center') {
        left = refRect.left + refRect.width / 2 - contentRect.width / 2 + window.scrollX
      } else if (this.align === 'end') {
        left = refRect.right - contentRect.width + window.scrollX
      }

      // clamp minimal (évite de sortir totalement de l’écran)
      const minLeft = 8 + window.scrollX
      const maxLeft = window.scrollX + window.innerWidth - contentRect.width - 8
      left = Math.max(minLeft, Math.min(maxLeft, left))

      this.position = { top, left, visibility: 'visible' }
    },
  },
}
</script>