<template>
  <div
    data-slot="command"
    :class="mergedClass"
    tabindex="0"
    @keydown="onKeydown"
  >
    <slot />
  </div>
</template>

<script>
import { nextTick } from "vue";
import { CommandContextKey, mergeClass } from "./commandContext";

export default {
  name: "Command",

  props: {
    className: {
      type: String,
      default: "",
    },
  },

  data() {
    return {
      query: "",
      items: [],
      selectedIndex: -1,
    };
  },

  provide() {
    return {
      [CommandContextKey]: {
        getQuery: () => this.query,
        setQuery: (v) => this.setQuery(v),

        registerItem: (item) => this.registerItem(item),
        unregisterItem: (id) => this.unregisterItem(id),

        isItemVisible: (item) => this.isItemVisible(item),

        getSelectedIndex: () => this.selectedIndex,
        setSelectedIndex: (idx) => (this.selectedIndex = idx),

        moveSelection: (delta) => this.moveSelection(delta),
        selectCurrent: () => this.selectCurrent(),

        getVisibleItems: () => this.getVisibleItems(),
      },
    };
  },

  computed: {
    mergedClass() {
      return mergeClass(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
        this.className,
      );
    },
  },

  methods: {
    setQuery(v) {
      this.query = v || "";
      this.selectedIndex = -1;

      nextTick(() => {
        this.moveSelection(1);
      });
    },

    registerItem(item) {
      const existingIndex = this.items.findIndex((x) => x.id === item.id);
      if (existingIndex >= 0) {
        this.items.splice(existingIndex, 1, item);
      } else {
        this.items.push(item);
      }

      nextTick(() => {
        if (this.selectedIndex === -1) this.moveSelection(1);
      });
    },

    unregisterItem(id) {
      const idx = this.items.findIndex((x) => x.id === id);
      if (idx >= 0) this.items.splice(idx, 1);
      if (this.selectedIndex >= this.items.length) {
        this.selectedIndex = this.items.length - 1;
      }
    },

    normalizeText(s) {
      return (s || "").toString().toLowerCase();
    },

    isItemVisible(item) {
      const q = this.normalizeText(this.query).trim();
      if (!q) return true;

      const hay = [
        this.normalizeText(item.value),
        this.normalizeText(item.keywords),
        this.normalizeText(item.text),
      ]
        .filter(Boolean)
        .join(" ");

      return hay.includes(q);
    },

    getVisibleItems() {
      return this.items.filter((it) => this.isItemVisible(it) && !it.disabled);
    },

    moveSelection(delta) {
      const visible = this.getVisibleItems();
      if (visible.length === 0) {
        this.selectedIndex = -1;
        return;
      }

      const currentId =
        this.selectedIndex >= 0 && this.selectedIndex < visible.length
          ? visible[this.selectedIndex].id
          : null;

      let startIndex = 0;
      if (currentId) {
        const idx = visible.findIndex((x) => x.id === currentId);
        startIndex = idx >= 0 ? idx : 0;
      } else {
        startIndex = delta > 0 ? -1 : 0;
      }

      let nextIndex = startIndex + delta;
      if (nextIndex < 0) nextIndex = visible.length - 1;
      if (nextIndex >= visible.length) nextIndex = 0;

      this.selectedIndex = nextIndex;

      nextTick(() => {
        const selected = visible[this.selectedIndex];
        if (selected && selected.el && typeof selected.el.scrollIntoView === "function") {
          selected.el.scrollIntoView({ block: "nearest" });
        }
      });
    },

    selectCurrent() {
      const visible = this.getVisibleItems();
      if (this.selectedIndex < 0 || this.selectedIndex >= visible.length) return;

      const selected = visible[this.selectedIndex];
      if (selected && typeof selected.onSelect === "function") {
        selected.onSelect(selected.value);
      }
    },

    onKeydown(e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.moveSelection(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.moveSelection(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.selectCurrent();
      }
    },
  },
};
</script>
