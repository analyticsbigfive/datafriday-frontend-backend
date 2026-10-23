<template>
  <v-app class="ct-app">
    <WorkspaceAppHeader :space-name="spaceName" :kpis="model.headerKpis.value" show-home />
    <v-main>
      <div class="ct-view">
        <div class="ct-body" :class="{ 'ct-body--collapsed': !leftOpen }">
          <CostTrackingLeftColumn
            v-if="leftOpen"
            :period="ct.period.value"
            :presets="PERIOD_PRESETS"
            :range-valid="ct.rangeValid.value"
            :type-id="ct.typeId.value"
            :category-id="ct.categoryId.value"
            :menu-item-id="ct.menuItemId.value"
            :ingredient-id="ct.ingredientId.value"
            :type-options="ct.typeOptions.value"
            :category-options="ct.categoryOptions.value"
            :article-options="ct.articleOptions.value"
            :ingredient-options="ct.ingredientOptions.value"
            :show-margin="showMargin"
            :show-price="ct.showPrice.value"
            :can-margin="model.canMargin.value"
            @set-period="ct.setPeriod"
            @set-custom-range="ct.setCustomRange"
            @set-type="ct.setType"
            @set-category="ct.setCategory"
            @set-article="ct.setArticle"
            @set-ingredient="ct.setIngredient"
            @reset="ct.resetFilters"
            @update:show-margin="showMargin = $event"
            @update:show-price="ct.showPrice.value = $event"
          />

          <main class="ct-main">
            <CostTrackingBanner
              :title="t('ctBannerTitle').replace('{space}', spaceName)"
              :subtitle="bannerSubtitle"
              :left-open="leftOpen"
              @toggle-left="leftOpen = !leftOpen"
            />
            <CostTrackingFilterChips
              :period-label="model.periodLabel.value"
              :chips="model.chips.value"
              :count-label="model.countLabel.value"
              @remove="removeChip"
            />
            <CostTrackingBaselineNotice
              v-if="model.notice.value"
              :started-at="model.notice.value.startedAt"
              :first-event="model.notice.value.firstEvent"
            />
            <CostTrackingChartCard
              :group-by="ct.groupBy.value"
              :state="model.chartState.value"
              :chart-model="ct.chartModel"
              :series="ct.visibleSeries.value"
              :legend-rows="model.legendRows.value"
              :bounds="ct.bounds.value"
              :show-margin="showMargin && model.canMargin.value"
              :show-price="ct.showPrice.value"
              :with-events="ct.events.value.length > 0"
              :can-ingredient="!!ct.menuItemId.value"
              :truncated="ct.truncated.value"
              :ranked-by-revenue="ct.rankedByRevenue.value"
              @set-group-by="ct.setGroupBy"
              @toggle-line="ct.toggleLine"
              @retry="ct.reload"
            />
            <CostTrackingTable
              :rows="model.rows.value"
              :group-by="ct.groupBy.value"
              @select="ct.drill"
              @history="ct.selectArticle"
            />
          </main>

          <CostTrackingSummaryPanel
            :rows="model.rows.value"
            :changes="model.changes.value"
            :since-label="model.sinceLabel.value"
            :group-by="ct.groupBy.value"
            :aggregate="ct.aggregate.value"
            @update:aggregate="ct.aggregate.value = $event"
            @drill="ct.drill"
            @select="ct.selectArticle"
          />
        </div>

        <CostTrackingHistoryDrawer
          :open="!!ct.selectedArticleId.value"
          :history="ct.history.value"
          :loading="ct.historyLoading.value"
          :error="ct.historyError.value"
          :tags="model.selectedTags.value"
          @close="ct.closeHistory"
        />
      </div>
    </v-main>
  </v-app>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { PERIOD_PRESETS, useCostTracking } from '@/composables/useCostTracking'
