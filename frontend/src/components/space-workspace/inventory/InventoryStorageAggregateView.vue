<template>
  <!-- Résumé DROITE de l'onglet Stockages : agrégat des comptages storage
       UNIQUEMENT (jamais les shops). Modelé sur le mode « compté » de
       InventoryAggregateView, sans liste de courses ni events de référence. -->
  <div class="si-aggregate-root">
    <header class="agg-header">
      <div class="agg-title-row">
        <div>
          <h3>{{ t('invStorageAggTitle') }}</h3>
          <p>{{ stats.countedItems }} / {{ stats.totalItems }} {{ t('invMetricCounted') }}</p>
        </div>
        <strong class="agg-completion">{{ completionPercent }}%</strong>
      </div>
 
      <!-- Indique que la sidebar est limitée au stockage en cours de comptage. -->
      <div v-if="focusStorage" class="agg-focus-hint">
        <Package class="w-3 h-3" />
        <span>{{ t('invStorageAggFocusHint') }} <strong>{{ focusStorageName }}</strong></span>
      </div>

      <!-- Stats : Total items / Comptés / Total unités -->
      <div class="agg-stats">
        <div>
          <span>{{ t('invAggTotalItems') }}</span>
          <strong>{{ stats.totalItems }}</strong>
        </div>
        <div>
          <span>{{ t('invMetricCounted') }}</span>
          <strong>{{ stats.countedItems }}</strong>
        </div>
        <!-- « Total unités » a laissé la place à ce qui RESTE à faire (parité
             InventoryAggregateView). -->
        <div>
          <span>{{ t('invAggItemsToCount') }}</span>
          <strong>{{ stats.itemsToCount }}</strong>
        </div>
        <div>
          <span>{{ t('invAggStoragesToCount') }}</span>
          <strong>{{ stats.storagesToCount }}</strong>
        </div>
      </div>

      <div class="agg-progress" role="progressbar" :aria-valuenow="completionPercent" aria-valuemin="0" aria-valuemax="100">
        <span :style="{ width: `${completionPercent}%` }" />
      </div>
    </header>

    <div v-if="aggregatedInventory.length === 0" class="agg-empty">
      <Package class="agg-empty-icon" />
      <p>{{ t('invStorageAggEmpty') }}</p>
    </div>

    <!-- Vue centrée ARTICLES : l'article est la clé de groupe ; les stockages
         sont en sous-niveau (« Détail par stockage »). -->
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
            <Package class="agg-item-placeholder" />
          </span>
          <span class="agg-item-copy">
            <strong>{{ item.itemName }}</strong>
            <small>{{ item.countedStorageCount }}/{{ item.totalStorageCount }} {{ t('invFilterStorages') }}</small>
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
          <div v-if="item.storages.length" class="agg-shop-list" :aria-label="t('invAggDetailByStorage')">
            <div v-for="(st, idx) in item.storages" :key="idx" class="agg-shop-row">
              <span><Check v-if="st.isCounted" />{{ st.storageName }}</span>
              <strong>{{ formatUnits(st.totalUnits) }}</strong>
            </div>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script>
