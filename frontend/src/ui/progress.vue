<template>
  <div
    data-slot="progress"
    role="progressbar"
    :aria-valuenow="normalizedValue"
    aria-valuemin="0"
    aria-valuemax="100"
    :class="rootClass"
    v-bind="$attrs"
  >
    <div
      data-slot="progress-indicator"
      class="bg-primary h-full w-full flex-1 transition-all"
      :style="indicatorStyle"
    />
  </div>
</template>

<script>
export default {
  name: 'Progress',

  inheritAttrs: false,

  props: {
    value: {
      type: Number,
      required: false,
      default: 0,
    },
    className: {
      type: String,
      required: false,
      default: '',
    },
  },

  computed: {
    normalizedValue() {
      const v = Number(this.value || 0)
      if (Number.isNaN(v)) return 0
      return Math.max(0, Math.min(100, v))
    },

    rootClass() {
      return [
        'bg-primary/20 relative h-2 w-full overflow-hidden rounded-full',
        this.className,
      ].filter(Boolean).join(' ')
    },

    indicatorStyle() {
      return {
        transform: `translateX(-${100 - this.normalizedValue}%)`,
      }
    },
  },
}
</script>