<template>
  <!-- Section de l'inspecteur : accordéon plat, séparé par une ligne (sans carte ni icône). -->
  <div class="b2-section">
    <div class="b2-section__head" @click="open = !open">
      <span class="b2-section__title">{{ title }}</span>
      <slot name="meta" />
      <v-icon
        :icon="open ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        size="18"
        class="b2-section__chevron"
      />
    </div>
    <v-expand-transition>
      <div v-if="open" class="b2-section__body">
        <slot />
      </div>
    </v-expand-transition>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  // Conservé pour compat (plus affiché — sections sans icône).
  icon: { type: String, default: '' },
  defaultOpen: { type: Boolean, default: false },
})

const open = ref(props.defaultOpen)
</script>

<style scoped>
.b2-section {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.b2-section:last-child {
  border-bottom: none;
}
.b2-section__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  cursor: pointer;
  user-select: none;
}
.b2-section__title {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-md);
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
.b2-section__chevron {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.b2-section__body {
  padding: 0 0 16px;
}
</style>
