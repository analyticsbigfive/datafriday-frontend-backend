<template>
  <div class="ct-acc" :class="[`ct-acc--${variant}`, { 'ct-acc--open': open }]">
    <button type="button" class="ct-acc__head" :aria-expanded="open" @click="open = !open">
      {{ title }}
      <ChevronDown :size="18" class="ct-acc__chevron" />
    </button>
    <div v-show="open" class="ct-acc__body">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

// Section repliable des panneaux latéraux (filtres à gauche, résumé à droite).
const props = defineProps({
  title: { type: String, required: true },
  defaultOpen: { type: Boolean, default: true },
  // 'filter' (colonne gauche) | 'summary' (colonne droite, plus aérée)
  variant: { type: String, default: 'filter' },
})

const open = ref(props.defaultOpen)
</script>

<style scoped>
.ct-acc {
  border-bottom: 1px solid var(--ct-border-strong);
}
.ct-acc:last-child {
  border-bottom: 0;
}
.ct-acc__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 15px 4px 13px;
  border: 0;
  background: transparent;
  color: var(--ct-label);
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
}
.ct-acc--summary .ct-acc__head {
  padding: 18px 2px 14px;
}
.ct-acc__chevron {
  color: var(--ct-muted);
  transition: transform 140ms;
}
.ct-acc--open .ct-acc__chevron {
  transform: rotate(180deg);
}
.ct-acc__body {
  padding: 2px 4px 12px;
}
.ct-acc--summary .ct-acc__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 0 14px;
}
@media (prefers-reduced-motion: reduce) {
  .ct-acc__chevron {
    transition: none;
  }
}
</style>
