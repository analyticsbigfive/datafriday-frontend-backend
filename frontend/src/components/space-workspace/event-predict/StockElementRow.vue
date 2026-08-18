<template>
  <div class="sel-row" :class="{ 'is-expanded': isExpanded }">
    <div class="sel-main">
      <p class="sel-name">
        {{ name }}
        <span v-if="itemTypeLabel" class="sel-type" :class="itemTypeClass">{{ itemTypeLabel }}</span>
      </p>

      <!-- « Utilisé dans » : quel(s) plat(s) consomment cet élément, et pour quelle part. -->
      <div v-if="sources.length" class="sel-sources">
        <p v-for="(source, sIdx) in sources" :key="sIdx" class="sel-source">
          {{ t('epsSourceFor') }} {{ Math.round(source.menuItemQuantity) }} ×
          {{ source.menuItemName }} {{ t('epsSourcePredicted') }} →
          {{ formatQty(source.componentQuantity) }}
          {{ source.unit }} {{ t('epsSourceNeeded') }}
        </p>
      </div>

      <!-- Répartition par point de vente : masquée en vue PDV (on y est déjà). -->
      <div v-if="shops.length" class="sel-shops">
        <span class="sel-shops-label">{{ t('epsShopBreakdownLabel') }}</span>
        <span
          v-for="s in shops"
          :key="s.shopId"
          class="sel-shop"
          :title="t('epsShopPillTitle')"
        >
          {{ s.shopName }}: {{ formatQty(s.quantity) }} {{ unit }}
        </span>
      </div>
    </div>

    <div class="sel-aside">
      <template v-if="packaging">
        <Badge variant="default" class="sel-pkg">
          {{ packaging.packedCount }} {{ packaging.packagingType }} {{ t('epsPackagingOf') }}
          {{ packaging.packagingUnitNumber }} {{ packaging.packagingUnit }}
        </Badge>
        <span class="sel-pkg-sub">
          ≈ {{ formatQty(packaging.looseQty) }} {{ packaging.packagingUnit }}
        </span>
      </template>
      <Badge v-else variant="secondary" class="sel-qty" :title="t('epsTotalQtyTitle')">
        {{ formatQty(totalQuantity) }} {{ unit }}
      </Badge>
      <span v-if="lineCost > 0" class="sel-cost" :title="costTitle">
        {{ formatCurrency(lineCost) }}
      </span>
    </div>
  </div>
</template>

<script>
/**
 * Ligne d'élément stockable — BUG-291-01.
 *
 * Composant UNIQUE partagé par les deux modes du Stock-up (« Par PDV » et
 * « Par article ») : les deux lisent déjà la même source (`shopStockData`), ce
 * composant garantit qu'ils ne peuvent pas non plus diverger d'AFFICHAGE.
 * Le markup était auparavant dupliqué inline dans les deux vues, avec un coût
 * affiché d'un seul côté.
 */
import Badge from '../ui/badge.vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrencyDetailed as fmtCurrency } from '@/composables/useFormatters'

export default {
  name: 'StockElementRow',
  components: { Badge },

  props: {
    name: { type: String, required: true },
    unit: { type: String, default: 'unit' },
    totalQuantity: { type: Number, default: 0 },
    /** Coût d'UNE unité de recette (€/Kg, €/Pc…). 0 → colonne coût masquée. */
    unitCost: { type: Number, default: 0 },
    /** 'Ingredient' | 'Component' | 'Packaging' | null */
    itemType: { type: String, default: null },
    /** Éclaté depuis une recette (vs article prêt à vendre stocké tel quel). */
    isExpanded: { type: Boolean, default: false },
    /** [{ menuItemName, menuItemQuantity, componentQuantity, unit }] */
    sources: { type: Array, default: () => [] },
    /** [{ shopId, shopName, quantity }] — vide en vue PDV. */
    shops: { type: Array, default: () => [] },
    /** Sortie de computePackagingForQuantity, ou null. */
    packaging: { type: Object, default: null },
  },

  setup() {
    const { t } = useI18n()
    return { t }
  },

  computed: {
    lineCost() {
      return (Number(this.unitCost) || 0) * (Number(this.totalQuantity) || 0)
    },
    costTitle() {
      return `${this.t('epsUnitCostTitle')} ${fmtCurrency(this.unitCost)} × ${this.formatQty(this.totalQuantity)} ${this.unit}`
    },
    itemTypeLabel() {
      const keys = {
        Ingredient: 'epsTypeIngredient',
        Component: 'epsTypeComponent',
        Packaging: 'epsTypePackaging',
      }
      const k = keys[this.itemType]
      return k ? this.t(k) : null
    },
    itemTypeClass() {
      return `is-${String(this.itemType || '').toLowerCase()}`
    },
  },

  methods: {
    formatCurrency(v) {
      return fmtCurrency(Number(v) || 0)
    },
    /** Entier si la quantité l'est (105 Pc), sinon 1 décimale (4,2 Kg). */
    formatQty(v) {
      const n = Number(v) || 0
      return Number.isInteger(n) ? String(n) : n.toFixed(1)
    },
  },
}
</script>

<style scoped>
.sel-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--fb-border, #e5e7eb);
}
.sel-row:last-child {
  border-bottom: 0;
}
.sel-main {
  min-width: 0;
  flex: 1 1 auto;
}
.sel-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--fb-text, #111827);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.sel-type {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid var(--fb-border, #e5e7eb);
  color: var(--fb-text-muted, #6b7280);
}
.sel-type.is-component {
  color: #1f5d4c;
  border-color: #1f5d4c;
}
.sel-type.is-packaging {
  color: #8a6015;
  border-color: #8a6015;
}
.sel-sources {
  margin-top: 3px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.sel-source {
  font-size: 12px;
  color: var(--fb-text-muted, #6b7280);
}
.sel-shops {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 5px;
}
.sel-shops-label {
  font-size: 11px;
  color: var(--fb-text-muted, #6b7280);
}
.sel-shop {
  font-size: 11px;
  padding: 1px 6px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 3px;
  color: var(--fb-text-muted, #6b7280);
  white-space: nowrap;
}
.sel-aside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex: 0 0 auto;
  text-align: right;
}
.sel-pkg-sub {
  font-size: 11px;
  color: var(--fb-text-muted, #6b7280);
}
.sel-cost {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--fb-text-muted, #6b7280);
}
</style>
