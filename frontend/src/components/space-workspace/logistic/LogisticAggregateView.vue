<template>
  <aside class="lg-agg">
    <div class="lg-agg-head">
      <span class="lg-agg-title">
        <v-icon size="16" class="mr-1">mdi-alert-decagram-outline</v-icon>
        {{ t('logiAggTitle') }}
      </span>
    </div>

    <div v-if="loading" class="lg-agg-stats">
      <v-skeleton-loader v-for="n in 3" :key="n" type="text" class="lg-agg-stat-skeleton" />
    </div>
    <div v-else class="lg-agg-stats">
      <div class="lg-agg-stat lg-agg-stat-bad">
        <div class="lg-agg-stat-num">{{ stats.bad }}</div>
        <div class="lg-agg-stat-lbl">{{ t('logiAggStatRuptures') }}</div>
      </div>
      <div class="lg-agg-stat lg-agg-stat-warn">
        <div class="lg-agg-stat-num">{{ stats.warn }}</div>
        <div class="lg-agg-stat-lbl">{{ t('logiAggStatLow') }}</div>
      </div>
      <div class="lg-agg-stat">
        <div class="lg-agg-stat-num">{{ stats.uncounted }}</div>
        <div class="lg-agg-stat-lbl">{{ t('logiAggStatUncounted') }}</div>
      </div>
    </div>

    <div v-if="loading" class="lg-agg-list">
      <v-skeleton-loader v-for="n in 5" :key="n" type="list-item-two-line" />
    </div>

    <div v-else-if="!groupedItems.length" class="lg-agg-empty">
      {{ t('logiAggEmpty') }}
    </div>

    <!-- 1 carte = 1 denrée (repliée par défaut), PDV concernés en sous-niveau —
         évite le scroll interminable d'une liste à plat (retour utilisateur). -->
    <div v-else class="lg-agg-list">
      <div
        v-for="group in groupedItems"
        :key="group.itemName"
        class="lg-agg-group-card"
        :class="{ 'lg-agg-group-bad': group.worstStatus === 'bad' }"
      >
        <button
          type="button"
          class="lg-agg-group-trigger"
          :aria-expanded="isExpanded(group.itemName)"
          @click="toggleGroup(group.itemName)"
        >
          <span class="lg-agg-item-icon" :class="{ 'lg-agg-item-icon-bad': group.worstStatus === 'bad', 'lg-agg-item-icon-warn': group.worstStatus !== 'bad' }">
            <img
              v-if="group.picture && !failedPictures.has(group.itemName)"
              :src="group.picture"
              :alt="group.itemName"
              @error="failedPictures.add(group.itemName)"
            />
            <v-icon v-else size="16">{{ group.worstStatus === 'bad' ? 'mdi-alert-circle' : 'mdi-alert' }}</v-icon>
          </span>
          <span class="lg-agg-item-copy">
            <strong>{{ group.itemName }}</strong>
            <small>{{ group.rows.length }} {{ t('logiAggShopsSuffix') }}</small>
          </span>
          <span class="lg-agg-item-total">
            <strong :class="group.badCount ? 'lg-agg-total-bad' : 'lg-agg-total-warn'">
              {{ group.badCount || group.warnCount }}
            </strong>
            <small>{{ group.badCount ? t('logiAggStatRuptures') : t('logiAggStatLow') }}</small>
          </span>
          <v-icon size="16" class="lg-agg-item-chevron">
            {{ isExpanded(group.itemName) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
          </v-icon>
        </button>

        <div v-show="isExpanded(group.itemName)" class="lg-agg-group-detail">
          <button
            v-for="row in group.rows"
            :key="`${row.elementId}::${row.itemName}`"
            type="button"
            class="lg-agg-item lg-agg-item-sub"
            :class="{ 'lg-agg-item-bad': row.status === 'bad', 'lg-agg-item-warn': row.status !== 'bad' }"
            @click="$emit('go', { elementId: row.elementId, itemName: row.itemName })"
          >
            <span class="lg-agg-item-icon">
              <v-icon size="16">{{ row.status === 'bad' ? 'mdi-alert-circle' : 'mdi-alert' }}</v-icon>
            </span>
            <span class="lg-agg-item-copy">
              <strong>{{ row.elementName }}</strong>
            </span>
            <span class="lg-agg-item-total">
              <strong>{{ row.packed }} · {{ formatUnits(row.loose) }}</strong>
              <small>{{ t('logiPackedShort') }} · {{ t('logiLooseShort') }}</small>
            </span>
            <v-icon size="16" class="lg-agg-item-chevron">mdi-chevron-right</v-icon>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'

/**
 * 3e colonne Logistic : agrégat transversal des ruptures/stock bas sur TOUT
 * l'espace, groupé par denrée (miroir InventoryAggregateView) — 1 carte par
 * article, repliée par défaut, PDV concernés en sous-niveau dépliable. Purement
 * présentiel — le parent calcule `stats` et gère le `@go` (drill-in + popup
 * Ajouter direct sur l'élément/denrée cliqué).
 */
export default {
  name: 'LogisticAggregateView',
  props: {
    /** { bad, warn, uncounted, rows: [{elementId, elementName, itemName, status, packed, loose, picture}] } */
    stats: {
      type: Object,
      default: () => ({ bad: 0, warn: 0, uncounted: 0, rows: [] }),
    },
    loading: { type: Boolean, default: false },
  },
  emits: ['go'],
  setup() {
    const { t } = useI18n()
    return { t, formatUnits }
  },
  data() {
    // Accordéon replié par défaut (évite le scroll interminable) + repli d'image
    // par denrée (une seule icône par carte, clé = itemName).
    return { expandedGroups: {}, failedPictures: new Set() }
  },
  methods: {
    isExpanded(key) {
      return !!this.expandedGroups[key]
    },
    toggleGroup(key) {
      this.expandedGroups = { ...this.expandedGroups, [key]: !this.expandedGroups[key] }
    },
  },
  computed: {
    /** Lignes ruptures/stock bas groupées par denrée, triées par sévérité puis nombre de PDV touchés. */
    groupedItems() {
      const map = new Map()
      for (const row of this.stats.rows) {
        let group = map.get(row.itemName)
        if (!group) {
          group = { itemName: row.itemName, picture: row.picture || null, rows: [] }
          map.set(row.itemName, group)
        }
        group.rows.push(row)
        if (!group.picture && row.picture) group.picture = row.picture
      }
      return [...map.values()]
        .map((g) => {
          const badCount = g.rows.filter((r) => r.status === 'bad').length
          const warnCount = g.rows.length - badCount
          return { ...g, badCount, warnCount, worstStatus: badCount > 0 ? 'bad' : 'warn' }
        })
        .sort((a, b) => {
          if (a.worstStatus !== b.worstStatus) return a.worstStatus === 'bad' ? -1 : 1
          if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length
          return a.itemName.localeCompare(b.itemName, 'fr')
        })
    },
  },
}
</script>

<style scoped>
.lg-agg {
  /* Carte englobante = style « Résumé inventaire » de Space Inventory (look EP :
     radius 18, border #d9e2ec, ombre douce). Plus de simple border-left. */
  background: var(--fb-surface, #ffffff);
  border: 1px solid var(--fb-border, #d9e2ec);
  border-radius: 18px;
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.04));
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* Colonne étirée à la hauteur de .lg-layout (parent, align-items:stretch) —
     seule la liste défile (ci-dessous), jamais la page (cf. .space-logistic-view). */
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.lg-agg-head { display: flex; align-items: center; flex-shrink: 0; }
.lg-agg-title {
  display: flex;
  align-items: center;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--fb-text, #212121);
}

.lg-agg-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; flex-shrink: 0; }
.lg-agg-stat {
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-control, 8px);
  padding: 7px 5px;
  text-align: center;
  background: var(--fb-subtle, #fafafa);
}
.lg-agg-stat-skeleton { height: 52px; border-radius: var(--fb-radius-control, 8px); }
.lg-agg-stat-bad { border-color: rgba(255, 49, 49, 0.3); background: var(--fb-danger-soft, #fef2f2); }
.lg-agg-stat-warn { border-color: rgba(217, 119, 6, 0.3); background: var(--fb-warning-soft, #fffbeb); }
.lg-agg-stat-num { font-size: 1.05rem; font-weight: 800; color: var(--fb-text, #212121); font-variant-numeric: tabular-nums; }
.lg-agg-stat-lbl { font-size: 0.6rem; color: var(--fb-muted, #6b7280); margin-top: 1px; }

.lg-agg-empty {
  font-size: 0.8rem;
  color: var(--fb-faint, #9ca3af);
  text-align: center;
  padding: 20px 8px;
}

.lg-agg-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
  margin-right: -4px;
}

/* Carte de groupe (1 par denrée) : reprend le style de carte de InventoryAggregateView. */
.lg-agg-group-card {
  /* Carte item = parité InventoryAggregateView (.agg-item : border #e5e7eb,
     radius 10, fond blanc). */
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 10px;
  background: var(--fb-surface, #ffffff);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.lg-agg-group-card:hover {
  border-color: rgba(255, 49, 49, 0.26);
  box-shadow: var(--fb-shadow-hover, 0 3px 12px rgba(15, 23, 42, 0.08));
}
.lg-agg-group-bad { border-color: rgba(255, 49, 49, 0.22); }

.lg-agg-group-trigger {
  appearance: none;
  width: 100%;
  box-sizing: border-box;
  min-height: 52px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 9px;
  padding: 9px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.lg-agg-group-trigger:focus-visible {
  outline: 2px solid rgba(255, 49, 49, 0.45);
  outline-offset: -2px;
}

.lg-agg-group-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 9px 9px;
  border-top: 1px dashed var(--fb-border, #e5e7eb);
}
.lg-agg-group-detail .lg-agg-item-sub {
  margin: 0;
  width: 100%;
}

.lg-agg-item-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--fb-subtle, #f7f7f8);
}
.lg-agg-item-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.lg-agg-item-icon-bad { background: var(--fb-danger-soft, #fef2f2); color: var(--fb-danger, #ff3131); }
.lg-agg-item-icon-warn { background: var(--fb-warning-soft, #fffbeb); color: var(--fb-warning, #d97706); }

.lg-agg-item-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lg-agg-item-copy strong {
  font-size: 12px;
  font-weight: 700;
  color: var(--fb-text, #111827);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lg-agg-item-copy small {
  font-size: 9.5px;
  color: var(--fb-muted, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lg-agg-item-total {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  text-align: right;
}
.lg-agg-item-total strong {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.lg-agg-total-bad { color: var(--fb-danger, #ff3131); }
.lg-agg-total-warn { color: var(--fb-warning, #d97706); }
.lg-agg-item-total small {
  font-size: 9.5px;
  color: var(--fb-muted, #6b7280);
  white-space: nowrap;
}
.lg-agg-item-chevron { color: var(--fb-faint, #9ca3af); }

/* Ligne PDV en sous-niveau (dépliée) : carte plus discrète que le header de groupe. */
.lg-agg-item {
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
  min-height: 44px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto 14px;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-control, 8px);
  padding: 7px 8px;
  background: var(--fb-subtle, #fafafa);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: border-color 160ms ease, background 160ms ease;
}
.lg-agg-item:hover {
  border-color: rgba(255, 49, 49, 0.26);
  background: rgba(255, 49, 49, 0.05);
}
.lg-agg-item .lg-agg-item-icon { width: 28px; height: 28px; background: transparent; }
.lg-agg-item-bad .lg-agg-item-icon { color: var(--fb-danger, #ff3131); }
.lg-agg-item-warn .lg-agg-item-icon { color: var(--fb-warning, #d97706); }
.lg-agg-item-bad .lg-agg-item-total strong { color: var(--fb-danger, #ff3131); }
.lg-agg-item-warn .lg-agg-item-total strong { color: var(--fb-warning, #d97706); }

@media (max-width: 900px) {
  /* Empilé sous la liste et les filtres (cf. .lg-layout du parent) — plus de
     colonne sticky, juste un bloc de fin de page borné à sa propre hauteur. */
  .lg-agg {
    border-left: none;
    border-top: 1px solid var(--fb-border, #e5e7eb);
    padding: 16px 0 0;
    position: static;
    order: 3;
    max-height: 70vh;
  }
}
</style>
