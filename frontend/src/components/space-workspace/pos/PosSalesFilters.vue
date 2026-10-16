<template>
  <div class="pos-sf">
    <div class="pos-sf__row">
      <button
        v-for="chip in pdvChips"
        :key="chip.id ?? 'all'"
        type="button"
        class="pos-sf__chip"
        :class="{ 'pos-sf__chip--on': elementId === chip.id }"
        :aria-pressed="elementId === chip.id"
        @click="$emit('update:elementId', chip.id)"
      >{{ chip.label }}</button>
    </div>

    <div class="pos-sf__row">
      <button
        v-for="chip in paymentChips"
        :key="chip.id ?? 'all'"
        type="button"
        class="pos-sf__chip"
        :class="{ 'pos-sf__chip--on': paymentMethodId === chip.id }"
        :aria-pressed="paymentMethodId === chip.id"
        @click="$emit('update:paymentMethodId', chip.id)"
      >{{ chip.label }}</button>

      <label class="pos-sf__search">
        <v-icon size="16" class="pos-sf__search-icon">mdi-magnify</v-icon>
        <input
          type="text"
          class="pos-sf__input"
          :value="search"
          :placeholder="t('posSalesSearch')"
          :aria-label="t('posSalesSearchAria')"
          @input="$emit('update:search', $event.target.value)"
        />
      </label>

      <span class="pos-sf__spacer" />
      <v-btn variant="outlined" class="pos-sf__export" :loading="exporting" @click="$emit('export')">
        <v-icon size="16" class="mr-1">mdi-download</v-icon>
        {{ t('posExportCsv') }}
      </v-btn>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

// Filtres de l'historique : PdV et moyen de paiement (chips), recherche, export CSV.
const props = defineProps({
  pdvs: { type: Array, default: () => [] },
  methods: { type: Array, default: () => [] }, // moyens du référentiel
  elementId: { type: String, default: null },
  paymentMethodId: { type: String, default: null },
  search: { type: String, default: '' },
  exporting: { type: Boolean, default: false },
})
defineEmits(['update:elementId', 'update:paymentMethodId', 'update:search', 'export'])

const { t } = useI18n()
const pdvChips = computed(() => [
  { id: null, label: t('posAllPdv') },
  ...props.pdvs.map((p) => ({ id: p.elementId, label: p.name })),
])
const paymentChips = computed(() => [
  { id: null, label: t('posAllPayments') },
  ...props.methods.map((m) => ({ id: m.id, label: m.name })),
])
</script>

<style scoped>
.pos-sf {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pos-sf__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.pos-sf__chip {
  height: 36px;
  padding: 0 14px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: var(--fb-surface, #ffffff);
  color: #374151;
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  cursor: pointer;
}
.pos-sf__chip--on {
  border-color: var(--fb-primary, #d63031);
  background: var(--fb-primary, #d63031);
  color: #ffffff;
}
.pos-sf__search {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: 38px;
  margin-left: 8px;
  padding: 0 12px;
  border: 1px solid #d1d5db;
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-surface, #ffffff);
}
.pos-sf__search-icon {
  color: var(--fb-faint, #9ca3af);
}
.pos-sf__input {
  width: 170px;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--fb-text, #212121);
  font: inherit;
  font-size: var(--fs-base);
}
.pos-sf__spacer {
  flex: 1;
}
.pos-sf__export {
  height: 38px;
  padding: 0 14px;
  border: 1px solid #d1d5db;
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-surface, #ffffff);
  color: var(--fb-text, #212121);
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  letter-spacing: 0;
  text-transform: none;
}
.pos-sf__chip:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
</style>
