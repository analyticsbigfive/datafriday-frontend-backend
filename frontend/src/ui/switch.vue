<template>
  <button
    type="button"
    data-slot="switch"
    role="switch"
    :aria-checked="checked"
    :class="[
      'peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50',
      checked
        ? 'data-[state=checked]:bg-primary bg-primary'
        : 'data-[state=unchecked]:bg-switch-background dark:data-[state=unchecked]:bg-input/80 bg-switch-background',
      'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
      className,
    ]"
    @click="toggle"
    v-bind="restAttrs"
  >
    <span
      data-slot="switch-thumb"
      :class="[
        'pointer-events-none block size-4 rounded-full ring-0 transition-transform',
        checked
          ? 'data-[state=checked]:translate-x-[calc(100%-2px)] translate-x-[calc(100%-2px)] dark:data-[state=checked]:bg-primary-foreground bg-card'
          : 'data-[state=unchecked]:translate-x-0 translate-x-0 dark:data-[state=unchecked]:bg-card-foreground bg-card',
      ]"
    />
  </button>
</template>

<script>
export default {
  name: 'UiSwitch',
  inheritAttrs: false,

  props: {
    // pour v-model:checked
    checked: {
      type: Boolean,
      default: false,
    },
    // classe additionnelle (équivalent className)
    className: {
      type: String,
      default: '',
    },
  },

  emits: ['update:checked', 'change'],

  computed: {
    restAttrs() {
      // on retire class / checked des attrs hérités éventuellement
      const { class: _c, checked: _chk, ...rest } = this.$attrs
      return rest
    },
  },

  methods: {
    toggle() {
      const next = !this.checked
      this.$emit('update:checked', next)
      this.$emit('change', next)
    },
  },
}
</script>