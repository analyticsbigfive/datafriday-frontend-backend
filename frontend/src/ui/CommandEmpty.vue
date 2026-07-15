<template>
  <div
    v-if="isEmpty"
    data-slot="command-empty"
    class="py-6 text-center text-sm"
  >
    <slot />
  </div>
</template>

<script>
import { CommandContextKey } from "./commandContext";

export default {
  name: "CommandEmpty",

  inject: {
    command: { from: CommandContextKey, default: null },
  },

  computed: {
    isEmpty() {
      const visible = this.command && this.command.getVisibleItems ? this.command.getVisibleItems() : [];
      return !visible || visible.length === 0;
    },
  },
};
</script>
