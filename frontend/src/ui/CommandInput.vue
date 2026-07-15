<template>
  <div
    data-slot="command-input-wrapper"
    class="flex h-9 items-center gap-2 border-b px-3"
  >
    <SearchIcon class="size-4 shrink-0 opacity-50" />

    <input
      data-slot="command-input"
      :class="inputClass"
      :value="currentValue"
      v-bind="$attrs"
      @input="onInput"
    />
  </div>
</template>

<script>
import { CommandContextKey, mergeClass } from "./commandContext";

// NOTE: adapte cet import selon ta lib d'icônes Vue.
// Si tu as lucide-vue-next: import { Search } from 'lucide-vue-next'
import { SearchIcon } from "lucide-vue-next";

export default {
  name: "CommandInput",
  inheritAttrs: false,

  components: {
    SearchIcon,
  },

  props: {
    className: {
      type: String,
      default: "",
    },

    modelValue: {
      type: String,
      default: undefined,
    },
  },

  emits: ["update:modelValue"],

  inject: {
    command: { from: CommandContextKey, default: null },
  },

  computed: {
    inputClass() {
      return mergeClass(
        "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
        this.className,
      );
    },

    currentValue() {
      if (this.modelValue !== undefined) return this.modelValue;
      if (this.command && this.command.getQuery) return this.command.getQuery();
      return "";
    },
  },

  methods: {
    onInput(e) {
      const v = e && e.target ? e.target.value : "";
      this.$emit("update:modelValue", v);
      if (this.command && this.command.setQuery) this.command.setQuery(v);
    },
  },
};
</script>
