<template>
  <!-- Composant polymorphique : par défaut un <button> -->
  <component
    :is="asChild ? 'span' : 'button'"
    data-slot="button"
    :class="buttonClass"
    v-bind="$attrs"
  >
    <slot />
  </component>
</template>

<script>
export default {
  name: 'UiButton',

  inheritAttrs: false,

  props: {
    variant: {
      type: String,
      default: 'default', // default | destructive | outline | secondary | ghost | link
    },
    size: {
      type: String,
      default: 'default', // default | sm | lg | icon
    },
    asChild: {
      type: Boolean,
      default: false,
    },
  },

  computed: {
    buttonClass() {
      const base =
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"

      const variantClasses = {
        default:
          "bg-primary text-primary-foreground hover:shadow-[inset_0_0_0_100px_rgba(255,255,255,0.3)] active:shadow-[inset_0_0_0_100px_rgba(255,255,255,0.5)] active:scale-[0.98] focus-visible:ring-primary/30",
        destructive:
          "bg-destructive text-white hover:shadow-[inset_0_0_0_100px_rgba(255,255,255,0.3)] active:shadow-[inset_0_0_0_100px_rgba(255,255,255,0.5)] active:scale-[0.98] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80 dark:bg-input/30 dark:border-input dark:hover:bg-input/50 dark:active:bg-input/60",
        secondary:
          "bg-secondary text-secondary-foreground hover:shadow-[inset_0_0_0_100px_rgba(255,255,255,0.3)] active:shadow-[inset_0_0_0_100px_rgba(255,255,255,0.5)] active:scale-[0.98]",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/80 dark:hover:bg-accent/50 dark:active:bg-accent/60",
        link:
          "text-primary underline-offset-4 hover:underline active:text-primary/80",
      }

      const sizeClasses = {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-md",
      }

      const variantClass = variantClasses[this.variant] || variantClasses.default
      const sizeClass = sizeClasses[this.size] || sizeClasses.default

      // $attrs.class est fusionné automatiquement par Vue, donc pas besoin de le traiter ici
      return [base, variantClass, sizeClass].join(' ')
    },
  },
}
</script>