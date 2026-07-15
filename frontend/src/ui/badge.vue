<template>
  <component
    :is="as"
    data-slot="badge"
    :class="badgeClass"
    v-bind="$attrs"
  >
    <slot />
  </component>
</template>

<script>
export default {
  name: 'Badge',

  props: {
    variant: {
      type: String,
      default: 'default', // 'default' | 'secondary' | 'destructive' | 'outline'
    },
    // équivalent simple de `asChild`/`Slot` : tu peux faire <Badge as="a" ...>
    as: {
      type: String,
      default: 'span',
    },
  },

  computed: {
    badgeClass() {
      const base =
        'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden'

      const variants = {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'text-foreground hover:bg-accent hover:text-accent-foreground',
      }

      const variantClass = variants[this.variant] || variants.default
      return `${base} ${variantClass}`
    },
  },
}
</script>