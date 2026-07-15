<template>
  <div
    role="menuitem"
    data-slot="dropdown-menu-item"
    :data-inset="inset || null"
    :data-variant="variant"
    class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none
           focus:bg-accent focus:text-accent-foreground
           data-[variant=destructive]:text-destructive
           data-[variant=destructive]:focus:bg-destructive/10
           dark:data-[variant=destructive]:focus:bg-destructive/20
           data-[variant=destructive]:focus:text-destructive
           data-[disabled]:pointer-events-none data-[disabled]:opacity-50
           data-[inset]:pl-8
           [&_svg]:pointer-events-none [&_svg]:shrink-0
           [&_svg:not([class*='size-'])]:h-4 [&_svg:not([class*='size-'])]:w-4"
    v-bind="forwardedAttrs"
    @click="handleClick"
  >
    <slot />
  </div>
</template>

<script>
export default {
  name: 'DropdownMenuItem',
  inheritAttrs: false,
  props: {
    inset: { type: Boolean, default: false },
    variant: { type: String, default: null }, // ex: 'destructive' ou null
  },
  emits: ['click'],
  inject: ['dropdownMenu'],
  computed: {
    forwardedAttrs() {
      const attrs = { ...this.$attrs }
      // IMPORTANT: on retire le listener "onClick" pour éviter le double appel
      delete attrs.onClick
      return attrs
    },
  },
  methods: {
    handleClick(e) {
      this.$emit('click', e)
      // Optionnel mais pratique: fermer le menu après sélection
      const api = this.dropdownMenu
      if (api && api.setOpen) api.setOpen(false)
    },
  },
}
</script>