<template>
  <v-card flat rounded="lg" class="pa-5 mb-4" :class="{ 'sdp--dark': isDark }">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-2 flex-wrap">
      <div>
        <div class="section-title">
          {{ t('anPieDistributionTitle') }}
          <!-- Rapport de comparaison : les sélections ne filtrent pas (même badge que la répartition par article). -->
          <span v-if="readonly" class="sdp-lock">
            <v-icon size="12" aria-hidden="true">mdi-lock-outline</v-icon>{{ t('anReadOnly') }}
          </span>
        </div>
        <div class="section-subtitle">
          <template v-if="loading">{{ t('anDonutLoading') }}</template>
          <template v-else>
            {{ t('anPieTotalRevenue') }} {{ formatCurrencyDetailed(totalRevenue) }}
            <DeltaPill
              v-if="deltas?.sections?.shopChartRevenue"
              :delta="deltas.sections.shopChartRevenue"
              size="sm"
              class="sdp-delta"
            />
          </template>
        </div>
      </div>
      <v-btn-toggle
        v-model="localMode"
        mandatory
        density="compact"
        class="pill-toggle"
      >
        <v-btn value="quantity" size="small">{{ t('anQuantity') }}</v-btn>
        <v-btn value="revenue" size="small">{{ t('anRevenue') }}</v-btn>
      </v-btn-toggle>
    </div>

    <v-row class="mt-2" dense>
      <v-col cols="12" md="4">
        <DonutChartCard
          :title="t('anPieByShopTitle')"
          report-variant="shop"
          :subtitle="`${byShop.labels.length} ${t('anPieByShopSubtitle')}`"
          :labels="byShop.labels"
          :values="byShop.values"
          :colors="byShop.colors"
          :mode="localMode"
          :max-legend="5"
          clickable
          :loading="loading"
          :readonly="readonly"
          :deltas="modeDeltas?.shop || null"
          :selected-labels="selectedShopIds"
          @slice-click="(label) => emit('shop-click', label)"
        />
      </v-col>
      <v-col cols="12" md="4">
        <DonutChartCard
          :title="t('anPieByTypeTitle')"
          report-variant="shopType"
          :subtitle="`${byType.labels.length} ${t('anPieByTypeSubtitleSuffix')}`"
          :labels="byType.labels"
          :item-keys="byType.keys"
          :values="byType.values"
          :colors="byType.colors"
          :mode="localMode"
          :max-legend="6"
          clickable
          :loading="loading"
          :readonly="readonly"
          :deltas="modeDeltas?.type || null"
          :selected-labels="selectedShopTypes"
          @slice-click="(label) => emit('shop-type-click', label)"
        />
      </v-col>
      <v-col cols="12" md="4">
        <DonutChartCard
          :title="t('anPieByAreaTitle')"
          report-variant="shopArea"
          :subtitle="`${byArea.labels.length} ${t('anPieByAreaSubtitleSuffix')}`"
          :labels="byArea.labels"
          :values="byArea.values"
          :colors="byArea.colors"
          :mode="localMode"
          :max-legend="6"
          clickable
          :loading="loading || areaPending"
          :readonly="readonly"
          :deltas="modeDeltas?.area || null"
          :selected-labels="selectedShopAreas"
          @slice-click="(label) => emit('shop-area-click', label)"
        />
      </v-col>
    </v-row>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTheme } from 'vuetify'
import DonutChartCard from './DonutChartCard.vue'
import DeltaPill from '@/components/space-workspace/shared/DeltaPill.vue'
import { SHOP_COLORS, SHOP_TYPE_COLORS, SHOP_AREA_COLORS } from '@/constants/analyseColors'
import { formatCurrencyDetailed } from '@/composables/useFormatters'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { buildShopDistributionGroups, shopTypeLabel } from '@/utils/shopDistribution'
import { UNATTACHED_SHOP_KEY } from '@/utils/analyseReconciliation'

const { t } = useI18n()

// Dark mode autonome : suit le thème global Vuetify (cf. EventTimelineChart).
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

// Couleur du donut PdV, avec gris dédié au bucket « PdV non rattachés ».
const SHOP_TYPE_COLOR_MAP = { ...SHOP_TYPE_COLORS, [UNATTACHED_SHOP_KEY]: '#B0BEC5' }

