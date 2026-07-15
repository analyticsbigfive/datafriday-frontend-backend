<template>
  <div
    data-slot="scroll-area-scrollbar"
    :class="wrapperClasses"
  >
    <div
      data-slot="scroll-area-thumb"
      class="bg-border relative flex-1 rounded-full"
    />
  </div>
</template>

<script>
export default {
  name: 'ScrollBar',

  props: {
    orientation: {
      type: String,
      default: 'vertical', // 'vertical' | 'horizontal'
    },
    className: {
      type: String,
      default: '',
    },
  },

  computed: {
    wrapperClasses() {
      const base = 'flex touch-none p-px transition-colors select-none'
      const orient =
        this.orientation === 'horizontal'
          ? 'h-2.5 flex-col border-t border-t-transparent'
          : 'h-full w-2.5 border-l border-l-transparent'
      return [base, orient, this.className].join(' ')
    },
  },
}
</script>