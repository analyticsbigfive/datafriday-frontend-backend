<template>
  <!-- Filtres « dimension article rendement » : marque, industriel, fournisseur, promotion,
       type de promotion. Mêmes listes à cocher que les autres dimensions ; les valeurs
       viennent de l'endpoint analyse/article-dimensions (cache partagé). -->
  <v-expansion-panel value="article-dimensions">
    <v-expansion-panel-title class="adf-title" :class="{ 'adf-title--dark': isDark }">
      {{ t('anFilterBrand') }} / {{ t('anFilterIndustrial') }} / {{ t('anFilterSupplier') }}
      <template #actions>
        <v-chip v-if="activeCount" size="x-small" color="primary">{{ activeCount }}</v-chip>
        <v-icon size="18">mdi-chevron-down</v-icon>
      </template>
    </v-expansion-panel-title>
    <v-expansion-panel-text>
      <CheckboxListFilter
        v-for="group in groups"
        :key="group.key"
        :label="group.label"
        :items="group.items"
        :label-fn="labelOf"
        :model-value="filters[group.key] || []"
        @update:model-value="(v) => setFilterImmediate(group.key, v)"
      />
    </v-expansion-panel-text>
  </v-expansion-panel>
</template>

<script setup>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import CheckboxListFilter from './CheckboxListFilter.vue'
import { useFilters } from '@/composables/useFilters'
import { useArticleDimensions } from '@/composables/useArticleDimensions'
import { useI18n } from '@/i18n/useI18n'
import { NOT_SET_KEY, PROMO_YES_KEY, PROMO_NO_KEY } from '@/utils/articleDimensionBreakdown'
import { ARTICLE_DIMENSION_FILTER_KEYS } from '@/utils/articleDimensionFilter'

const { t } = useI18n()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)
const { filters, setFilterImmediate } = useFilters()
const { options } = useArticleDimensions()

const groups = computed(() => [
  { key: 'selectedBrands', label: t('anFilterBrand'), items: options.value.brands },
  { key: 'selectedIndustrials', label: t('anFilterIndustrial'), items: options.value.industrials },
  { key: 'selectedSuppliers', label: t('anFilterSupplier'), items: options.value.suppliers },
  { key: 'selectedPromotions', label: t('anFilterPromotion'), items: [PROMO_YES_KEY, PROMO_NO_KEY] },
  { key: 'selectedPromotionTypes', label: t('anFilterPromotionType'), items: options.value.promotionTypes },
])

const activeCount = computed(() =>
  ARTICLE_DIMENSION_FILTER_KEYS.reduce((n, k) => n + (filters.value?.[k]?.length || 0), 0),
)

// Clés techniques -> texte : « Non renseigné » et promotion oui / non sont traduits ici.
function labelOf(v) {
  if (v === NOT_SET_KEY) return t('anNotSet')
  if (v === PROMO_YES_KEY) return t('anPromoYes')
  if (v === PROMO_NO_KEY) return t('anPromoNo')
  return v
}
</script>

<style scoped>
/* Même kicker plat que les autres en-têtes d'accordéon du panneau (FilterPanel .section-title,
   scoped chez lui donc non hérité par ce composant). */
.adf-title {
  font-size: 0.6875rem;
  font-weight: var(--fw-bold);
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.adf-title--dark {
  color: #94a3b8;
}
</style>
