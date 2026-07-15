<template>
  <button
    type="button"
    data-slot="checkbox"
    :class="[
      'peer border bg-input-background dark:bg-input/30 dark:border-gray-500 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
      $attrs.class,
    ]"
    :data-state="stateAttr"
    :aria-checked="stateAttr"
    :disabled="disabled"
    v-bind="$attrs"
    @click="toggle"
  >
    <span
      data-slot="checkbox-indicator"
      class="flex items-center justify-center text-current transition-none"
    >
      <MinusIcon
        v-if="modelValue === 'indeterminate'"
        class="size-3.5"
      />
      <CheckIcon
        v-else-if="modelValue === true"
        class="size-3.5"
      />
    </span>
  </button>
</template>

<script>
import { Check as CheckIcon, Minus as MinusIcon } from 'lucide-vue-next'

export default {
  name: 'Checkbox',

  components: {
    CheckIcon,
    MinusIcon,
  },

  inheritAttrs: false,

  props: {
    // true | false | 'indeterminate'
    modelValue: {
      type: [Boolean, String],
      default: false,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },

  computed: {
    stateAttr() {
      if (this.modelValue === 'indeterminate') return 'indeterminate'
      return this.modelValue ? 'checked' : 'unchecked'
    },
  },

  methods: {
    toggle(e) {
      if (this.disabled) return
      this.$emit('click', e)

      let next
      if (this.modelValue === 'indeterminate') {
        next = true
      } else {
        next = !this.modelValue
      }

      this.$emit('update:modelValue', next)
      this.$emit('update:checked', next) // utile si tu utilises :checked / @update:checked
    },
  },
}
</script>