<template>
  <button
    type="button"
    data-slot="select-trigger"
    :data-size="size"
    class="border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-full items-center justify-between gap-2 rounded-md border bg-input-background px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8"
    v-bind="$attrs"
    @click="handleClick"
  >
    <slot />
    <!-- Icône chevron bas simple (à adapter avec Lucide Vue si tu veux) -->
    <span class="ml-2 inline-flex items-center justify-center">
      <svg
        class="size-4 opacity-50"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </span>
  </button>
</template>

<script>
export default {
  name: 'SelectTrigger',

  inheritAttrs: false,

  props: {
    size: {
      type: String,
      default: 'default', // 'sm' | 'default'
    },
  },

  inject: ['selectContext'],

  methods: {
    handleClick(event) {
      this.$emit('click', event)
      const api = this.selectContext
      if (api && api.setOpen) {
        api.setOpen(!api.getOpen())
      }
    },
  },
}
</script>