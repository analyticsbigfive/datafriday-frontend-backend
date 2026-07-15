<template>
  <div data-slot="command-list" :class="mergedClass" v-bind="$attrs">
    <slot />
  </div>
</template>

<script>
import { mergeClass } from "./commandContext";

export default {
  name: "CommandList",
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
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        this.className,
      );
    },
  },
};
</script>
