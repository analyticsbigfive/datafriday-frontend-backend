<template>
  <!-- Section Promotion, sous « Répartition du CA par article » : 2 donuts sur 2 colonnes.
       Un article en promo est un MenuItem distinct portant une fiche Promotion ; le calcul
       vit dans utils/articleDimensionBreakdown.js. -->
  <v-card flat rounded="lg" class="pa-5 mb-4" :class="{ 'promo--dark': isDark }">
    <div class="mb-3">
      <div class="section-title">{{ t('anPromotionTitle') }}</div>
      <div class="section-subtitle">
        {{ t('anPromotionSubtitle').replace('{amount}', formatCurrency(discount.amount)) }}
        <!-- Écart de la remise accordée vs le rapport de référence (mode Comparaison). -->
        <DeltaPill v-if="deltas?.discount" :delta="deltas.discount" size="sm" class="promo-delta" />
      </div>
      <div v-if="discount.withoutReference > 0" class="section-subtitle">
        {{ t('anPromotionNoReference').replace('{n}', discount.withoutReference) }}
      </div>
    </div>
    <v-alert v-if="status === 'error'" type="warning" variant="tonal" density="compact" class="mb-3">
      {{ t('anDimensionsError') }}
    </v-alert>
    <v-row dense>
      <v-col cols="12" md="6">
        <DonutChartCard
          :title="t('anPromoYesNo')"
          :subtitle="t('anPromoYesNoSub')"
          :labels="yesNo.labels"
          :item-keys="yesNo.keys"
          :values="yesNo.values"
          :colors="yesNo.colors"
          :mode="mode"
          :max-legend="6"
          :loading="loading"
          clickable
          :readonly="readonly"
          :deltas="dimDeltas?.promotion || null"
          :selected-labels="selectedPromotions"
          @slice-click="(key) => emit('promotion-click', key)"
        />
      </v-col>
      <v-col cols="12" md="6">
        <DonutChartCard
          :title="t('anPromoType')"
          :subtitle="t('anPromoTypeSub').replace('{n}', byType.keys.filter((k) => k !== NOT_SET_KEY).length)"
          :labels="byType.labels"
          :item-keys="byType.keys"
          :values="byType.values"
          :colors="byType.colors"
          :mode="mode"
          :max-legend="6"
          :loading="loading"
          clickable
          :readonly="readonly"
          :deltas="dimDeltas?.promotionType || null"
          :selected-labels="selectedTypes"
          @slice-click="(key) => emit('promotion-type-click', key)"
        />
      </v-col>
    </v-row>
  </v-card>
</template>

<script setup>
import { computed } from 'vue'
import { useStore } from 'vuex'
import { useTheme } from 'vuetify'
import DonutChartCard from '../charts/DonutChartCard.vue'
import DeltaPill from '@/components/space-workspace/shared/DeltaPill.vue'
import { SHOP_COLORS } from '@/constants/analyseColors'
import { formatCurrency } from '@/composables/useFormatters'
import { useI18n } from '@/i18n/useI18n'
import {
  NOT_SET_KEY,
  PROMO_YES_KEY,
  recordMetric,
  promotionBreakdown,
  promotionTypeBreakdown,
  promotionDiscount,
  entriesToDonut,
} from '@/utils/articleDimensionBreakdown'

const props = defineProps({
  records: { type: Array, default: () => [] },
  dimensionsIndex: { type: Object, default: null },
  status: { type: String, default: 'idle' },
  // Mode du toggle Quantité / CA de la carte « Répartition du CA par article ».
  mode: { type: String, default: 'revenue' },
  // Mode lecture seule (drawer Comparaison) : pas de clic filtrant, sélection vide.
  readonly: { type: Boolean, default: false },
  // Écarts vs le rapport de référence : objet complet de computeReportDeltas (ou null).
  deltas: { type: Object, default: null },
})
const emit = defineEmits(['promotion-click', 'promotion-type-click'])

const { t } = useI18n()
const store = useStore()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const loading = computed(() => props.status === 'loading' || props.status === 'idle')
const ready = computed(() => props.dimensionsIndex != null)
const metric = computed(() => recordMetric(props.mode))

const yesNoLabel = (key) => t(key === PROMO_YES_KEY ? 'anPromoYes' : 'anPromoNo')
const typeLabel = (key) => (key === NOT_SET_KEY ? t('anNotSet') : key)

const yesNo = computed(() => entriesToDonut(
  ready.value ? promotionBreakdown(props.records, props.dimensionsIndex, metric.value) : [], yesNoLabel, SHOP_COLORS,
))
const byType = computed(() => entriesToDonut(
  ready.value ? promotionTypeBreakdown(props.records, props.dimensionsIndex, metric.value) : [], typeLabel, SHOP_COLORS,
))
const discount = computed(() => (
  ready.value ? promotionDiscount(props.records, props.dimensionsIndex) : { amount: 0, withoutReference: 0 }
))

const dimDeltas = computed(() => props.deltas?.breakdowns?.[props.mode === 'quantity' ? 'quantity' : 'revenue'] || null)

// Lecture seule : la sélection du store appartient au rapport principal, on ne la lit pas.
const filters = computed(() => (props.readonly ? {} : store.state.analyse.filters || {}))
const selectedPromotions = computed(() => filters.value.selectedPromotions || [])
const selectedTypes = computed(() => filters.value.selectedPromotionTypes || [])
</script>

<style scoped>
.section-title {
  font-size: var(--fs-md);
  font-weight: 600;
  color: #212121;
}
.section-subtitle {
  font-size: var(--fs-sm);
  color: #757575;
  margin-top: 2px;
}
.promo-delta {
  margin-left: 6px;
  vertical-align: middle;
}
.promo--dark .section-title {
  color: #f9fafb;
}
.promo--dark .section-subtitle {
  color: #94a3b8;
}
</style>