import { Package, Check, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'
import { currentIntlLocale } from '@/composables/useNumberFormat'

export default {
  name: 'InventoryStorageAggregateView',
  components: {
    Package,
    Check,
    ChevronDown,
    ChevronUp,
  },
  props: {
    inventoryCounts: { type: Object, required: true },
    // [{ element, storageInventory }] — mêmes entrées que les cartes de l'onglet.
    storagesWithInventory: { type: Array, required: true },
    // Mode focus : pendant le comptage d'un stockage, on n'affiche que SES
    // articles (id). null = agrégat global (tous stockages).
    focusStorageId: { type: [String, Number], default: null },
  },
  emits: ['start-count-storage'],
  setup() {
    return { t: useI18n().t }
  },
  data() {
    return {
      // Accordéon : détail d'un article agrégé déplié (clé = itemName-index).
      expandedAgg: {},
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
    /** Items d'une entrée storage (merchInventory toléré par symétrie). */
    entryItems(entry) {
      return [...(entry?.storageInventory || []), ...(entry?.merchInventory || [])]
    },
    entryName(entry) {
      return entry?.element?.displayName || entry?.element?.name || ''
    },
    countFor(entry, item) {
      const counts = this.inventoryCounts || {}
      const elId = entry?.element?.id
      const elCounts = counts[elId] || counts[String(elId)] || {}
      return elCounts[item.id] || elCounts[String(item.id)] || {}
    },
  },
  computed: {
    focusStorage() {
      if (this.focusStorageId == null) return null
      return (this.storagesWithInventory || []).find(
        (s) => String(s?.element?.id) === String(this.focusStorageId),
      ) || null
    },
    focusStorageName() {
      return this.entryName(this.focusStorage)
    },
    aggregatedInventory() {
      const storages = this.focusStorage ? [this.focusStorage] : (this.storagesWithInventory || [])

      // Dénominateur (sémantique ALL, comme les shops) : nb de stockages où
      // chaque article (par nom) apparaît. « Compté » = compté dans TOUS.
      const totalStoragesByName = new Map()
      storages.forEach((entry) => {
        const seen = new Set()
        this.entryItems(entry).forEach((it) => {
          if (!it?.name || seen.has(it.name)) return
          seen.add(it.name)
          totalStoragesByName.set(it.name, (totalStoragesByName.get(it.name) || 0) + 1)
        })
      })

      const aggregateMap = new Map()
      storages.forEach((entry) => {
        this.entryItems(entry).forEach((item) => {
          const itemName = item?.name
          if (!itemName) return
          const count = this.countFor(entry, item)
          // Items storage : pas de inventoryQuantityPackaged → facteur 1.
          const qtyPerPack = Number(item.inventoryQuantityPackaged || 1)
          const packedUnits = Number(count.packedUnits || 0)
          const looseUnits = Number(count.looseUnits || 0)
          const totalUnits = packedUnits * qtyPerPack + looseUnits
          const isCounted = !!count.isCounted

          if (!aggregateMap.has(itemName)) {
            aggregateMap.set(itemName, {
              itemName,
              totalPackedUnits: 0,
              totalLooseUnits: 0,
              totalUnits: 0,
              countedStorageCount: 0,
              totalStorageCount: totalStoragesByName.get(itemName) || 0,
              isCounted: false,
              storages: [],
            })
          }
          const aggregated = aggregateMap.get(itemName)
          aggregated.totalPackedUnits += packedUnits
          aggregated.totalLooseUnits += looseUnits
          aggregated.totalUnits += totalUnits
          if (isCounted) aggregated.countedStorageCount += 1
          aggregated.storages.push({
            storageName: this.entryName(entry),
            floorName: entry?.element?.floorName || '',
            packedUnits,
            looseUnits,
            totalUnits,
            isCounted,
          })
        })
      })

      const rows = Array.from(aggregateMap.values()).map((a) => ({
        ...a,
        isCounted: a.totalStorageCount > 0 && a.countedStorageCount >= a.totalStorageCount,
      }))
      // Mode focus : ordre du stockage conservé (les lignes ne sautent pas
      // pendant la saisie). Sinon : à compter d'abord, puis unités desc, puis nom.
      if (this.focusStorage) return rows
      return rows.sort((a, b) => {
        if (a.isCounted !== b.isCounted) return a.isCounted ? 1 : -1
        if (b.totalUnits !== a.totalUnits) return b.totalUnits - a.totalUnits
        return String(a.itemName).localeCompare(String(b.itemName))
      })
    },
    /** Stockages où il reste au moins un article non compté — jumeau de
     *  `uncountedShops` (InventoryAggregateView). Les stockages sans article
     *  assigné sont écartés : rien à y compter. */
    uncountedStorages() {
      return (this.storagesWithInventory || []).filter((entry) => {
        const items = this.entryItems(entry)
        if (!items.length) return false
        return items.some((it) => !this.countFor(entry, it).isCounted)
      })
    },
    stats() {
      const totalItems = this.aggregatedInventory.length
      const countedItems = this.aggregatedInventory.filter((item) => item.isCounted).length
      const totalUnits = this.aggregatedInventory.reduce(
        (sum, item) => sum + Number(item.totalUnits || 0), 0,
      )
      // Même périmètre que `totalItems` : en mode focus l'agrégat est réduit au
      // stockage en cours, la tuile Stockages doit l'être aussi.
      const storagesToCount = this.focusStorage
        ? (countedItems < totalItems ? 1 : 0)
        : this.uncountedStorages.length
      return {
        totalItems,
        countedItems,
        totalUnits,
        itemsToCount: Math.max(0, totalItems - countedItems),
        storagesToCount,
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
/* Vocabulaire agg-* partagé avec InventoryAggregateView (copie ciblée). */
.si-aggregate-root {
  background: var(--fb-surface, #FFFFFF);
  color: var(--fb-text, #212121);
  font-size: 12px;
  line-height: 1.35;
}

.agg-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--fb-border, #EEEEEE);
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

.agg-focus-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  background: rgba(255, 110, 64, 0.12);
  color: #c2410c;
  font-size: 11px;
  font-weight: 600;
}
.agg-focus-hint svg { width: 12px; height: 12px; }

.agg-stats {
  display: grid;
  /* 4 tuiles (parité InventoryAggregateView) : 2×2 sous 380px. */
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 9px;
  background: var(--fb-border, #e5e7eb);
}

@media (max-width: 380px) {
  .agg-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.agg-stats > div {
  min-width: 0;
  padding: 8px 7px;
  background: var(--fb-subtle, #fafafa);
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

.agg-empty {
  padding: 24px 22px;
  text-align: center;
  color: var(--fb-muted, #6b7280);
}
.agg-empty-icon {
  width: 34px;
  height: 34px;
  margin: 0 auto 10px;
  display: block;
  opacity: 0.5;
}
.agg-empty p { margin: 0; font-size: 12px; }

.agg-list {
  display: grid;
  gap: 7px;
  padding: 10px;
}

.agg-item {
  overflow: hidden;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 10px;
  background: var(--fb-surface, #fff);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.agg-item:hover {
  border-color: rgba(255, 49, 49, 0.26);
  box-shadow: var(--fb-shadow-hover, 0 4px 16px rgba(15, 23, 42, 0.08));
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

/* ===================== DARK MODE =====================
   Même contrat que InventoryAggregateView : seules les teintes sémantiques
   pensées pour un fond clair sont reprises ici. */
.v-theme--dataFridayDark .agg-title-row h3 {
  color: #94a3b8;
}
.v-theme--dataFridayDark .agg-item.is-complete {
  border-color: rgba(34, 197, 94, 0.35);
}
.v-theme--dataFridayDark .agg-focus-hint {
  background: rgba(255, 110, 64, 0.18);
  color: #fdba74;
}
</style>
