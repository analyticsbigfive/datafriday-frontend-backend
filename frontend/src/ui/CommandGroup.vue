<template>
  <div data-slot="command-group" :class="mergedClass" v-bind="$attrs">
    <slot />
  </div>
</template>

<script>
import { mergeClass } from "./commandContext";

export default {
  name: "CommandGroup",
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
        "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        this.className,
      );
    },
  },
};
</script>