import { useCostTrackingPageModel } from '@/composables/useCostTrackingPageModel'
import WorkspaceAppHeader from '@/components/WorkspaceAppHeader.vue'
import CostTrackingBanner from '../CostTrackingBanner.vue'
import CostTrackingBaselineNotice from '../CostTrackingBaselineNotice.vue'
import CostTrackingChartCard from '../CostTrackingChartCard.vue'
import CostTrackingFilterChips from '../CostTrackingFilterChips.vue'
import CostTrackingHistoryDrawer from '../CostTrackingHistoryDrawer.vue'
import CostTrackingLeftColumn from '../CostTrackingLeftColumn.vue'
import CostTrackingSummaryPanel from '../CostTrackingSummaryPanel.vue'
import CostTrackingTable from '../CostTrackingTable.vue'

// Page Cost tracking du workspace : orchestration seulement. Filtres, chargement et historique
// sont dans useCostTracking, la présentation dérivée dans useCostTrackingPageModel, les blocs
// dans ../CostTracking*.vue.
const route = useRoute()
const store = useStore()
const { t } = useI18n()

const spaceId = computed(() => String(route.params.spaceId || ''))
const enabled = computed(() => {
  const can = store.getters['auth/can']
  return typeof can === 'function' ? !!can('front.fb.costTracking') : true
})

const ct = useCostTracking({ spaceId, enabled })
const model = useCostTrackingPageModel(ct)

const wide = typeof window === 'undefined' ? true : window.innerWidth >= 1100
const leftOpen = ref(wide)
const showMargin = ref(false)

const spaceName = computed(
  () => (store.getters['spaces/spaces'] || []).find((s) => s.id === spaceId.value)?.name || '',
)

const bannerSubtitle = computed(() =>
  t('ctBannerSub')
    .replace('{count}', model.countLabel.value)
    .replace('{versions}', String(model.versionsTotal.value)),
)

// Retirer une pastille : un type vide tout, une catégorie vide aussi l'article, un article vide
// aussi l'ingrédient.
function removeChip(key) {
  if (key === 'type') ct.resetFilters()
  else if (key === 'category') {
    ct.setArticle(null)
    ct.setCategory(null)
  } else if (key === 'article') ct.setArticle(null)
  else ct.setIngredient(null)
}

onMounted(() => {
  store.dispatch('spaces/fetchSpaces').catch(() => {})
})
</script>

<style scoped>
.ct-view {
  --ct-bg: #f6f8fb;
  --ct-surface: #ffffff;
  --ct-subtle: #fafafa;
  --ct-border: #eeeeee;
  --ct-border-strong: #e0e0e0;
  --ct-text: #212121;
  --ct-muted: #6b7280;
  --ct-faint: #757575;
  --ct-label: #475569;
  --ct-brand: #ff3131;
  --ct-brand-soft: #fff5f5;
  --ct-up: #d93f1f;
  --ct-down: #2e9e4f;
  --ct-grid: #eceff3;
  --ct-shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
  --ct-chip-market-bg: #e8f0fe;
  --ct-chip-market-fg: #2f5fc7;
  --ct-chip-recipe-bg: #f3e5f5;
  --ct-chip-recipe-fg: #8a2fa0;
  --ct-chip-filter-bg: #ede9fe;
  --ct-chip-filter-fg: #5b21b6;
  --ct-chip-plain-bg: #f1f3f5;
  --ct-chip-plain-fg: #1e293b;
  --ct-warn-bg: #fbf5e6;
  --ct-warn-fg: #e8960c;
  --ct-warn-fg-2: #b7791f;
  --ct-s1: #ff6e4a; --ct-s2: #5b8def; --ct-s3: #66bb6a; --ct-s4: #ab47bc; --ct-s5: #ffb300;
  --ct-s6: #26a69a; --ct-s7: #8d6e63; --ct-s8: #ec407a; --ct-s9: #78909c; --ct-s10: #3f51b5;

  /* Page à hauteur d'écran : chaque colonne défile verticalement, la page ne défile pas. */
  height: calc(100vh - 64px);
  overflow: hidden;
  background: var(--ct-bg);
  color: var(--ct-text);
  font-size: var(--fs-base);
}
.v-theme--dataFridayDark .ct-view,
.dark .ct-view {
  --ct-bg: #111827;
  --ct-surface: #1f2937;
  --ct-subtle: #263548;
  --ct-border: #2d3f55;
  --ct-border-strong: #3a4d66;
  --ct-text: #fafafa;
  --ct-muted: #aab4c3;
  --ct-faint: #94a3b8;
  --ct-label: #cbd5e1;
  --ct-brand-soft: #3a1f1f;
  --ct-up: #ff8a6e;
  --ct-down: #81c784;
  --ct-grid: #2d3f55;
  --ct-shadow: none;
  --ct-chip-market-bg: #1e2c4a;
  --ct-chip-market-fg: #9db8f2;
  --ct-chip-recipe-bg: #2e1a33;
  --ct-chip-recipe-fg: #d9a3e6;
  --ct-chip-filter-bg: #2e2552;
  --ct-chip-filter-fg: #c4b5fd;
  --ct-chip-plain-bg: #263548;
  --ct-chip-plain-fg: #e2e8f0;
  --ct-warn-bg: #3a2e14;
  --ct-warn-fg: #ffc94d;
  --ct-warn-fg-2: #e6b94a;
  --ct-s1: #ff8a6e; --ct-s2: #7da8f5; --ct-s3: #81c784; --ct-s4: #ba68c8; --ct-s5: #ffc94d;
  --ct-s6: #4db6ac; --ct-s7: #bcaaa4; --ct-s8: #f06292; --ct-s9: #90a4ae; --ct-s10: #7986cb;
}

