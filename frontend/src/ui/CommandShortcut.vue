<template>
  <span data-slot="command-shortcut" :class="mergedClass" v-bind="$attrs">
    <slot />
  </span>
</template>

<script>
import { mergeClass } from "./commandContext";

export default {
  name: "CommandShortcut",
  inheritAttrs: false,

  props: {
    className: {
      type: String,
      default: "",
    },
  },

  computed: {
    mergedClass() {
      return mergeClass(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        this.className,
      );
    },
  },
};
</script>
