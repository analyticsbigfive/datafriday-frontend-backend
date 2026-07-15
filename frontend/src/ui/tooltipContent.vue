<template>
  <div
    v-if="tooltipContext && tooltipContext.isOpen()"
    data-slot="tooltip-content"
    class="absolute z-50 mt-2 px-3 py-1.5 text-xs text-white bg-black rounded-full shadow-lg pointer-events-none"
  >
    <slot />
    <div
      class="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-black rotate-45"
    />
  </div>
</template>

<script>
export default {
  name: 'TooltipContent',
  inject: ['tooltipContext'],
}
</script>