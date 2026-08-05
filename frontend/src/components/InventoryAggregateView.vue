<template>
  <div class="si-aggregate-root">
    <!-- Toolbar : titre + bascule Inventaire compté / Liste de courses -->
    <header class="agg-header">
      <div class="agg-title-row">
        <div>
          <h3>{{ viewMode === 'shopping' ? t('invPrintShopTitle') : t('invAggSummaryTitle') }}</h3>
          <p v-if="viewMode === 'counted'">{{ stats.countedItems }} / {{ stats.totalItems }} {{ t('invMetricCounted') }}</p>
        </div>
        <strong v-if="viewMode === 'counted'" class="agg-completion">{{ completionPercent }}%</strong>
      </div>
      <!-- Indique que la sidebar est limitée à la boutique en cours de comptage. -->
      <div v-if="focusShop" class="agg-focus-hint">
        <Package class="w-3 h-3" />
        <span>{{ t('invFocusCounting') }} <strong>{{ focusShopName }}</strong></span>
      </div>

      <!-- Sélecteur d'event de référence (Règle 3) -->
      <div v-if="viewMode === 'shopping'" class="mt-1">
        <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          {{ t('invAggGoalLabel') }}
        </label>
        <select
          v-model="referenceEventId"
          class="w-full text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5"
        >
          <option :value="null" disabled>{{ t('invAggChooseEvent') }}</option>
          <option v-for="ev in pastEventOptions" :key="ev.id" :value="ev.id">{{ ev.label }}</option>
        </select>
        <p v-if="!pastEventOptions.length" class="text-xs text-amber-600 mt-1">
          {{ t('invAggNoPastEvent') }}
        </p>
        <p v-else-if="shoppingDegraded" class="text-xs text-amber-600 mt-1">
          {{ t('invAggDegraded') }}
        </p>
      </div>

      <!-- Stats (mode compté) : Total items / Comptés / Total unités -->
      <div v-if="viewMode === 'counted'" class="agg-stats">
        <div>
          <span>{{ t('invAggTotalItems') }}</span>
          <strong>{{ stats.totalItems }}</strong>
        </div>
        <div>
          <span>{{ t('invMetricCounted') }}</span>
          <strong>{{ stats.countedItems }}</strong>
        </div>
        <!-- « Total unités » a laissé la place à ce qui RESTE à faire : pendant un
             comptage, le volume déjà saisi n'oriente aucune action. -->
        <div>
          <span>{{ t('invAggItemsToCount') }}</span>
          <strong>{{ stats.itemsToCount }}</strong>
        </div>
        <div>
          <span>{{ t('invAggShopsToCount') }}</span>
          <strong>{{ stats.shopsToCount }}</strong>
        </div>
      </div>

      <div v-if="viewMode === 'counted'" class="agg-progress" role="progressbar" :aria-valuenow="completionPercent" aria-valuemin="0" aria-valuemax="100">
        <span :style="{ width: `${completionPercent}%` }" />
      </div>

      <!-- Stats (mode liste de courses) -->
      <div v-else class="grid grid-cols-2 gap-3 mt-3">
        <div class="bg-orange-50 dark:bg-orange-950/30 rounded-lg" style="padding: 14px;">
          <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">{{ t('invAggItemsToRestock') }}</p>
          <p class="text-2xl font-semibold text-orange-600 dark:text-orange-400">{{ shoppingAggregated.length }}</p>
        </div>
        <div class="bg-red-50 dark:bg-red-950/30 rounded-lg" style="padding: 14px;">
          <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">{{ t('invAggUnitsToRestock') }}</p>
          <p class="text-2xl font-semibold text-red-600 dark:text-red-400">{{ formatUnits(shoppingTotalUnits) }}</p>
        </div>
      </div>
    </header>

    <!-- Vue centrée MENU ITEMS : l'article est la clé de groupe ; les boutiques
         sont en sous-niveau (« Détail par boutique »). Remplace les anciennes
         sections shop-groupées (PdV à compter / PdV comptés). -->

    <!-- MODE COMPTÉ : agrégat des comptages, par article (comptés ET à compter) -->
    <div v-if="viewMode === 'counted'">
      <div v-if="aggregatedInventory.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400" style="padding: 24px 22px;">
        <Package class="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p class="text-sm">{{ t('invAggNoCount') }}</p>
        <p class="text-xs mt-1">{{ t('invAggNoCountHint') }}</p>
      </div>

      <section v-else class="agg-list">
        <article
          v-for="(item, index) in aggregatedInventory"
          :key="`${item.itemName}-${index}`"
          class="agg-item"
          :class="{ 'is-complete': item.isCounted }"
        >
          <button
            type="button"
            class="agg-item-trigger"
            :aria-expanded="isAggExpanded(`${item.itemName}-${index}`)"
            @click="toggleAgg(`${item.itemName}-${index}`)"
          >
            <span class="agg-item-icon">
              <img v-if="item.itemPicture" :src="item.itemPicture" :alt="item.itemName" />
              <Package v-else class="agg-item-placeholder" />
            </span>
            <span class="agg-item-copy">
              <strong>{{ item.itemName }}</strong>
              <small>{{ item.countedShopCount }}/{{ item.totalShopCount }} {{ t('invColShops') }}</small>
            </span>
            <span class="agg-item-total">
              <strong>{{ formatUnits(item.totalUnits) }}</strong>
              <small>{{ t('invAggTotalUnits') }}</small>
            </span>
            <Check v-if="item.isCounted" class="agg-item-check" />
            <ChevronUp v-if="isAggExpanded(`${item.itemName}-${index}`)" class="agg-item-chevron" />
            <ChevronDown v-else class="agg-item-chevron" />
          </button>

          <div v-show="isAggExpanded(`${item.itemName}-${index}`)" class="agg-item-detail">
            <div class="agg-facts">
              <span><small>{{ t('invColPacked') }}</small><strong>{{ formatNumber(item.totalPackedUnits) }}</strong></span>
              <span><small>{{ t('invColLoose') }}</small><strong>{{ formatUnits(item.totalLooseUnits) }}</strong></span>
            </div>
            <div v-if="item.shops.length" class="agg-shop-list">
              <div v-for="(shop, idx) in item.shops" :key="idx" class="agg-shop-row">
                <span><Check v-if="shop.isCounted" />{{ shop.shopName }}</span>
                <strong>{{ formatUnits(shop.totalUnits) }}</strong>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>

    <!-- MODE LISTE DE COURSES : gap = objectif (ventes event réf.) - restant compté -->
    <div v-else>
      <div v-if="shoppingLoading" class="text-center py-8 text-gray-500" style="padding: 24px 22px;">
        <p class="text-sm">{{ t('invAggCalcShopping') }}</p>
      </div>
      <div v-else-if="!referenceEventId" class="text-center py-8 text-gray-500 dark:text-gray-400" style="padding: 24px 22px;">
        <Package class="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p class="text-sm">{{ t('invAggPickEventRestock') }}</p>
      </div>
      <div v-else-if="shoppingAggregated.length === 0" class="text-center py-8 text-green-600" style="padding: 24px 22px;">
        <Check class="w-12 h-12 mx-auto mb-3" />
        <p class="text-sm">{{ t('invAggAllInStock') }}</p>
      </div>

      <div v-else class="space-y-3" style="padding: 20px 22px;">
        <div
          v-for="(item, index) in shoppingAggregated"
          :key="`${item.name}-${index}`"
          class="border rounded-lg p-4 border-orange-200 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/10"
        >
          <div class="flex items-start justify-between gap-2 mb-2">
            <h4 class="font-medium text-sm dark:text-gray-100">
              {{ item.name }}
              <span v-if="item.isPackaging" class="ml-1 inline-flex items-center px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 rounded text-[10px]">{{ t('invPackaging') }}</span>
            </h4>
            <span class="text-xs text-gray-500">{{ item.unit }}</span>
          </div>

          <div class="space-y-1 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-gray-600 dark:text-gray-400">{{ t('invAggRestockPacks') }}</span>
              <span class="font-medium dark:text-gray-100">{{ item.totalPackedUnits }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-600 dark:text-gray-400">{{ t('invAggRestockLoose') }}</span>
              <span class="font-medium dark:text-gray-100">{{ formatUnits(item.totalLooseUnits) }}</span>
            </div>
            <div class="flex items-center justify-between border-t border-orange-200 dark:border-orange-900/40 pt-1 mt-1">
              <span class="text-gray-600 dark:text-gray-400 font-medium">{{ t('invAggRestockTotal') }}</span>
              <span class="font-semibold text-orange-600">{{ formatUnits(item.totalUnits) }}</span>
            </div>
          </div>

          <div class="mt-2">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400">
              <Package class="w-3 h-3" />
              {{ item.shopCount }} {{ t('invColShops') }}
            </span>
          </div>

          <!-- Breakdown par PDV : quoi réarmer où -->
          <details v-if="item.shops.length" class="mt-2">
            <summary class="text-xs text-orange-600 cursor-pointer hover:underline">{{ t('invAggDetailByShop') }}</summary>
            <div class="mt-2 space-y-1 pl-3 border-l-2 border-orange-200 dark:border-orange-900/40">
              <div v-for="(shop, idx) in item.shops" :key="idx" class="text-xs flex items-center justify-between">
                <span class="font-medium text-gray-700 dark:text-gray-300">{{ shop.shopName || shop.elementId }}</span>
                <span class="text-gray-500 dark:text-gray-400">{{ formatUnits(shop.gap) }}</span>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, watch } from 'vue'
