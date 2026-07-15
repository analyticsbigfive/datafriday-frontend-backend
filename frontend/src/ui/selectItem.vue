<template>
  <div
    role="option"
    data-slot="select-item"
    class="focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
    v-bind="$attrs"
    @click="handleClick"
  >
    <span class="absolute right-2 flex size-3.5 items-center justify-center">
      <!-- simple check icon -->
      <svg
        v-if="isSelected"
        class="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
    <span>
      <slot />
    </span>
  </div>
</template>

<script>
export default {
  name: 'SelectItem',

  inheritAttrs: false,

  props: {
    value: {
      type: String,
      required: true,
    },
  },

  inject: ['selectContext'],

  computed: {
    isSelected() {
      const api = this.selectContext
      return api && api.getValue && api.getValue() === this.value
    },
  },

  methods: {
    handleClick(event) {
      this.$emit('click', event)
      const api = this.selectContext
      if (!api || !api.setValue) return

      const nodes = this.$slots.default ? this.$slots.default() : []
      const first = nodes[0]
      const label =
        first && typeof first.children === 'string'
          ? first.children
          : this.value

      api.setValue(this.value, label)
      api.setOpen && api.setOpen(false)
    },
  },
}
</script>