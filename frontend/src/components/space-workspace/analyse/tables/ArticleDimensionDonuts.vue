<template>
  <!-- 3 donuts rendement SOUS les 3 donuts article : industriel (gauche), marque (milieu),
       coût par fournisseur (droite, toujours en euros). Le calcul vit dans
       utils/articleDimensionBreakdown.js ; ce composant ne fait qu'afficher. -->
  <div class="add-wrap">
    <v-alert
      v-if="status === 'error'"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-3"
    >
      {{ t('anDimensionsError') }}
    </v-alert>
    <v-row dense>
      <v-col cols="12" md="4">
        <DonutChartCard
          :title="t('anByIndustrial')"
          report-variant="industrial"
          :subtitle="t('anSubtitleIndustrials').replace('{n}', countWithoutNotSet(byIndustrial.keys))"
          :labels="byIndustrial.labels"
          :item-keys="byIndustrial.keys"
          :values="byIndustrial.values"
          :colors="byIndustrial.colors"
          :mode="mode"
          :max-legend="6"
          :loading="loading"
          clickable
          :readonly="readonly"
          :deltas="dimDeltas?.industrial || null"
          :selected-labels="selectedIndustrials"
          @slice-click="(key) => emit('industrial-click', key)"
        />
      </v-col>
      <v-col cols="12" md="4">
        <DonutChartCard
          :title="t('anByBrand')"
          report-variant="brand"
          :subtitle="t('anSubtitleBrands').replace('{n}', countWithoutNotSet(byBrand.keys))"
          :labels="byBrand.labels"
          :item-keys="byBrand.keys"
          :values="byBrand.values"
          :colors="byBrand.colors"
          :mode="mode"
          :max-legend="6"
          :loading="loading"
          clickable
          :readonly="readonly"
          :deltas="dimDeltas?.brand || null"
          :selected-labels="selectedBrands"
          @slice-click="(key) => emit('brand-click', key)"
        />
      </v-col>
      <v-col cols="12" md="4">
        <!-- Coût en euros quel que soit le toggle Quantité / CA : mode figé sur 'revenue'
             (format monétaire), et le sous-titre le dit. -->
        <DonutChartCard
          :title="t('anSupplierCost')"
          report-variant="supplier"
          :subtitle="t('anSubtitleSuppliers').replace('{amount}', formatCurrency(bySupplier.total))"
          :labels="bySupplier.labels"
          :item-keys="bySupplier.keys"
          :values="bySupplier.values"
          :colors="bySupplier.colors"
          mode="revenue"
          :max-legend="6"
          :loading="loading"
          clickable
          :readonly="readonly"
          :deltas="deltas?.breakdowns?.supplierCost || null"
          :selected-labels="selectedSuppliers"
          @slice-click="(key) => emit('supplier-click', key)"
        />
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useStore } from 'vuex'
import DonutChartCard from '../charts/DonutChartCard.vue'
import { SHOP_COLORS } from '@/constants/analyseColors'
import { formatCurrency } from '@/composables/useFormatters'
import { useI18n } from '@/i18n/useI18n'
import {
  NOT_SET_KEY,
  recordMetric,
  brandBreakdown,
  industrialBreakdown,
  supplierCostBreakdown,
  entriesToDonut,
} from '@/utils/articleDimensionBreakdown'

const props = defineProps({
  records: { type: Array, default: () => [] },
  // Map menuItemId -> dimensions (endpoint A) ; null tant qu'il n'a pas répondu.
  dimensionsIndex: { type: Object, default: null },
  // 'idle' | 'loading' | 'ready' | 'error'
  status: { type: String, default: 'idle' },
  // Mode du toggle Quantité / CA de la carte parente.
  mode: { type: String, default: 'revenue' },
  // Mode lecture seule (drawer Comparaison) : pas de clic filtrant, sélection vide
  // (les filtres du store du principal ne sont pas lus).
  readonly: { type: Boolean, default: false },
  // Écarts vs le rapport de référence : objet complet de computeReportDeltas (ou null).
  // Industriel / marque suivent `mode` ; le coût fournisseur est toujours en euros.
  deltas: { type: Object, default: null },
})
const emit = defineEmits(['industrial-click', 'brand-click', 'supplier-click'])

const { t } = useI18n()
const store = useStore()

// Squelette tant que l'endpoint A n'a pas répondu ; en erreur, donuts vides + alerte.
const loading = computed(() => props.status === 'loading' || props.status === 'idle')

const labelOf = (key) => (key === NOT_SET_KEY ? t('anNotSet') : key)
const countWithoutNotSet = (keys) => keys.filter((k) => k !== NOT_SET_KEY).length

const ready = computed(() => props.dimensionsIndex != null)
const metric = computed(() => recordMetric(props.mode))
const byIndustrial = computed(() => entriesToDonut(
  ready.value ? industrialBreakdown(props.records, props.dimensionsIndex, metric.value) : [], labelOf, SHOP_COLORS,
))
const byBrand = computed(() => entriesToDonut(
  ready.value ? brandBreakdown(props.records, props.dimensionsIndex, metric.value) : [], labelOf, SHOP_COLORS,
))
const bySupplier = computed(() => entriesToDonut(
  ready.value ? supplierCostBreakdown(props.records, props.dimensionsIndex) : [], labelOf, SHOP_COLORS,
))

const dimDeltas = computed(() => props.deltas?.breakdowns?.[props.mode === 'quantity' ? 'quantity' : 'revenue'] || null)

// Lecture seule : la sélection du store appartient au rapport principal, on ne la lit pas.
const filters = computed(() => (props.readonly ? {} : store.state.analyse.filters || {}))
const selectedIndustrials = computed(() => filters.value.selectedIndustrials || [])
const selectedBrands = computed(() => filters.value.selectedBrands || [])
const selectedSuppliers = computed(() => filters.value.selectedSuppliers || [])
</script>