.ct-body {
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr) 340px;
  align-items: start;
  gap: 18px;
  max-width: 1840px;
  height: 100%;
  margin: 0 auto;
  padding: 18px 24px 0;
}
.ct-body > * {
  align-self: stretch;
  min-height: 0;
  max-height: 100%;
  overflow-y: auto;
  padding-bottom: 24px;
  overscroll-behavior: contain;
}
.ct-body--collapsed {
  grid-template-columns: minmax(0, 1fr) 340px;
}
.ct-main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
@media (max-width: 1280px) {
  .ct-view {
    height: auto;
    overflow: visible;
  }
  .ct-body {
    height: auto;
  }
  .ct-body > * {
    max-height: none;
    overflow: visible;
  }
  .ct-body {
    grid-template-columns: 292px minmax(0, 1fr);
  }
  .ct-body--collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .ct-body > :last-child:not(.ct-main) {
    grid-column: 1 / -1;
  }
}
@media (max-width: 820px) {
  .ct-body,
  .ct-body--collapsed {
    grid-template-columns: minmax(0, 1fr);
    padding: 12px 16px 20px;
  }
}
</style>

<!-- Styles partagés par les blocs de la page : cartes, tendances, pastilles de cause. -->
<style>
.ct-view .ct-card {
  padding: 14px 16px;
  border: 1px solid var(--ct-border);
  border-radius: 12px;
  background: var(--ct-surface);
  box-shadow: var(--ct-shadow);
}
.ct-view .ct-card__title {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}
.ct-view .ct-card__sub {
  margin-top: 2px;
  color: var(--ct-faint);
  font-size: var(--fs-sm);
}
.ct-view .ct-delta {
  font-weight: var(--fw-semibold);
}
.ct-view .ct-delta--up { color: var(--ct-up); }
.ct-view .ct-delta--down { color: var(--ct-down); }
.ct-view .ct-delta--flat { color: var(--ct-faint); }
.ct-view .ct-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  white-space: nowrap;
}
.ct-view .ct-chip--market { background: var(--ct-chip-market-bg); color: var(--ct-chip-market-fg); }
.ct-view .ct-chip--recipe { background: var(--ct-chip-recipe-bg); color: var(--ct-chip-recipe-fg); }
.ct-view .ct-chip--base {
  background: var(--ct-subtle);
  color: var(--ct-muted);
  border: 1px solid var(--ct-border-strong);
}
</style>