const props = defineProps({
  // Data-driven : tous les PdV vendeurs des records reçus (aucun scoping config).
  records: { type: Array, default: () => [] },
  // Phase 2 (records) encore en vol → les 3 donuts affichent leur skeleton dans la
  // carte réelle, au lieu du rectangle générique qui remplaçait toute la carte.
  loading: { type: Boolean, default: false },
  // Mode lecture seule (drawer Comparaison) : aucun clic ne filtre, le store du principal
  // n'est lu ni pour la sélection (surlignage vide) ni pour l'attente du contexte des zones.
  readonly: { type: Boolean, default: false },
  // Écarts vs le rapport de référence : objet complet de computeReportDeltas (ou null).
  // Légendes (shopDistribution[mode].shop|type|area) et total CA (sections.shopChartRevenue).
  deltas: { type: Object, default: null },
})

const emit = defineEmits(['shop-click', 'shop-type-click', 'shop-area-click'])

const store = useStore()
// Lecture seule : la sélection du store appartient au rapport principal, on ne la lit pas.
const selectedShopIds = computed(() => (props.readonly ? [] : store.state.analyse.filters.selectedShopIds || []))
const selectedShopTypes = computed(() => (props.readonly ? [] : store.state.analyse.filters.selectedShopTypes || []))
const selectedShopAreas = computed(() => (props.readonly ? [] : store.state.analyse.filters.selectedShopAreas || []))

const localMode = ref('revenue')

const totalRevenue = computed(() => props.records.reduce((a, r) => a + (r.revenue || 0), 0))

// Le regroupement vit dans `utils/shopDistribution` : le moteur de comparaison (écarts
// réciproques) et l'export produisent leurs tables avec CETTE fonction, pas une copie.
// Data-driven : le bucket sentinelle « PdV non rattachés » reste visible (part grise
// cliquable), c'est de la vente réelle d'un PdV sans type connu.
const groups = computed(() => buildShopDistributionGroups(props.records, localMode.value, {
  palette: SHOP_COLORS,
  typeColors: SHOP_TYPE_COLOR_MAP,
  areaColors: SHOP_AREA_COLORS,
  typeLabel: (key) => shopTypeLabel(key, t),
}))
const byShop = computed(() => groups.value.shop)
const byType = computed(() => groups.value.type)
const byArea = computed(() => groups.value.area)

// Écarts des légendes : suivent le toggle Quantité / CA.
const modeDeltas = computed(() => props.deltas?.shopDistribution?.[localMode.value === 'quantity' ? 'quantity' : 'revenue'] || null)

// `shopArea` n'existe sur un record QU'APRÈS réconciliation avec les FloorElements
// du contexte config — contexte que AnalyseView charge en DIFFÉRÉ (union « All
// Configurations » lancée après le 1er rendu). Entre les deux, byArea est vide :
// on affiche le skeleton, pas un donut blanc. `configContextSettled` couvre la
// fenêtre AVANT le dispatch (où configContextLoading est encore false).
// Le skeleton ne remplace QU'UN donut vide : jamais de flash par-dessus des zones
// déjà affichées (changement de config = les anciennes valeurs restent visibles).
const areaPending = computed(() => {
  if (props.readonly) return false
  const st = store.state.analyse
  if (byArea.value.labels.length || !props.records.length) return false
  if (st.configContextError) return false
  return st.configContextLoading || !st.configContextSettled
})
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

/* ── Dark mode (autonome via isDark) : overrides additifs des couleurs claires
   en dur. Mode clair inchangé. Les donuts internes gèrent leur propre dark. ── */
.sdp-lock {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 99px;
  background: #f1f5f9;
  color: #64748b;
  font-size: var(--fs-xs);
  font-weight: 400;
  vertical-align: middle;
}
.sdp-delta {
  margin-left: 6px;
}
.sdp--dark .sdp-lock {
  background: #273549;
  color: #94a3b8;
}
.sdp--dark .section-title {
  color: #f9fafb;
}
.sdp--dark .section-subtitle {
  color: #94a3b8;
}
</style>