import { Package, Check, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { useShoppingList } from '@/composables/useShoppingList'
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'
import { currentIntlLocale } from '@/composables/useNumberFormat'

export default {
  name: 'InventoryAggregateView',
  components: {
    Package,
    Check,
    ChevronDown,
    ChevronUp,
  },
  props: {
    inventoryCounts: { type: Object, required: true },
    shopsWithInventory: { type: Array, required: true },
    // Events passés proposés comme référence pour la liste de courses (Règle 3).
    pastEvents: { type: Array, default: () => [] },
    // Mode focus : pendant le comptage d'une boutique, on n'affiche que les
    // articles de CETTE boutique (id). null = agrégat global (toutes boutiques).
    focusShopId: { type: [String, Number], default: null },
  },

  emits: ['start-count-shop'],

  setup(props) {
    const { t } = useI18n()
    const { aggregated, loading, degraded, error, compute } = useShoppingList()
    const referenceEventId = ref(null)

    async function runShoppingList() {
      const ev = (props.pastEvents || []).find((e) => e.id === referenceEventId.value)
      if (!ev) return
      await compute({
        id: ev.id,
        start: ev.eventDate || ev.date || ev.startDate,
        end: ev.eventEndDate || ev.endDate || ev.eventDate || ev.date,
      })
    }

    watch(referenceEventId, runShoppingList)

    return {
      t,
      shoppingAggregated: aggregated,
      shoppingLoading: loading,
      shoppingDegraded: degraded,
      shoppingError: error,
      referenceEventId,
      runShoppingList,
    }
  },

  data() {
    return {
      viewMode: 'counted', // 'counted' | 'shopping'
      // Accordéon : détail d'un article agrégé déplié (clé = itemName-index).
      // Replié par défaut pour raccourcir la liste (évite une page trop longue).
      expandedAgg: {},
      // Liste « PdV à compter » repliée par défaut (peut être longue : 23 PdV).
      aggTodoOpen: false,
      // Liste « PdV comptés » (100 %) repliée par défaut, même comportement.
      aggCountedOpen: false,
    }
  },

  methods: {
    isAggExpanded(key) {
      return !!this.expandedAgg[key]
    },
    toggleAgg(key) {
      this.expandedAgg = { ...this.expandedAgg, [key]: !this.expandedAgg[key] }
    },
    formatNumber(value) {
      return Number(value || 0).toLocaleString(currentIntlLocale(), { maximumFractionDigits: 2 })
    },
    formatUnits,
  },

  computed: {
    pastEventOptions() {
      return (this.pastEvents || [])
        .slice()
        .reverse()
        .map((ev) => ({
          id: ev.id,
          label: `${ev.eventName || ev.name || 'Event'} · ${ev.eventDate || ev.date || ''}`,
        }))
    },
    shoppingTotalUnits() {
      return (this.shoppingAggregated || []).reduce((sum, i) => sum + Number(i.totalUnits || 0), 0)
    },
    /** Boutique en cours de comptage (mode focus), sinon null. */
    focusShop() {
      if (this.focusShopId == null) return null
      return (this.shopsWithInventory || []).find(
        (s) => String(s?.element?.id) === String(this.focusShopId),
      ) || null
    },
    focusShopName() {
      return this.focusShop?.element?.name || ''
    },
    /** Boutiques pas encore 100 % comptées (lien → lance le comptage). */
    uncountedShops() {
      const counts = this.inventoryCounts || {}
      return (this.shopsWithInventory || [])
        .map((shop) => {
          const items = shop.consolidatedInventory || []
          const shopCounts = counts[shop.element.id] || counts[String(shop.element.id)] || {}
          const counted = items.filter(
            (it) => (shopCounts[it.id] || shopCounts[String(it.id)])?.isCounted,
          ).length
          return { ...shop, counted, total: items.length }
        })
        .filter((s) => s.total > 0 && s.counted < s.total)
    },
    /** Boutiques 100 % comptées (filtre inverse de uncountedShops, mêmes données). */
    countedShops() {
      const counts = this.inventoryCounts || {}
      return (this.shopsWithInventory || [])
        .map((shop) => {
          const items = shop.consolidatedInventory || []
          const shopCounts = counts[shop.element.id] || counts[String(shop.element.id)] || {}
          const counted = items.filter(
            (it) => (shopCounts[it.id] || shopCounts[String(it.id)])?.isCounted,
          ).length
          return { ...shop, counted, total: items.length }
        })
        .filter((s) => s.total > 0 && s.counted >= s.total)
    },
    aggregatedInventory() {
      const inventoryCounts = this.inventoryCounts || {}
      const shopsWithInventory = this.shopsWithInventory || []

      // ── Mode focus : comptage d'une boutique → on liste UNIQUEMENT ses
      // articles (tous, comptés ou non) avec leur saisie courante, pour refléter
      // en direct ce qui est compté. Mise à jour auto au changement de boutique.
      if (this.focusShop) {
        const shopId = this.focusShop.element.id
        const shopCounts =
          inventoryCounts[shopId] || inventoryCounts[String(shopId)] || {}
        return (this.focusShop.consolidatedInventory || []).map((item) => {
          const count = shopCounts[item.id] || shopCounts[String(item.id)] || {}
          const qtyPerPack = Number(item.inventoryQuantityPackaged || 1)
          const packedUnits = Number(count.packedUnits || 0)
          const looseUnits = Number(count.looseUnits || 0)
          const totalUnits = packedUnits * qtyPerPack + looseUnits
          return {
            itemName: item.name,
            itemPicture: item.picture,
            totalPackedUnits: packedUnits,
            totalLooseUnits: looseUnits,
            totalUnits,
            countedShopCount: count.isCounted ? 1 : 0,
            totalShopCount: 1,
            isCounted: !!count.isCounted,
            shops: [{
              shopName: this.focusShop.element?.name || '',
              packedUnits,
              looseUnits,
              totalUnits,
              isCounted: !!count.isCounted,
            }],
          }
        })
        // Pas de tri : on garde l'ordre de la boutique (évite que les lignes
        // sautent pendant la saisie).
      }

      // Dénominateur (sémantique ALL) : nb de PdV où chaque produit (par nom)
      // apparaît. Un produit n'est « compté » que s'il l'est dans TOUS ces PdV.
      const totalShopsByName = new Map()
      shopsWithInventory.forEach((shop) => {
        const seen = new Set()
        ;(shop.consolidatedInventory || []).forEach((it) => {
          if (!it?.name || seen.has(it.name)) return
          seen.add(it.name)
          totalShopsByName.set(it.name, (totalShopsByName.get(it.name) || 0) + 1)
        })
      })

      const aggregateMap = new Map()

      // Itère TOUS les articles du stock (comptés ET à compter), groupés par nom
      // d'article = clé de groupe ; chaque boutique devient un sous-niveau.
      // (Avant : on n'itérait que inventoryCounts → les articles jamais comptés
      // n'apparaissaient pas. Ici on part de consolidatedInventory.)
      shopsWithInventory.forEach((shop) => {
        const shopId = shop?.element?.id
        const shopCounts = inventoryCounts[shopId] || inventoryCounts[String(shopId)] || {}
        ;(shop.consolidatedInventory || []).forEach((item) => {
          const itemName = item?.name
          if (!itemName) return
          const count = shopCounts[item.id] || shopCounts[String(item.id)] || {}
          const qtyPerPack = Number(item.inventoryQuantityPackaged || 1)
          const packedUnits = Number(count.packedUnits || 0)
          const looseUnits = Number(count.looseUnits || 0)
          const totalUnits = packedUnits * qtyPerPack + looseUnits
          const isCounted = !!count.isCounted

          if (!aggregateMap.has(itemName)) {
            aggregateMap.set(itemName, {
              itemName,
              itemPicture: item.picture,
              totalPackedUnits: 0,
              totalLooseUnits: 0,
              totalUnits: 0,
              countedShopCount: 0,
              totalShopCount: totalShopsByName.get(itemName) || 0,
              isCounted: false,
              shops: [],
            })
          }

          const aggregated = aggregateMap.get(itemName)
          if (!aggregated.itemPicture && item.picture) aggregated.itemPicture = item.picture
          aggregated.totalPackedUnits += packedUnits
          aggregated.totalLooseUnits += looseUnits
          aggregated.totalUnits += totalUnits
          if (isCounted) aggregated.countedShopCount += 1
          aggregated.shops.push({
            shopName: shop?.element?.name || 'PdV sans nom',
            packedUnits,
            looseUnits,
            totalUnits,
            isCounted,
          })
        })
      })

      // ALL : vert uniquement si compté dans tous les PdV où le produit existe.
      // Tri : articles « à compter » d'abord (actionnable), puis comptés ; à
      // l'intérieur, par unités décroissantes puis nom.
      return Array.from(aggregateMap.values())
        .map((a) => ({
          ...a,
          shopCount: a.totalShopCount,
          isCounted: a.totalShopCount > 0 && a.countedShopCount >= a.totalShopCount,
        }))
        .sort((a, b) => {
          if (a.isCounted !== b.isCounted) return a.isCounted ? 1 : -1
          if (b.totalUnits !== a.totalUnits) return b.totalUnits - a.totalUnits
          return String(a.itemName).localeCompare(String(b.itemName))
        })
    },

    stats() {
      const totalItems = this.aggregatedInventory.length
      const countedItems = this.aggregatedInventory.filter((item) => item.isCounted).length
      const totalUnits = this.aggregatedInventory.reduce((sum, item) => sum + Number(item.totalUnits || 0), 0)
      // `shopsToCount` suit le MÊME périmètre que `totalItems` : en mode focus,
      // `aggregatedInventory` est réduit au PdV compté, donc la tuile PdV doit
      // l'être aussi — sinon « 3 articles / 12 PdV » pendant qu'on compte une
      // seule boutique se lit comme un bug.
      // NB : `uncountedShops` écarte les PdV sans article assigné (total > 0) —
      // un PdV sans rien à compter n'est pas « à compter ».
      const shopsToCount = this.focusShop
        ? (countedItems < totalItems ? 1 : 0)
        : this.uncountedShops.length
      return {
        totalItems,
        countedItems,
        totalUnits,
        itemsToCount: Math.max(0, totalItems - countedItems),
        shopsToCount,
      }
    },
    completionPercent() {
      if (!this.stats.totalItems) return 0
      return Math.round((this.stats.countedItems / this.stats.totalItems) * 100)
    },
  },
}
</script>

<style scoped>
.si-aggregate-root {
  background: #FFFFFF;
  color: #212121;
  font-size: 12px;
  line-height: 1.35;
}

.agg-header {
  padding: 14px;
  border-bottom: 1px solid var(--fb-border, #e5e7eb);
  background: var(--fb-surface, #fff);
}

.agg-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

/* Titre de section = kicker EventPredict (.ep-metrics-kicker). */
.agg-title-row h3 {
  margin: 0;
  color: #64748b;
  font-size: 0.6875rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.agg-title-row p {
  margin: 2px 0 0;
  color: var(--fb-muted, #6b7280);
  font-size: 11px;
}

.agg-completion {
  color: #ff3131;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.agg-stats {
  display: grid;
  /* 4 tuiles depuis l'ajout d'« Articles à compter » / « PdV à compter » :
     2×2 sous 380px pour que les libellés ne se tronquent pas sur mobile. */
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 9px;
  /* Fond = couleur des filets : c'est le `gap: 1px` qui dessine les séparateurs. */
  background: var(--fb-border, #e5e7eb);
}

.agg-stats > div {
  min-width: 0;
  padding: 8px 7px;
  background: var(--fb-subtle, #fafafa);
}

@media (max-width: 380px) {
  .agg-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.agg-stats span,
.agg-stats strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agg-stats span {
  color: var(--fb-muted, #6b7280);
  font-size: 9px;
  font-weight: 600;
}

.agg-stats strong {
  margin-top: 2px;
  color: var(--fb-text, #111827);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.agg-progress {
  height: 3px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--fb-border, #e5e7eb);
}

.agg-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #ff3131;
  transition: width 200ms ease;
}

.agg-list {
  display: grid;
  gap: 7px;
  padding: 10px;
}

.agg-item {
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.agg-item:hover {
  border-color: #d1d5db;
  box-shadow: 0 3px 12px rgba(15, 23, 42, 0.05);
}

.agg-item.is-complete { border-color: #bbf7d0; }

.agg-item-trigger {
  appearance: none;
  width: 100%;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto 14px;
  align-items: center;
  gap: 9px;
  padding: 9px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.agg-item-trigger:focus-visible {
  outline: 2px solid rgba(255, 49, 49, 0.45);
  outline-offset: -2px;
}

.agg-item-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--fb-subtle, #f7f7f8);
}

.agg-item-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.agg-item-placeholder {
  width: 16px;
  height: 16px;
  color: #9ca3af;
}

.agg-item-copy,
.agg-item-total {
  min-width: 0;
}

.agg-item-copy strong,
.agg-item-copy small,
.agg-item-total strong,
.agg-item-total small {
  display: block;
}

.agg-item-copy strong {
  overflow: hidden;
  color: var(--fb-text, #111827);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agg-item-copy small,
.agg-item-total small {
  margin-top: 2px;
  color: var(--fb-muted, #6b7280);
  font-size: 9.5px;
}

.agg-item-total {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.agg-item-total strong {
  color: var(--fb-text, #111827);
  font-size: 12px;
}

.agg-item-check {
  display: none;
}

.agg-item-chevron {
  width: 14px;
  height: 14px;
  color: #9ca3af;
}

.agg-item-detail {
  padding: 0 10px 10px 53px;
  border-top: 1px solid var(--fb-border, #f1f5f9);
}

.agg-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding-top: 8px;
}

.agg-facts span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 7px;
  border-radius: 6px;
  background: var(--fb-subtle, #f7f7f8);
}

.agg-facts small { color: var(--fb-muted, #6b7280); font-size: 9.5px; }
.agg-facts strong { font-size: 10.5px; font-variant-numeric: tabular-nums; }

.agg-shop-list {
  display: grid;
  gap: 4px;
  max-height: 150px;
  margin-top: 8px;
  overflow-y: auto;
}

.agg-shop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--fb-muted, #4b5563);
  font-size: 10px;
}

.agg-shop-row span {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 4px;
}

.agg-shop-row svg {
  width: 11px;
  height: 11px;
  color: #16a34a;
}

.agg-shop-row strong {
  color: var(--fb-text, #111827);
  font-variant-numeric: tabular-nums;
}

.agg-focus-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  padding: 3px 10px;
  border-radius: 9999px;
  background: rgba(255, 110, 64, 0.12);
  color: #c2410c;
  font-size: 11px;
  font-weight: 600;
}

/* PdV restant à compter */
.agg-todo {
  padding: 12px 22px 4px;
  border-bottom: 1px solid var(--fb-border, #EEEEEE);
}
.agg-todo-title {
  margin: 0 0 8px;
  font-size: 0.6875rem;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  display: flex;
  align-items: center;
  gap: 6px;
}
/* Le titre est désormais un bouton plein largeur (repli/dépli de la liste). */
.agg-todo-toggle {
  width: 100%;
  justify-content: space-between;
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 0;
}
.agg-todo-toggle > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.agg-todo-badge {
  background: #FEE2E2;
  color: #b91c1c;
  border-radius: 9999px;
  padding: 0 7px;
  font-size: 11px;
}
.agg-todo-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.agg-todo-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid var(--fb-border, #E5E7EB);
  border-radius: 9999px;
  background: var(--fb-surface, #fff);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--fb-text, #334155);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.agg-todo-chip:hover {
  background: rgba(255, 110, 64, 0.08);
  border-color: #FF6E40;
  color: #c2410c;
}
.agg-todo-chip-count {
  color: #94a3b8;
  font-weight: 700;
}

/* PdV comptés (100 %) : variante verte de la liste « PdV à compter ». */
.agg-done-badge {
  background: #DCFCE7;
  color: #15803d;
}
.agg-done-chip {
  border-color: #BBF7D0;
  color: #15803d;
}
.agg-done-chip:hover {
  background: rgba(34, 197, 94, 0.08);
  border-color: #22C55E;
  color: #15803d;
}

.si-aggregate-root > div:first-child {
  background: var(--fb-surface, #FFFFFF) !important;
  border-bottom-color: var(--fb-border, #EEEEEE) !important;
  padding: 14px 16px !important;
}

.si-aggregate-root h3,
.si-aggregate-root h4 {
  color: var(--fb-text, #212121);
  letter-spacing: 0;
}

.si-aggregate-root h3 {
  font-size: 14px !important;
  line-height: 1.2;
  font-weight: 700;
}

.si-aggregate-root h4 {
  font-size: 12.5px !important;
  line-height: 1.25;
  font-weight: 650;
}

.si-aggregate-root button {
  border-radius: 8px !important;
  font-size: 11.5px !important;
  line-height: 1.2;
}

.si-aggregate-root select {
  background: var(--fb-surface, #FFFFFF) !important;
  border-color: var(--fb-border, #EEEEEE) !important;
  border-radius: 8px !important;
  color: var(--fb-text, #212121);
  font-size: 12px !important;
  min-height: 32px;
}

.si-aggregate-root .rounded,
.si-aggregate-root .rounded-md,
.si-aggregate-root .rounded-lg {
  border-radius: 8px !important;
}

.si-aggregate-root .border,
.si-aggregate-root .border-b,
.si-aggregate-root .border-t,
.si-aggregate-root .border-l-2 {
  border-color: var(--fb-border, #EEEEEE);
}

.si-aggregate-root .bg-gray-100,
.si-aggregate-root .bg-blue-50,
.si-aggregate-root .bg-green-50,
.si-aggregate-root .bg-orange-50,
.si-aggregate-root .bg-purple-50 {
  background-color: var(--fb-subtle, #FAFAFA) !important;
}

.si-aggregate-root .text-gray-500,
.si-aggregate-root .text-gray-600 {
  color: var(--fb-muted, #6B7280) !important;
}

.si-aggregate-root summary {
  color: #ff3131 !important;
}

.si-aggregate-root .p-4 {
  padding: 10px !important;
}

.si-aggregate-root .py-8 {
  padding-top: 22px !important;
  padding-bottom: 22px !important;
}

.si-aggregate-root .space-y-3 {
  display: flex !important;
  flex-direction: column;
  gap: 8px !important;
}

.si-aggregate-root .gap-3 {
  gap: 9px !important;
}

.si-aggregate-root .mb-3 {
  margin-bottom: 10px !important;
}

.si-aggregate-root .mt-3 {
  margin-top: 10px !important;
}

.si-aggregate-root .w-16 {
  width: 42px !important;
}

.si-aggregate-root .h-16 {
  height: 42px !important;
}

.si-aggregate-root .w-12 {
  width: 34px !important;
}

.si-aggregate-root .h-12 {
  height: 34px !important;
}

.si-aggregate-root .w-6 {
  width: 18px !important;
}

.si-aggregate-root .h-6 {
  height: 18px !important;
}

.si-aggregate-root .w-5 {
  width: 16px !important;
}

.si-aggregate-root .h-5 {
  height: 16px !important;
}

.si-aggregate-root .text-2xl {
  font-size: 18px !important;
  line-height: 1.1;
}

.si-aggregate-root .text-sm {
  font-size: 12px !important;
  line-height: 1.35;
}

.si-aggregate-root .text-xs {
  font-size: 11px !important;
  line-height: 1.35;
}

.si-aggregate-root .grid {
  gap: 8px !important;
}

.si-aggregate-root .inline-flex {
  min-height: 22px;
}

.si-aggregate-root {
  background: var(--fb-surface, #FFFFFF);
  color: var(--fb-text, #212121);
}
.agg-card,
.agg-item {
  border-color: var(--fb-border, #E5E7EB);
  border-radius: var(--fb-radius-panel, 12px);
  background: var(--fb-surface, #FFFFFF);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
}
.agg-item:hover {
  border-color: rgba(255, 49, 49, 0.26);
  box-shadow: var(--fb-shadow-hover, 0 4px 16px rgba(15, 23, 42, 0.08));
  /* Fond visible au survol (sinon blanc sur blanc). */
  background: rgba(255, 49, 49, 0.05);
}
.si-aggregate-root summary,
.agg-total-value {
  color: #ff3131 !important;
}
.agg-title,
.agg-item-name,
.agg-value {
  color: var(--fb-text, #212121);
}
.agg-subtitle,
.agg-meta {
  color: var(--fb-muted, #6B7280);
}

/* ===================== DARK MODE =====================
   Fonds, bordures et textes passent par les `--fb-*` (bascule automatique).
   Ne restent ici que les teintes sémantiques calibrées pour du texte sur fond
   clair (rouge 700, vert 700, orange 700) : on prend la version claire de la
   même famille, et les pastels de fond deviennent des voiles translucides. */
.v-theme--dataFridayDark .agg-title-row h3,
.v-theme--dataFridayDark .agg-todo-title {
  color: #94a3b8;
}
.v-theme--dataFridayDark .agg-item.is-complete {
  border-color: rgba(34, 197, 94, 0.35);
}
.v-theme--dataFridayDark .agg-focus-hint {
  background: rgba(255, 110, 64, 0.18);
  color: #fdba74;
}
.v-theme--dataFridayDark .agg-todo-badge {
  background: rgba(255, 49, 49, 0.15);
  color: #fca5a5;
}
.v-theme--dataFridayDark .agg-todo-chip:hover {
  background: rgba(255, 110, 64, 0.16);
  color: #fdba74;
}
.v-theme--dataFridayDark .agg-done-badge {
  background: rgba(34, 197, 94, 0.16);
  color: #86efac;
}
.v-theme--dataFridayDark .agg-done-chip,
.v-theme--dataFridayDark .agg-done-chip:hover {
  border-color: rgba(34, 197, 94, 0.4);
  color: #86efac;
}
.v-theme--dataFridayDark .agg-done-chip:hover {
  background: rgba(34, 197, 94, 0.16);
}
</style>
