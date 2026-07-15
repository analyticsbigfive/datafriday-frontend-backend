<template>
  <div
    v-if="isVisible"
    ref="root"
    data-slot="command-item"
    :data-selected="isSelected ? 'true' : 'false'"
    :data-disabled="disabled ? 'true' : 'false'"
    :class="mergedClass"
    v-bind="$attrs"
    @mouseenter="onMouseEnter"
    @click="onClick"
  >
    <slot />
  </div>
</template>

<script>
import { nextTick } from "vue";
import { CommandContextKey, mergeClass, nextCommandItemId } from "./commandContext";

export default {
  name: "CommandItem",
  inheritAttrs: false,

  props: {
    className: {
      type: String,
      default: "",
    },

    value: {
      type: String,
      default: "",
    },

    disabled: {
      type: Boolean,
      default: false,
    },

    keywords: {
      type: String,
      default: "",
    },
  },

  emits: ["select"],

  inject: {
    command: { from: CommandContextKey, default: null },
  },

  data() {
    return {
      _id: nextCommandItemId(),
    };
  },

  computed: {
    textContent() {
      const el = this.$refs.root;
      return el && el.textContent ? el.textContent : "";
    },

    isVisible() {
      if (!this.command || !this.command.isItemVisible) return true;
      return this.command.isItemVisible({
        value: this.value,
        keywords: this.keywords,
        text: this.textContent,
      });
    },

    isSelected() {
      const visible = this.command && this.command.getVisibleItems ? this.command.getVisibleItems() : [];
      const idx = visible.findIndex((x) => x.id === this._id);
      const selectedIndex = this.command && this.command.getSelectedIndex ? this.command.getSelectedIndex() : -1;
      return idx >= 0 && idx === selectedIndex;
    },

    mergedClass() {
      return mergeClass(
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        this.className,
      );
    },
  },

  mounted() {
    if (!this.command || !this.command.registerItem) return;

    nextTick(() => {
      this.command.registerItem({
        id: this._id,
        value: this.value,
        keywords: this.keywords,
        text: this.textContent,
        disabled: this.disabled,
        el: this.$refs.root,
        onSelect: (value) => this.$emit("select", value),
      });
    });
  },

  beforeUnmount() {
    if (this.command && this.command.unregisterItem) {
      this.command.unregisterItem(this._id);
    }
  },

  methods: {
    onMouseEnter() {
      const visible = this.command && this.command.getVisibleItems ? this.command.getVisibleItems() : [];
      const idx = visible.findIndex((x) => x.id === this._id);
      if (idx >= 0 && this.command && this.command.setSelectedIndex) {
        this.command.setSelectedIndex(idx);
      }
    },

    onClick() {
      if (this.disabled) return;
      this.$emit("select", this.value);
    },
  },
};
</script>
