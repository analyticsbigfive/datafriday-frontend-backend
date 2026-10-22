<template>
  <div class="ct-card ct-filters">
    <CostTrackingAccordion :title="t('ctSectionPeriod')">
      <div class="ct-field">
        <label for="ct-period">{{ t('ctPeriodLabel') }}</label>
        <select id="ct-period" class="ct-select" :value="period" @change="$emit('set-period', $event.target.value)">
          <option v-for="p in presets" :key="p" :value="p">{{ t(`ctPeriod${p}`) }}</option>
          <option value="custom">{{ t('ctPeriodCustom') }}</option>
        </select>
      </div>
      <template v-if="period === 'custom'">
        <div class="ct-field">
          <label for="ct-from">{{ t('ctPeriodFrom') }}</label>
          <input id="ct-from" v-model="customFrom" type="date" class="ct-select" @change="applyCustom" />
        </div>
        <div class="ct-field">
          <label for="ct-to">{{ t('ctPeriodTo') }}</label>
          <input id="ct-to" v-model="customTo" type="date" class="ct-select" @change="applyCustom" />
        </div>
      </template>
      <div v-if="!rangeValid" class="ct-filters__error" role="alert">{{ t('ctPeriodInvalid') }}</div>
    </CostTrackingAccordion>

    <CostTrackingAccordion :title="t('ctSectionItems')">
      <div class="ct-field">
        <label for="ct-type">{{ t('ctFilterType') }}</label>
        <select id="ct-type" class="ct-select" :value="typeId || ''" @change="$emit('set-type', $event.target.value || null)">
          <option value="">{{ t('ctAllTypes') }}</option>
          <option v-for="o in typeOptions" :key="o.id" :value="o.id">{{ o.name }}</option>
        </select>
      </div>
      <div class="ct-field">
        <label for="ct-category">{{ t('ctFilterCategory') }}</label>
        <select id="ct-category" class="ct-select" :value="categoryId || ''" @change="$emit('set-category', $event.target.value || null)">
          <option value="">{{ t('ctAllCategories') }}</option>
          <option v-for="o in categoryOptions" :key="o.id" :value="o.id">
            {{ typeId ? o.name : `${o.name} (${o.typeName})` }}
          </option>
        </select>
      </div>
      <div class="ct-field">
        <label for="ct-article">{{ t('ctFilterArticle') }}</label>
        <select id="ct-article" class="ct-select" :value="menuItemId || ''" @change="$emit('set-article', $event.target.value || null)">
          <option value="">{{ t('ctAllArticles') }}</option>
          <option v-for="o in articleOptions" :key="o.id" :value="o.id">{{ o.name }}</option>
        </select>
      </div>
      <div class="ct-field">
        <label for="ct-ingredient">{{ t('ctFilterIngredient') }}</label>
        <select
          id="ct-ingredient"
          class="ct-select"
          :value="ingredientId || ''"
          :disabled="!menuItemId"
          @change="$emit('set-ingredient', $event.target.value || null)"
        >
          <option value="">{{ menuItemId ? t('ctAllIngredients') : t('ctIngredientPickArticle') }}</option>
          <option v-for="o in ingredientOptions" :key="o.id" :value="o.id">{{ o.name }}</option>
        </select>
      </div>
      <button type="button" class="ct-link" @click="$emit('reset')">{{ t('ctResetFilters') }}</button>
    </CostTrackingAccordion>

    <CostTrackingAccordion :title="t('ctSectionDisplay')">
      <CostTrackingSwitch
        :model-value="showMargin && canMargin"
        :disabled="!canMargin"
        :label="t('ctMarginCurve')"
        :hint="t(canMargin ? 'ctMarginHintOn' : 'ctMarginHintOff')"
        @update:model-value="$emit('update:showMargin', $event)"
      />
    </CostTrackingAccordion>

    <CostTrackingAccordion :title="t('ctSectionRules')" :default-open="false">
      <div class="ct-filters__note">{{ t('ctRulesNote') }}</div>
    </CostTrackingAccordion>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import CostTrackingAccordion from './CostTrackingAccordion.vue'
import CostTrackingSwitch from './CostTrackingSwitch.vue'

// Panneau de filtres de la colonne gauche : période, Type > Catégorie > Article > Ingrédient (dépendants),
// options d'affichage, règles de calcul. Les règles de dépendance vivent dans useCostTracking.
defineProps({
  period: { type: String, default: '180' },
  presets: { type: Array, default: () => ['30', '90', '180', '365'] },
  rangeValid: { type: Boolean, default: true },
  typeId: { type: String, default: null },
  categoryId: { type: String, default: null },
  menuItemId: { type: String, default: null },
  ingredientId: { type: String, default: null },
  typeOptions: { type: Array, default: () => [] },
  categoryOptions: { type: Array, default: () => [] },
  articleOptions: { type: Array, default: () => [] },
  ingredientOptions: { type: Array, default: () => [] },
  showMargin: { type: Boolean, default: false },
  canMargin: { type: Boolean, default: true },
})
const emit = defineEmits([
  'set-period', 'set-custom-range', 'set-type', 'set-category', 'set-article', 'set-ingredient', 'reset',
  'update:showMargin',
])

const { t } = useI18n()

const customFrom = ref('')
const customTo = ref('')
function applyCustom() {
  if (customFrom.value && customTo.value) emit('set-custom-range', customFrom.value, customTo.value)
}
</script>

<style scoped>
.ct-filters {
  padding: 8px 16px 12px;
  border-radius: 16px;
}
.ct-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.ct-field label {
  color: var(--ct-muted);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
}
.ct-select {
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border: 1px solid var(--ct-border-strong);
  border-radius: 6px;
  background: var(--ct-surface);
  color: var(--ct-text);
  font-size: var(--fs-md);
}
.ct-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ct-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ct-brand);
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.ct-filters__error {
  color: var(--ct-up);
  font-size: var(--fs-xs);
}
.ct-filters__note {
  padding: 6px 4px 4px;
  color: var(--ct-faint);
  font-size: var(--fs-xs);
  line-height: 1.5;
}
</style>
