<template>
  <!--
    Shared search bar — visual reused VERBATIM from MarketPriceListView.vue
    (.mpl-searchbar). Full-width white strip, borderless native input, square
    corners. DO NOT introduce a new visual style here: this IS the app reference.
  -->
  <div class="appsb" :class="{ 'appsb--dark': isDark, 'appsb--sticky': sticky, 'appsb--dense': dense }" :style="sticky ? { top: stickyTop } : null">
    <div class="appsb__inner">
      <Search :size="17" class="appsb__icon" />
      <input
        :value="modelValue"
        class="appsb__input"
        type="search"
        :placeholder="placeholder"
        :aria-label="placeholder"
        @input="$emit('update:modelValue', $event.target.value)"
      />

      <!-- optional filter pills / selects (right cluster) -->
      <div v-if="$slots.filters" class="appsb__filters">
        <slot name="filters" />
      </div>

      <span v-if="count !== null && count !== undefined && count !== ''" class="appsb__count">
        {{ count }}
      </span>

      <button
        v-if="showClear && (modelValue || count)"
        type="button"
        class="appsb__clear"
        :aria-label="clearLabel"
        @click="onClear"
      >
        <X :size="15" />
      </button>
    </div>
  </div>
</template>

<script>
import { Search, X } from "lucide-vue-next";

export default {
  name: "AppSearchBar",
  components: { Search, X },
  props: {
    modelValue: { type: [String, Number], default: "" },
    placeholder: { type: String, default: "" },
    isDark: { type: Boolean, default: false },
    // result count text shown at the right (e.g. "12 résultat(s)"); null hides it
    count: { type: [String, Number], default: null },
    showClear: { type: Boolean, default: true },
    clearLabel: { type: String, default: "Clear" },
    sticky: { type: Boolean, default: false },
    stickyTop: { type: String, default: "0px" },
    // tighter padding for use embedded inside a card/step toolbar
    dense: { type: Boolean, default: false },
  },
  emits: ["update:modelValue", "clear"],
  methods: {
    onClear() {
      this.$emit("update:modelValue", "");
      this.$emit("clear");
    },
  },
};
</script>

<style scoped>
/* ── Search bar — verbatim from .mpl-searchbar (Market Price List reference) ── */
.appsb {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.appsb--sticky {
  position: sticky;
  z-index: 99;
}
.appsb--dark,
.v-theme--dataFridayDark .appsb {
  background: #1e293b;
  border-bottom-color: rgba(255, 255, 255, 0.08);
}
.appsb__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
  flex-wrap: wrap;
}
.appsb--dense .appsb__inner {
  padding: 8px 16px;
}
.appsb__icon {
  color: #9ca3af;
  flex-shrink: 0;
}
.appsb__input {
  flex: 1;
  min-width: 140px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #111827;
}
.appsb--dark .appsb__input,
.v-theme--dataFridayDark .appsb__input {
  color: #e5e7eb;
}
.appsb__input::placeholder {
  color: #9ca3af;
}
.appsb__filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.appsb__count {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}
.appsb__clear {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
  align-items: center;
  border-radius: 4px;
}
.appsb__clear:hover {
  color: #ff3131;
}
</style>
