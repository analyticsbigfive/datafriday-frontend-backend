<template>
  <!-- Colonne droite de la grille .an-body (ex v-navigation-drawer) : la
       largeur et le repli sont pilotés par la grille d'AnalyseView (pattern
       EventPredict .ep-metrics). -->
  <aside class="summary-panel" :class="{ 'summary-panel--dark': isDark }">
    <!-- BUG-285 : voile squelette pendant le recalcul des filtres (clic segment). -->
    <AnalyseSkeletonVeil :active="filtersRecomputing" />
    <div class="pa-4 sp-card">
      <!-- Sous-sections repliables (parité visuelle avec le menu de gauche :
           Affluence, Filtres avancés, etc.). Le chatbot est replié par défaut. -->
      <v-expansion-panels
        v-model="openPanels"
        variant="accordion"
        multiple
        class="summary-accordion"
      >
        <!-- 1. Assistant IA (replié par défaut) -->
        <v-expansion-panel value="assistant" elevation="0">
          <v-expansion-panel-title class="px-2 py-2">
            <span class="section-title">{{ t('anDataAnalysis') }}</span>
            <v-icon size="14" color="#9E9E9E" class="ml-1">
              mdi-information-outline
            </v-icon>
          </v-expansion-panel-title>
          <v-expansion-panel-text class="px-0">

      <v-text-field
        v-model="aiQuery"
        variant="outlined"
        density="compact"
        hide-details
        :placeholder="t('anQueryPlaceholder')"
        class="mb-2"
        @keydown.enter.exact.prevent="runAnalyze"
      />
      <v-btn
        block
        class="analyze-btn mb-2"
        :loading="analyzing"
        :disabled="!aiQuery.trim()"
        @click="runAnalyze"
      >
        {{ t('anAnalyze') }}
      </v-btn>

      <!-- Toggle : compréhension sémantique (Transformers.js) -->
      <div class="semantic-toggle mb-3">
        <v-switch
          v-model="useSemantic"
          density="compact"
          hide-details
          color="#7C4DFF"
          @update:model-value="ensureSemanticLoaded"
        >
          <template #label>
            <span class="semantic-label">
              {{ t('anSmartUnderstanding') }}
              <v-tooltip location="bottom" max-width="260">
                <template #activator="{ props: tooltipProps }">
                  <v-icon
                    v-bind="tooltipProps"
                    size="12"
                    color="#9E9E9E"
                    class="ml-1"
                  >
                    mdi-help-circle-outline
                  </v-icon>
                </template>
                {{ t('anSemanticTooltip') }}
              </v-tooltip>
            </span>
          </template>
        </v-switch>
        <v-progress-linear
          v-if="semanticLoading"
          :model-value="semanticProgress"
          color="#7C4DFF"
          height="3"
          class="mt-1"
        />
        <div v-if="semanticLoading" class="semantic-hint">
          {{ t('anModelDownloading') }} {{ semanticProgress }} %
        </div>
      </div>

      <!-- Tour d'horizon : visible si pas de réponse, replie sinon -->
      <div v-if="!assistantResult" class="tour-panel mb-4">
        <div
          v-for="group in suggestionGroups"
          :key="group.id"
          class="tour-group"
        >
          <div class="tour-group-header">
            <v-icon size="12" color="#7C4DFF" class="mr-1">{{ group.icon }}</v-icon>
            <span>{{ group.label }}</span>
          </div>
          <div class="tour-chips">
            <v-chip
              v-for="q in group.items"
              :key="q"
              size="x-small"
              variant="tonal"
              color="#7C4DFF"
              class="mr-1 mb-1"
              @click="runAnalyze(q)"
            >
              {{ q }}
            </v-chip>
          </div>
        </div>
      </div>

      <!-- Réponse de l'assistant -->
      <v-expand-transition>
        <div v-if="assistantResult" class="assistant-card mb-4">
          <div class="assistant-header">
            <v-icon size="14" color="#7C4DFF" class="mr-1">mdi-robot-happy-outline</v-icon>
            <span class="assistant-title">{{ t('anPanelAssistant') }}</span>
            <v-chip
              v-if="assistantResult?.semantic"
              size="x-small"
              variant="tonal"
              color="#7C4DFF"
              class="ml-2"
              :title="t('anSemanticMatch')"
            >
              <v-icon size="10" class="mr-1">mdi-brain</v-icon>
              {{ t('anPanelAi') }}
            </v-chip>
            <v-spacer />
            <v-btn
              icon
              size="x-small"
              variant="text"
              @click="clearAssistant"
              :title="t('anClear')"
            >
              <v-icon size="14">mdi-close</v-icon>
            </v-btn>
          </div>
          <div class="assistant-body" v-html="renderedAnswer" />
          <div v-if="!assistantResult.ok" class="assistant-tip">
            {{ t('anAssistantTip') }}
          </div>
        </div>
      </v-expand-transition>

          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- 2. Performance des PdV (ouvert par défaut) -->
        <v-expansion-panel value="shops" elevation="0">
          <v-expansion-panel-title class="px-2 py-2">
            <span class="section-title">{{ t('anShopPerformance') }}</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text class="px-0">

      <div class="d-flex align-center justify-end mb-2">
        <v-btn-toggle v-model="shopMode" mandatory density="compact" class="pill-toggle">
          <v-btn value="total" size="x-small">{{ t('anTotal') }}</v-btn>
          <v-btn value="avg" size="x-small">{{ t('anAvg') }}</v-btn>
        </v-btn-toggle>
      </div>

      <div class="lb-list mb-2">
        <div
          v-for="(item, idx) in (showAllShops ? topShops : topShops.slice(0, 5))"
          :key="item.name"
          class="lb-card lb-card--pos sp-clickable"
          :class="{ 'lb-card--active': selectedShopNames.includes(item.name) }"
          role="button"
          tabindex="0"
          @click="$emit('shop-click', item.name)"
          @keydown.enter="$emit('shop-click', item.name)"
        >
          <div class="lb-top">
            <v-avatar size="24" :color="rankColor(idx + 1)" class="rank-badge">
              <span class="rank-num">{{ idx + 1 }}</span>
            </v-avatar>
            <span class="item-name lb-name">{{ item.name }}</span>
            <span class="item-value lb-val">
              {{ formatCurrencyDetailed(shopMode === 'avg' ? item.avgRevenue : item.revenue) }}
            </span>
          </div>
          <div class="lb-sub">
            <span v-if="item.transactionRate != null" class="txn-rate-chip">
              <v-icon size="11" class="mr-1">mdi-pulse</v-icon>
              {{ item.transactionRate.toFixed(2) }} {{ t('anPanelTxnPerMin') }}
            </span>
            <span class="lb-spacer"></span>
            <span class="item-units-below">
              {{ formatNumber(shopMode === 'avg' ? item.avgUnits : item.units) }}
              {{ shopMode === 'avg' ? `${t('anUnits')} ${t('anPerEvent')}` : t('anUnits') }}
            </span>
          </div>
          <div class="lb-meter">
            <i :style="{ width: shareWidth(shopMode === 'avg' ? item.avgRevenue : item.revenue, maxShopRevenue) }"></i>
          </div>
        </div>
      </div>

      <v-btn
        v-if="topShops.length > 5"
        variant="text"
        size="small"
        block
        class="show-all-btn"
        @click="showAllShops = !showAllShops"
      >
        <v-icon size="16" class="mr-1">{{ showAllShops ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        {{ showAllShops ? t('anCollapse') : `${t('anSeeAll')} (${topShops.length})` }}
      </v-btn>

          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- 3. Performance des évènements (ouvert par défaut) -->
        <v-expansion-panel value="events" elevation="0">
          <v-expansion-panel-title class="px-2 py-2">
            <span class="section-title">{{ t('anEventsPerformance') }}</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text class="px-0">

      <div class="lb-list">
        <div
          v-for="(item, idx) in (showAllEvents ? topEvents : topEvents.slice(0, 5))"
          :key="item.id"
          class="lb-card lb-card--events sp-clickable"
          :class="{ 'lb-card--active': selectedEventIds.includes(item.id) }"
          role="button"
          tabindex="0"
          @click="$emit('event-click', item.id)"
          @keydown.enter="$emit('event-click', item.id)"
        >
          <div class="lb-top">
            <v-avatar size="24" color="#0E9F8F" class="rank-badge event-rank">
              <span class="rank-num">{{ idx + 1 }}</span>
            </v-avatar>
            <span class="item-name lb-name">{{ item.name }}</span>
            <span class="item-value event-value lb-val">
              {{ formatCurrencyDetailed(item.revenue) }}
            </span>
          </div>
          <div class="lb-sub">
            <span class="item-rate lb-date">{{ formatEventDate(item.date) }}</span>
            <span class="lb-spacer"></span>
            <span class="item-units-below">{{ formatNumber(item.units) }} {{ t('anUnits') }}</span>
          </div>
          <div class="lb-meter">
            <i :style="{ width: shareWidth(item.revenue, maxEventRevenue) }"></i>
          </div>
        </div>
      </div>

      <v-btn
        v-if="topEvents.length > 5"
        variant="text"
        size="small"
        block
        class="show-all-btn"
        @click="showAllEvents = !showAllEvents"
      >
        <v-icon size="16" class="mr-1">{{ showAllEvents ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        {{ showAllEvents ? t('anCollapse') : `${t('anSeeAll')} (${topEvents.length})` }}
      </v-btn>

          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- 3. Performance des articles (ouvert par défaut) -->
        <v-expansion-panel value="items" elevation="0">
          <v-expansion-panel-title class="px-2 py-2">
            <span class="section-title">{{ t('anItemPerformance') }}</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text class="px-0">

      <!-- Bascule du regroupement (17/08) : une ligne par article, ou fusion
           des articles partageant un même DisplayName (référentiel N→1). -->
      <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
        <v-btn-toggle v-model="itemGroupingMode" mandatory density="compact" class="pill-toggle">
          <v-btn value="menuItem" size="x-small">{{ t('anGroupByItem') }}</v-btn>
          <v-btn
            value="displayName"
            size="x-small"
            :disabled="!hasDisplayNames"
            :title="hasDisplayNames ? undefined : t('anNoDisplayName')"
          >{{ t('anGroupByDisplayName') }}</v-btn>
        </v-btn-toggle>
        <v-btn-toggle v-model="menuMode" mandatory density="compact" class="pill-toggle">
          <v-btn value="total" size="x-small">{{ t('anTotal') }}</v-btn>
          <v-btn value="avg" size="x-small">{{ t('anAvg') }}</v-btn>
        </v-btn-toggle>
      </div>

      <div class="lb-list">
        <div
          v-for="(item, idx) in (showAllItems ? topItems : topItems.slice(0, 5))"
          :key="item.key"
          class="lb-card lb-card--items sp-clickable"
          role="button"
          tabindex="0"
          @click="$emit('item-click', item.memberNames)"
          @keydown.enter="$emit('item-click', item.memberNames)"
        >
          <div class="lb-top">
            <v-avatar size="24" :color="rankColor(idx + 1)" class="rank-badge">
              <span class="rank-num">{{ idx + 1 }}</span>
            </v-avatar>
            <span class="item-name lb-name">{{ item.name }}</span>
            <span class="item-value lb-val">{{ formatCurrencyDetailed(menuMode === 'avg' ? item.avgRevenue : item.revenue) }}</span>
          </div>
          <div class="lb-sub">
            <span class="lb-spacer"></span>
            <span v-if="item.itemCount > 1" class="item-units-below mr-2">
              {{ item.itemCount }} {{ t('anItemsCount') }}
            </span>
            <span v-if="menuMode === 'avg'" class="item-units-below">
              {{ formatNumber(item.avgUnits) }} {{ t('anUnits') }} {{ t('anPerEvent') }}
            </span>
            <span v-else-if="item.units != null" class="item-units-below">
              {{ formatNumber(item.units) }} {{ t('anUnits') }}
            </span>
          </div>
          <div class="lb-meter">
            <i :style="{ width: shareWidth(menuMode === 'avg' ? item.avgRevenue : item.revenue, maxItemRevenue) }"></i>
          </div>
        </div>
      </div>

      <v-btn
        v-if="topItems.length > 5"
        variant="text"
        size="small"
        block
        class="show-all-btn"
        @click="showAllItems = !showAllItems"
      >
        <v-icon size="16" class="mr-1">{{ showAllItems ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        {{ showAllItems ? t('anCollapse') : `${t('anSeeAll')} (${topItems.length})` }}
      </v-btn>

          </v-expansion-panel-text>
        </v-expansion-panel>

      </v-expansion-panels>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useTheme } from 'vuetify'
import { RANK_COLORS } from '@/constants/analyseColors'
import { resolveItemName, NO_DISPLAY_NAME_KEY } from '@/utils/analyseDimensions'
import { useItemGrouping } from '@/composables/useItemGrouping'
import { formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import {
  answer,
  answerSemantic,
  renderAssistantMarkdown,
  SUGGESTION_GROUPS,
} from '@/utils/analyseAssistant'
import { useI18n } from '@/i18n/useI18n'
import store from '@/store'
import { useFilters } from '@/composables/useFilters'
import AnalyseSkeletonVeil from '@/components/space-workspace/analyse/AnalyseSkeletonVeil.vue'

const { t } = useI18n()
const { filtersRecomputing } = useFilters()

// Dark mode autonome : suit le thème global Vuetify.
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const props = defineProps({
  modelValue: { type: Boolean, default: true },
  records: { type: Array, default: () => [] },
  // Source item-level (event-timeline) pour « Item performance » uniquement.
  // Fournie quand 1 event est sélectionné ; sinon vide → fallback sur `records`
  // (shop-level, sans détail article). Voir AnalyseView.itemLevelRecords.
  itemRecords: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },
  // Shops enrichis (useShopPerformance) — utilisés pour afficher le
  // transactionRate (txn/min) une fois calculé.
  shopRates: { type: Array, default: () => [] },
  // Construit le dataset Analyse à la demande (useAnalyseDataset.ensureDataset,
  // idempotent) pour que l'assistant lise les mêmes chiffres que le bandeau
  // KPI sans attendre la construction en idle.
  ensureDataset: { type: Function, default: null },
})
defineEmits(['update:modelValue', 'analyze', 'shop-click', 'event-click', 'item-click'])

const aiQuery = ref('')
const shopMode = ref('total')
const menuMode = ref('total')
// Bascule « Article / DisplayName » du classement (17/08). État PARTAGÉ avec
// l'export XLSX (feuille Classement) via le singleton useItemGrouping.
const { mode: itemGroupingMode, groupKeyOf, displayNameIndex } = useItemGrouping(
  () => store.state.analyse.menuItems,
)
// Aucun DisplayName affecté dans le catalogue → la bascule regrouperait TOUT
// sous « Sans DisplayName » (lecture « c'est cassé »). On désactive le bouton,
// et on repasse en mode Article si le catalogue change et perd ses DisplayName
// (changement d'espace).
const hasDisplayNames = computed(() => displayNameIndex.value.nameByMenuItemId.size > 0)
watch(hasDisplayNames, (has) => {
  if (!has && itemGroupingMode.value === 'displayName') itemGroupingMode.value = 'menuItem'
})

// Etat des filtres globaux pour griser les lignes actives.
const selectedShopNames = computed(() => store.state.analyse.filters?.selectedShopIds || [])
const selectedEventIds = computed(() => store.state.analyse.filters?.selectedEventIds || [])

// Sections de l'accordéon ouvertes par défaut : PdV, événements et articles
// dépliés d'emblée (filtres communicants). Seul « Data analysis » (assistant)
// reste replié.
const openPanels = ref(['shops', 'events', 'items'])

// Drill-down "Voir tout" : on n'affiche que les 5 premiers par défaut.
const showAllShops = ref(false)
const showAllEvents = ref(false)
const showAllItems = ref(false)

// ─── Assistant local ───────────────────────────────────────────
const suggestionGroups = SUGGESTION_GROUPS
const assistantResult = ref(null)
const analyzing = ref(false)
// ON par défaut : sinon le matching reste en regex pur (le modèle téléchargé
// ne sert à rien) → toute paraphrase hors regex tombait sur le fallback. Le
// modèle se charge paresseusement au 1er envoi (ensureSemanticLoaded).
const useSemantic = ref(true)
const semanticLoading = ref(false)
const semanticProgress = ref(0)
const renderedAnswer = computed(() =>
  assistantResult.value ? renderAssistantMarkdown(assistantResult.value.text) : '',
)

async function ensureSemanticLoaded() {
  if (!useSemantic.value) return
  // Précharge le modèle pour que le 1er match soit fluide.
  const mod = await import('@/utils/analyseAssistantSemantic')
  if (mod.isSemanticReady()) return
  semanticLoading.value = true
  try {
    await mod.loadSemanticMatcher((p) => {
      if (p && typeof p.progress === 'number') {
        semanticProgress.value = Math.round(p.progress)
      }
    })
  } finally {
    semanticLoading.value = false
  }
}

async function runAnalyze(maybeText) {
  const text = typeof maybeText === 'string' ? maybeText : aiQuery.value
  if (!text || !text.trim() || analyzing.value) return
  aiQuery.value = text
  analyzing.value = true
  // Dataset prêt avant de répondre : sans lui, les outils KPI retombent sur le
  // getter shop-level et divergent du bandeau. Best-effort, jamais bloquant.
  try {
    props.ensureDataset?.()
  } catch (e) {
    console.warn('[SummaryPanel] ensureDataset a échoué :', e)
  }
  await nextTick()
  await new Promise((r) => setTimeout(r, 120))
  if (useSemantic.value) {
    await ensureSemanticLoaded()
    assistantResult.value = await answerSemantic(store, text, { enableSemantic: true })
  } else {
    assistantResult.value = answer(store, text)
  }
  analyzing.value = false
}

function clearAssistant() {
  assistantResult.value = null
  aiQuery.value = ''
}

// Réagit aux requêtes injectées depuis l'extérieur (clic sur une alerte du header).
watch(
  () => store.state.analyse.pendingAssistantQuery,
  (pending) => {
    if (pending?.text) {
      runAnalyze(pending.text)
      // Reset après consommation pour permettre le même query plusieurs fois.
      store.commit('analyse/SET_PENDING_ASSISTANT_QUERY', null)
    }
  },
)

const topShops = computed(() => {
  const map = new Map()
  for (const r of props.records) {
    const key = r.shopName || '—'
    if (!map.has(key)) {
      map.set(key, { name: key, revenue: 0, units: 0, eventIds: new Set() })
    }
    const e = map.get(key)
    e.revenue += r.revenue || 0
    e.units += r.quantity || 0
    if (r.eventId) e.eventIds.add(r.eventId)
  }
  // Lookup transactionRate par nom de shop (fourni par useShopPerformance.enrich).
  const rateByName = new Map()
  for (const sh of props.shopRates || []) {
    if (sh?.shopName && Number.isFinite(sh.transactionRate)) {
      rateByName.set(sh.shopName, sh.transactionRate)
    }
  }
  const list = [...map.values()].map((e) => {
    const n = e.eventIds.size || 1
    return {
      name: e.name,
      revenue: e.revenue,
      units: e.units,
      eventCount: e.eventIds.size,
      avgRevenue: e.revenue / n,
      avgUnits: e.units / n,
      transactionRate: rateByName.get(e.name) ?? null,
    }
  })
  const key = shopMode.value === 'avg' ? 'avgRevenue' : 'revenue'
  return list.sort((a, b) => b[key] - a[key])
})

// Lot 0.5 — Events Performance : top 5 événements par CA.
const topEvents = computed(() => {
  const totals = new Map()
  for (const r of props.records) {
    if (!r.eventId) continue
    const cur = totals.get(r.eventId) || { revenue: 0, units: 0 }
    cur.revenue += r.revenue || 0
    cur.units += r.quantity || 0
    totals.set(r.eventId, cur)
  }
  const list = (props.events || []).map((ev) => {
    const t = totals.get(ev.id) || { revenue: 0, units: 0 }
    return {
      id: ev.id,
      name: ev.name || ev.title || '—',
      date: ev.date || ev.eventDate || null,
      revenue: t.revenue,
      units: t.units,
    }
  })
  return list.sort((a, b) => b.revenue - a.revenue)
})

function formatEventDate(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date.getTime())) return ''
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${date.getFullYear()}`
}

// « Item performance » : privilégie la source item-level (event-timeline) quand
// elle est fournie (1 event sélectionné), sinon retombe sur les records shop-level.
const itemSource = computed(() =>
  props.itemRecords && props.itemRecords.length ? props.itemRecords : props.records,
)

const topItems = computed(() => {
  const map = new Map()
  const byDisplayName = itemGroupingMode.value === 'displayName'
  for (const r of itemSource.value) {
    // Résolution tolérante : les records sans `menuItemName` (predict, enrichissement
    // partiel) portent `itemName`. Sans ce fallback, tout se regroupe sous « — »
    // → « pas d'items item par item » sur un event sélectionné.
    // En mode DisplayName, groupKeyOf agrège les articles d'un même libellé
    // commercial (les articles sans DisplayName tombent dans NO_DISPLAY_NAME_KEY).
    const key = groupKeyOf(r) || '—'
    if (!map.has(key)) {
      map.set(key, { name: key, revenue: 0, units: 0, eventIds: new Set(), itemNames: new Set() })
    }
    const e = map.get(key)
    e.revenue += r.revenue || 0
    e.units += r.quantity || 0
    if (r.eventId) e.eventIds.add(r.eventId)
    // Noms d'articles RÉELLEMENT présents dans les records : c'est eux qu'on
    // envoie au filtre au clic (le filtre article travaille sur des noms), pas
    // toute la liste catalogue du DisplayName — sinon on filtrerait sur des
    // articles absents de la période.
    const itemName = resolveItemName(r)
    if (itemName) e.itemNames.add(itemName)
  }
  const list = [...map.values()].map((e) => {
    const n = e.eventIds.size || 1
    const isNoDisplayName = byDisplayName && e.name === NO_DISPLAY_NAME_KEY
    return {
      name: isNoDisplayName ? t('anNoDisplayName') : e.name,
      key: e.name,
      memberNames: [...e.itemNames],
      itemCount: e.itemNames.size,
      revenue: e.revenue,
      units: e.units,
      eventCount: e.eventIds.size,
      avgRevenue: e.revenue / n,
      avgUnits: e.units / n,
    }
  })
  const key = menuMode.value === 'avg' ? 'avgRevenue' : 'revenue'
  return list.sort((a, b) => b[key] - a[key])
})

function rankColor(rank) {
  if (rank === 1) return RANK_COLORS[1]
  if (rank === 2) return RANK_COLORS[2]
  return RANK_COLORS.default
}

// Leaderboard : barre « part du leader » (magnitude). Max sur la liste affichée,
// en respectant la bascule Total/Moy. Réutilise les données déjà chargées.
const maxShopRevenue = computed(() => {
  const k = shopMode.value === 'avg' ? 'avgRevenue' : 'revenue'
  return topShops.value.reduce((m, s) => Math.max(m, Number(s?.[k]) || 0), 0) || 1
})
const maxEventRevenue = computed(() =>
  topEvents.value.reduce((m, e) => Math.max(m, Number(e?.revenue) || 0), 0) || 1)
const maxItemRevenue = computed(() => {
  const k = menuMode.value === 'avg' ? 'avgRevenue' : 'revenue'
  return topItems.value.reduce((m, i) => Math.max(m, Number(i?.[k]) || 0), 0) || 1
})
function shareWidth(value, max) {
  const pct = max > 0 ? ((Number(value) || 0) / max) * 100 : 0
  return `${Math.max(0, Math.min(100, pct))}%`
}
</script>


<style scoped>
/* Colonne de grille (ex v-navigation-drawer) : fond transparent, la carte
   blanche (.sp-card) repose sur le gris d'AnalyseView (comme le FilterPanel). */
.summary-panel {
  min-width: 0;
  /* BUG-285 : ancre du voile squelette (AnalyseSkeletonVeil, position: absolute). */
  position: relative;
}
.sp-card {
  /* Colonne de droite = panneau .ep-metrics d'EventPredict (border #e5e7eb, radius 16). */
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
/* En-tête de section (accordéons panneau droit) = kicker EventPredict
   (.ep-metrics-kicker) : 11px, gras 800, gris, majuscules, letter-spacing .08em. */
.section-title {
  font-size: 0.6875rem;
  font-weight: var(--fw-bold);
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
/* ── Leaderboard : listes de performance en cartes KPI + barre « part du leader ».
   Rang = or/argent/bronze (identité) ; barre = magnitude (1 teinte/section). ── */
.lb-list { display: flex; flex-direction: column; gap: 8px; }
.lb-card {
  position: relative; overflow: hidden; cursor: pointer;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
  padding: 10px 12px 11px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.lb-card::before {
  content: ""; position: absolute; inset: 0 auto 0 0; width: 3px;
  background: var(--lb-accent, #64748b);
}
.lb-card--pos { --lb-accent: #0284c7; }
.lb-card--events { --lb-accent: #0e9f8f; }
.lb-card--items { --lb-accent: #f59e0b; }
.lb-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); }
.lb-card:focus-visible { outline: 2px solid var(--lb-accent, #64748b); outline-offset: 1px; }
.lb-card--active { border-color: var(--lb-accent, #64748b); box-shadow: inset 0 0 0 1px var(--lb-accent, #64748b); }
.lb-top { display: flex; align-items: center; gap: 10px; }
.lb-name {
  flex: 1 1 auto; min-width: 0; font-size: var(--fs-base)!important; font-weight: 700; color: #212121;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.lb-val {
  flex: none; margin-left: auto; font-size: var(--fs-md)!important; font-weight: var(--fw-bold)!important;
  color: #212121 !important; letter-spacing: -0.2px; font-variant-numeric: tabular-nums;
}
.lb-sub { display: flex; align-items: center; gap: 8px; min-height: 18px; margin: 5px 0 8px; padding-left: 34px; }
.lb-spacer { margin-left: auto; }
.lb-date { font-size: var(--fs-xs); color: #94a3b8; }
.lb-meter { height: 5px; border-radius: 4px; background: #eef2f7; overflow: hidden; }
.lb-meter > i {
  display: block; height: 100%; min-width: 3px; border-radius: 4px;
  background: var(--lb-accent, #64748b); transition: width 0.3s ease;
}
/* Mode sombre : cartes/piste + textes (scoped → priment sur les overrides globaux). */
.v-theme--dataFridayDark .lb-card { background: #1f1f1f; border-color: #3f3f46; }
.v-theme--dataFridayDark .lb-meter { background: #2a2f36; }
.v-theme--dataFridayDark .lb-name { color: #fafafa; }
.v-theme--dataFridayDark .lb-val { color: #fafafa !important; }

.analyze-btn {
  background: #7C4DFF !important;
  color: #fff !important;
  text-transform: none !important;
  border-radius: 8px !important;
  font-weight: 600;
}
.tour-panel {
  background: #FAFAFC;
  border: 1px dashed #E0D4FF;
  border-radius: 10px;
  padding: 8px 10px;
}
.tour-group + .tour-group {
  margin-top: 8px;
}
.tour-group-header {
  display: flex;
  align-items: center;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 4px;
}
.tour-chips {
  display: flex;
  flex-wrap: wrap;
}
.assistant-card {
  background: #fff;
  border: 1px solid #E0D4FF;
  border-radius: 10px;
  padding: 10px 12px;
  box-shadow: 0 1px 3px rgba(124, 77, 255, 0.08);
}
.assistant-header {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}
.assistant-title {
  font-size: var(--fs-xs);
  font-weight: 700;
  color: #7C4DFF;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.semantic-toggle {
  background: #FAFAFC;
  border-radius: 8px;
  padding: 4px 8px;
  border: 1px solid #EEEEEE;
}
.semantic-toggle :deep(.v-switch) {
  margin: 0;
}
.semantic-toggle :deep(.v-selection-control) {
  min-height: 28px;
}
.semantic-label {
  font-size: var(--fs-xs);
  color: #555;
  display: inline-flex;
  align-items: center;
}
.semantic-hint {
  font-size: var(--fs-xs);
  color: #9E9E9E;
  font-style: italic;
  margin-top: 2px;
}
.assistant-body {
  font-size: var(--fs-sm);
  line-height: 1.5;
  color: #212121;
  white-space: normal;
  word-wrap: break-word;
}
.assistant-body :deep(strong) {
  font-weight: 600;
}
.assistant-body :deep(code) {
  background: rgba(124, 77, 255, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: var(--fs-xs);
  font-family: ui-monospace, SFMono-Regular, monospace;
}
.assistant-body :deep(.aa-li) {
  margin: 2px 0;
}
.assistant-tip {
  margin-top: 8px;
  font-size: var(--fs-xs);
  color: #757575;
  font-style: italic;
}
.rank-badge {
  color: #fff;
}
.rank-num {
  font-size: var(--fs-xs);
  font-weight: 700;
}
.item-name {
  font-size: var(--fs-sm)!important;
  font-weight: 600;
  color: #212121;
}
.item-units {
  font-size: var(--fs-xs)!important;
  color: #9E9E9E !important;
}
.item-value {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: #2E7D32;
}
.metric-suffix {
  color: #BDBDBD;
  font-size: var(--fs-xs);
  margin-left: 2px;
}
.show-all-link {
  display: block;
  text-align: center;
  font-size: var(--fs-xs);
  color: #5B8DEF;
  text-decoration: none;
  margin-top: 4px;
}
.show-all-link:hover {
  text-decoration: underline;
}
.show-all-btn {
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #5B8DEF;
  margin-top: 4px;
  text-transform: none;
}

/* Lot 0.5 — units sous le revenue (capture d'écran) */
.item-units-below {
  font-size: var(--fs-xs);
  color: #9E9E9E;
  margin-top: 2px;
}
.item-rate {
  font-size: var(--fs-xs)!important;
  color: #6B7280 !important;
}
/* Lot 0.5 — Chip txn/min : pilule violette pâle, lisible mais discrète */
.txn-rate-chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 9999px;
  background-color: #EDE9FE;
  color: #5B21B6;
  font-size: var(--fs-xs);
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.1px;
  white-space: nowrap;
}
.txn-rate-chip .v-icon {
  color: #6D28D9 !important;
}
/* Lot 0.5 — Events Performance : carte teal pâle bordée */
.event-row {
  background-color: #ECFDF5;
  border: 1px solid #A7F3D0;
  border-radius: 12px;
}
.event-rank :deep(.v-avatar__content),
.event-rank {
  color: #ffffff !important;
}
.item-value.event-value {
  color: #0E9F8F;
}

/* Lignes cliquables (PdV / Events) — toggle filtre global. */
.sp-clickable {
  cursor: pointer;
  transition: background-color 120ms ease;
}
.sp-clickable:hover {
  background-color: rgba(124, 77, 255, 0.06);
}
.sp-clickable.v-list-item--active {
  background-color: rgba(124, 77, 255, 0.12) !important;
}

/* ── Dark mode (autonome via isDark) : override des couleurs claires en dur.
   Les internes Vuetify (accordéons, champs, switch, chips) suivent le thème
   global sombre ; on ne force que le custom clair. #7C4DFF / #0E9F8F / #ff3131
   et sémantiques conservés (éclaircis seulement si contraste faible). ── */
.summary-panel--dark .sp-card {
  background: #1e293b;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.summary-panel--dark .section-title {
  color: #94a3b8;
}

/* Leaderboard : cartes + piste + textes */
.summary-panel--dark .lb-card {
  background: #1e293b;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.summary-panel--dark .lb-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
.summary-panel--dark .lb-name {
  color: #f9fafb;
}
.summary-panel--dark .lb-val {
  color: #f9fafb !important;
}
.summary-panel--dark .lb-meter {
  background: #1a2332;
}

/* Assistant / tour d'horizon */
.summary-panel--dark .tour-panel {
  background: #1a2332;
  border-color: rgba(124, 77, 255, 0.35);
}
.summary-panel--dark .tour-group-header {
  color: #94a3b8;
}
.summary-panel--dark .assistant-card {
  background: #1e293b;
  border-color: rgba(124, 77, 255, 0.35);
}
.summary-panel--dark .assistant-body {
  color: #e2e8f0;
}
.summary-panel--dark .assistant-tip {
  color: #94a3b8;
}
.summary-panel--dark .semantic-toggle {
  background: #1a2332;
  border-color: rgba(255, 255, 255, 0.1);
}
.summary-panel--dark .semantic-label {
  color: #94a3b8;
}
.summary-panel--dark .semantic-hint {
  color: #94a3b8;
}

/* Lignes leaderboard : libellés + valeurs */
.summary-panel--dark .item-name {
  color: #f9fafb;
}
.summary-panel--dark .item-units,
.summary-panel--dark .item-units-below {
  color: #94a3b8;
}
.summary-panel--dark .item-rate {
  color: #94a3b8 !important;
}
/* Vert « valeur » éclairci pour le contraste sur fond sombre. */
.summary-panel--dark .item-value {
  color: #4ade80;
}
.summary-panel--dark .item-value.event-value {
  color: #2dd4bf;
}
/* Chip txn/min : pilule violette adaptée au fond sombre. */
.summary-panel--dark .txn-rate-chip {
  background-color: rgba(124, 77, 255, 0.15);
  color: #c4b5fd;
}
.summary-panel--dark .txn-rate-chip .v-icon {
  color: #c4b5fd !important;
}
</style>
