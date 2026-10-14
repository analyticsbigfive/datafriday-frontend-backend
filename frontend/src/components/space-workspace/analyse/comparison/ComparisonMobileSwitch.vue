<template>
  <div ref="rootRef" class="cms" role="group" :aria-label="t('anCmpMobileSwitchLabel')">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="cms__btn"
      :data-view="opt.value"
      :aria-pressed="modelValue === opt.value ? 'true' : 'false'"
      @click="select(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup>
// Sélecteur mobile « Principal | Comparaison » (maquette .mswitch) : groupe de deux boutons
// avec aria-pressed. Présent dans le drawer ET au sommet de la vue principale.
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  // Écran affiché : 'main' | 'cmp'.
  modelValue: { type: String, default: 'cmp' },
  // true quand CE sélecteur est visible. Au passage false -> true, le focus se pose sur son bouton
  // actif : après un changement de vue, le focus suit l'écran affiché (l'autre sélecteur est masqué).
  shown: { type: Boolean, default: true },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const rootRef = ref(null)

const options = computed(() => [
  { value: 'main', label: t('anCmpMobileMain') },
  { value: 'cmp', label: t('anCmpMobileCmp') },
])

function select(value) {
  if (value !== props.modelValue) emit('update:modelValue', value)
}

watch(
  () => props.shown,
  async (now, before) => {
    if (!now || before) return
    await nextTick()
    const btn = rootRef.value && rootRef.value.querySelector('[aria-pressed="true"]')
    if (btn && typeof btn.focus === 'function') btn.focus({ preventScroll: true })
  }
)
</script>

<style scoped>
.cms {
  display: flex;
  gap: 4px;
  min-width: 0;
  padding: 3px;
  border-radius: 99px;
  background: rgba(var(--v-theme-on-surface), 0.07);
}
.cms__btn {
  flex: 1 1 0;
  min-width: 0;
  min-height: 44px;
  padding: 0 10px;
  border: 0;
  border-radius: 99px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font: inherit;
  font-size: var(--fs-base, 13px);
  font-weight: 500;
  cursor: pointer;
}
.cms__btn[aria-pressed='true'] {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
}
.cms__btn:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}
</style>
