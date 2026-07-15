<template>
  <div
    data-slot="scroll-area"
    class="relative"
    :class="className"
  >
    <!-- Viewport -->
    <div
      data-slot="scroll-area-viewport"
      class="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1 overflow-auto"
    >
      <slot />
    </div>

    <!-- Scrollbar verticale par défaut -->
    <ScrollBar orientation="vertical" />

    <!-- Coin (facultatif, simple placeholder) -->
    <div
      data-slot="scroll-area-corner"
      class="absolute bottom-0 right-0 w-2.5 h-2.5"
    />
  </div>
</template>

<script>
import ScrollBar from './scrollBar.vue'

export default {
  name: 'ScrollArea',
  components: { ScrollBar },

  props: {
    className: {
      type: String,
      default: '',
    },
  },
}
</script>