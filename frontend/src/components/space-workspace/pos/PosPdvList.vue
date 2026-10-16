<template>
  <div class="pos-list">
    <v-progress-linear v-if="loading" indeterminate color="#ff3131" height="3" rounded />

    <PosPdvCard
      v-for="pdv in pdvs"
      :key="pdv.elementId"
      :pdv="pdv"
      :hr-options="hrOptions"
      :can-edit-responsible="canEditResponsible"
      :can-manage="canManage"
      :working="!!working[pdv.elementId]"
      @toggle="$emit('toggle', $event)"
      @open-cashier="$emit('open-cashier', $event)"
      @set-responsible="(row, id, name) => $emit('set-responsible', row, id, name)"
      @reset-pin="$emit('reset-pin', $event)"
    />

    <div v-if="!loading && !pdvs.length" class="pos-list__empty">
      {{ hasPdvs ? t('posNoPdvMatch') : t('posNoPdvInConfig') }}
    </div>

    <PosAccessWarning />
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import PosAccessWarning from './PosAccessWarning.vue'
import PosPdvCard from './PosPdvCard.vue'

// Onglet « Points de vente » : une carte par PdV filtré, puis l'avertissement sur les sources.
defineProps({
  pdvs: { type: Array, default: () => [] },
  hasPdvs: { type: Boolean, default: false }, // false = l'évènement n'a aucun PdV en configuration
  hrOptions: { type: Array, default: () => [] },
  canEditResponsible: { type: Boolean, default: true },
  canManage: { type: Boolean, default: false },
  working: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
})
defineEmits(['toggle', 'open-cashier', 'set-responsible', 'reset-pin'])

const { t } = useI18n()
</script>

<style scoped>
.pos-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 8px;
}
.pos-list__empty {
  padding: 32px;
  border: 1px dashed #d1d5db;
  border-radius: var(--fb-radius-card, 16px);
  background: var(--fb-surface, #ffffff);
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-md);
  text-align: center;
}
</style>
