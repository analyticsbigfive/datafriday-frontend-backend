<template>
  <div class="ct-seg" role="group" :aria-label="t('ctGroupLabel')">
    <button
      v-for="opt in visibleOptions"
      :key="opt.value"
      type="button"
      :aria-pressed="modelValue === opt.value"
      @click="$emit('update:modelValue', opt.value)"
    >{{ t(opt.labelKey) }}</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

// Bascule « Afficher par » : article, catégorie, type, et ingrédient quand un article est filtré.
// Suit les filtres tant qu'elle n'est pas forcée.
const props = defineProps({
  modelValue: { type: String, default: 'article' },
  canIngredient: { type: Boolean, default: false },
})
defineEmits(['update:modelValue'])

const { t } = useI18n()
const options = [
  { value: 'article', labelKey: 'ctGroupArticle' },
  { value: 'category', labelKey: 'ctGroupCategory' },
  { value: 'type', labelKey: 'ctGroupType' },
  { value: 'ingredient', labelKey: 'ctGroupIngredient' },
]
const visibleOptions = computed(() => options.filter((o) => o.value !== 'ingredient' || props.canIngredient))
</script>

<style scoped>
.ct-seg {
  display: inline-flex;
  height: 32px;
  border: 1px solid var(--ct-border-strong);
  border-radius: 999px;
  overflow: hidden;
}
.ct-seg button {
  padding: 0 14px;
  border: 0;
  background: transparent;
  color: var(--ct-muted);
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.ct-seg button[aria-pressed='true'] {
  background: var(--ct-border);
  color: var(--ct-text);
}
</style>
