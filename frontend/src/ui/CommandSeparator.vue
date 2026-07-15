<template>
  <div data-slot="command-separator" :class="mergedClass" v-bind="$attrs" />
</template>

<script>
import { mergeClass } from "./commandContext";

export default {
  name: "CommandSeparator",
  inheritAttrs: false,

  props: {
    className: {
      type: String,
      default: "",
    },
  },

  computed: {
    mergedClass() {
      return mergeClass("bg-border -mx-1 h-px", this.className);
    },
  },
};
</script>
