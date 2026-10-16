<template>
  <PosCollapsibleCard :title="t('posSettingsTitle')">
    <p class="pos-sc__intro">
      {{ t('posSettingsIntro') }}
      <router-link :to="{ name: 'payment-methods' }" class="pos-sc__link">{{ t('posSettingsMethodsLink') }}</router-link>
    </p>

    <v-alert v-if="notice" type="error" variant="tonal" density="compact" rounded="lg">{{ notice }}</v-alert>

    <div class="pos-sc__list">
      <PosPaymentMethodsList
        :methods="methods"
        :selected-ids="selectedIds"
        :disabled="disabled"
        @toggle="$emit('toggle-method', $event)"
      />
      <PosSettingRow
        :label="t('posSettingPromos')"
        :hint="t('posSettingPromosHint')"
        :model-value="settings.promosEnabled"
        :disabled="disabled"
        @update:model-value="$emit('save', { promosEnabled: $event })"
      />
      <PosSettingRow
        :label="t('posSettingCancel')"
        :hint="t('posSettingCancelHint')"
        :model-value="settings.cancelEnabled"
        :disabled="disabled"
        @update:model-value="$emit('save', { cancelEnabled: $event })"
      />
      <PosSettingRow
        :label="t('posSettingTips')"
        :hint="t('posSettingTipsHint')"
        :model-value="settings.tipsEnabled"
        :disabled="disabled"
        @update:model-value="$emit('save', { tipsEnabled: $event })"
      />
      <PosLowStockField
        :model-value="settings.lowStockUnits"
        :disabled="disabled"
        @update:model-value="$emit('save', { lowStockUnits: $event })"
      />
    </div>
  </PosCollapsibleCard>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import PosCollapsibleCard from './PosCollapsibleCard.vue'
import PosLowStockField from './PosLowStockField.vue'
import PosPaymentMethodsList from './PosPaymentMethodsList.vue'
import PosSettingRow from './PosSettingRow.vue'

// Réglages de caisse valables pour tous les PdV de l'évènement.
defineProps({
  settings: { type: Object, required: true }, // PosEventSetting
  methods: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  notice: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
defineEmits(['save', 'toggle-method'])

const { t } = useI18n()
</script>

<style scoped>
.pos-sc__intro {
  margin: 0;
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-base);
  line-height: 1.4;
}
.pos-sc__link {
  color: var(--fb-primary, #d63031);
  font-weight: var(--fw-semibold);
  text-decoration: none;
}
.pos-sc__link:hover {
  text-decoration: underline;
}
.pos-sc__list {
  display: flex;
  flex-direction: column;
}
</style>
