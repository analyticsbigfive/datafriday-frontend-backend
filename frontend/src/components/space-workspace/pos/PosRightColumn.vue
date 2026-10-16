<template>
  <div class="pos-right">
    <PosSalesSummaryCard :pdvs="pdvs" :total-revenue="totalRevenue" :is-live="isLive" />
    <PosSettingsCard
      v-if="settings"
      :settings="settings"
      :methods="methods"
      :selected-ids="selectedIds"
      :notice="notice"
      :disabled="saving"
      @save="$emit('save', $event)"
      @toggle-method="$emit('toggle-method', $event)"
    />
    <PosStockCard />
  </div>
</template>

<script setup>
import PosSalesSummaryCard from './PosSalesSummaryCard.vue'
import PosSettingsCard from './PosSettingsCard.vue'
import PosStockCard from './PosStockCard.vue'

// Colonne droite repliable : ventes POS par PdV, réglages de caisse, stock en direct.
defineProps({
  pdvs: { type: Array, default: () => [] },
  totalRevenue: { type: Number, default: 0 },
  isLive: { type: Boolean, default: false },
  settings: { type: Object, default: null },
  methods: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  notice: { type: String, default: '' },
  saving: { type: Boolean, default: false },
})
defineEmits(['save', 'toggle-method'])
</script>

<style scoped>
.pos-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  padding-right: 4px;
  overflow-y: auto;
}
</style>
