<template>
  <div
    data-slot="separator-root"
    :role="decorative ? 'presentation' : 'separator'"
    :aria-orientation="orientation"
    :class="[
      'bg-border shrink-0',
      orientation === 'horizontal'
        ? 'h-px w-full'
        : 'h-full w-px',
      className,
    ]"
  />
</template>

<script>
export default {
  name: 'UiSeparator',

  props: {
    className: {
      type: String,
      default: '',
    },
    orientation: {
      type: String,
      default: 'horizontal', // 'horizontal' | 'vertical'
    },
    decorative: {
      type: Boolean,
      default: true,
    },
  },
}
</script>