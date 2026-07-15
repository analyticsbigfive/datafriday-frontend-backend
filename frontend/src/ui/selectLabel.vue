<template>
  <div data-slot="select-label" :class="mergedClass">
    <slot />
  </div>
</template>

<script>
export default {
  name: "SelectLabel",

  props: {
    className: {
      type: String,
      default: "",
    },
  },

  computed: {
    mergedClass() {
      return ["text-muted-foreground px-2 py-1.5 text-xs", this.className]
        .filter(Boolean)
        .join(" ");
    },
  },
};
</script>