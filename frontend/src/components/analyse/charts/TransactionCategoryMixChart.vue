<template>
  <v-card flat rounded="lg" class="pa-5 mb-4">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-2 flex-wrap ga-2">
      <div>
        <div class="section-title">{{ t('anTxMixTitle') }}</div>
        <div class="section-subtitle">
          <template v-if="loading">{{ t('anDonutLoading') }}</template>
          <template v-else>
            {{ formatNumber(totalTransactions) }} {{ t('anTxMixSubtitle') }}
            <span v-if="excludedPredictedCount" class="tx-warn">
              · {{ excludedPredictedCount }} {{ t('anTxMixPredictExcluded') }}
            </span>
          </template>
        </div>
      </div>
      <v-btn
        v-if="selectedComboKey"
        size="small"
        variant="tonal"
        density="comfortable"
        prepend-icon="mdi-close"
        @click="selectedComboKey = null"
      >
        {{ t('anTxMixClearCombo') }}
      </v-btn>
    </div>

    <v-row class="mt-2" dense>
      <v-col cols="12" md="6">
        <DonutChartCard
          :title="t('anTxMixByCategoryTitle')"
          :subtitle="t('anTxMixDrillHint')"
          :labels="byCategory.labels"
          :item-keys="byCategory.keys"
          :values="byCategory.values"
          :colors="byCategory.colors"
          mode="count"
          :unit-label="t('anTxUnit')"
          show-percent
          :max-legend="MAX_LEGEND"
          clickable
          :loading="loading"
          :selected-labels="selectedComboLabels"
          @slice-click="onComboClick"
        />
      </v-col>
      <v-col cols="12" md="6">
        <DonutChartCard
          :title="t('anTxMixByItemTitle')"
          :subtitle="itemSubtitle"
          :labels="byItem.labels"
          :values="byItem.values"
          :colors="byItem.colors"
          mode="count"
          :unit-label="t('anTxUnit')"
          show-percent
          :max-legend="MAX_LEGEND"
          :loading="loading"
        />
      </v-col>
    </v-row>
  </v-card>
</template>

<script setup>
/**
 * « Répartition des catégories de produits par transaction ».
 *
 * Chaque part = un ENSEMBLE de catégories achetées dans un même panier
 * (« Bières » seule, « Bières, Boissons Soft », …), la valeur = le nombre de
 * transactions. Le donut de droite applique le même calcul au grain ARTICLE ;
 * cliquer une part à gauche le restreint aux paniers de cette combinaison —
 * c'est le drill-down « produits vendus dans cette combinaison ».
 *
 * DEUX ÉCARTS ASSUMÉS aux conventions de la page :
 *
 * 1. `selectedComboKey` reste LOCAL, il ne passe pas par `toggleArrayFilter`.
 *    Une combinaison de catégories n'est pas une dimension de page : ni les KPI,
 *    ni les barres par event, ni les tables article ne savent l'appliquer. La
 *    router dans le store propagerait un filtre que rien d'autre n'honore.
 *
 * 2. Les filtres ARTICLE de la page (article / type / catégorie) ne sont PAS
 *    appliqués aux paniers — seuls les filtres PdV/horaire le sont, en amont
 *    dans AnalyseView. Filtrer un panier par l'une de ses lignes est ambigu
 *    (« contient » vs « uniquement ») et changerait le dénominateur en silence,
 *    donc tous les pourcentages. Question ouverte côté produit ; d'ici là le
 *    sous-titre affiche explicitement le dénominateur retenu.
 */
import { ref, computed } from 'vue'
import DonutChartCard from './DonutChartCard.vue'
import { SHOP_COLORS } from '@/constants/analyseColors'
import { formatNumber } from '@/composables/useFormatters'
import { comboKey, groupBasketsByCombo } from '@/utils/transactionBaskets'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

// Nombre de parts nommées avant le bucket « Autres », calé sur le graphique de
// référence produit. Au-delà, la légende devient illisible et les parts
// indistinguables à l'œil.
const TOP_N = 19
const MAX_LEGEND = 8


const props = defineProps({
  /** BasketComboRecord[] déjà filtrés PdV/horaire par le parent. */
  records: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  /**
   * Mode Predict : events couverts par un scénario, donc SANS panier réel (une
   * prévision produit des quantités par article, pas des tickets). Affiché plutôt
   * que sous-compté en silence.
   */
  excludedPredictedCount: { type: Number, default: 0 },
})

const selectedComboKey = ref(null)
const selectedComboLabels = computed(() => (selectedComboKey.value ? [selectedComboKey.value] : []))

const totalTransactions = computed(() =>
  props.records.reduce((sum, r) => sum + (r.transactionCount || 0), 0),
)

/** Options de groupement partagées par les deux donuts. */
const groupOpts = computed(() => ({
  topN: TOP_N,
  unmatchedLabel: t('anUnmatchedItems'),
  othersLabel: t('anTxMixOthers'),
  palette: SHOP_COLORS,
}))

const byCategory = computed(() => groupBasketsByCombo(props.records, (r) => r.categoryCombo, groupOpts.value))

/** Records du drill-down : restreints à la combinaison sélectionnée, sinon tous. */
const drilledRecords = computed(() => {
  if (!selectedComboKey.value) return props.records
  return props.records.filter(
    (r) => comboKey(r.categoryCombo) === selectedComboKey.value,
  )
})

const byItem = computed(() => groupBasketsByCombo(drilledRecords.value, (r) => r.itemCombo, groupOpts.value))

const itemSubtitle = computed(() => {
  if (!selectedComboKey.value) return t('anTxMixByItemSubtitleAll')
  const idx = byCategory.value.keys.indexOf(selectedComboKey.value)
  return idx >= 0 ? byCategory.value.labels[idx] : t('anTxMixByItemSubtitleAll')
})

function onComboClick(key) {
  // « Autres » agrège N combinaisons hétérogènes : le drill-down n'aurait aucun
  // sens (on afficherait les articles de combinaisons sans rapport entre elles).
  if (key == null) return
  selectedComboKey.value = selectedComboKey.value === key ? null : key
}
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
.tx-warn {
  color: #b26a00;
}
</style>
