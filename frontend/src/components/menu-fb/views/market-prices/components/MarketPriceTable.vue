<template>
  <v-card rounded="lg" elevation="0" border :class="{ 'market-table--dark': isDark }">
    <v-card-text class="pa-0">
      <v-data-table
        :headers="headers"
        :items="items"
        :loading="loading"
        item-value="id"
        density="compact"
        class="market-table"
        :expanded="expanded"
        :items-per-page="25"
        :items-per-page-options="[
          { value: 25, title: '25' },
          { value: 50, title: '50' },
          { value: 100, title: '100' },
          { value: -1, title: 'Tout' },
        ]"
        @update:expanded="$emit('update:expanded', $event)"
      >
        <!-- Bandeau de chargement propre à la page (mpl-loader, rouge) déjà affiché au-dessus
             du tableau : on désactive la barre native (noire par défaut) pour ne pas en avoir deux. -->
        <template #loader></template>

        <template #item.expand="{ item }">
          <v-btn
            variant="text"
            density="compact"
            size="small"
            icon
            @click.stop="$emit('toggle-expand', item)"
          >
            <ChevronDown v-if="isExpanded(item)" :size="18" />
            <ChevronRight v-else :size="18" />
          </v-btn>
        </template>

        <template #item.image="{ item }">
          <v-avatar rounded="lg" size="36" color="#F3F4F6">
            <v-img v-if="item.image" :src="item.image" cover />
            <ImageOff v-else :size="18" />
          </v-avatar>
        </template>

        <template #item.name="{ item }">
          <div class="d-flex align-center" style="gap: 10px">
            <div class="font-weight-medium">{{ item.name }}</div>
            <span class="mpt-chip-supplier">
              {{ `${item.suppliersCount} ${item.suppliersCount > 1 ? 'suppliers' : 'supplier'}` }}
            </span>
          </div>
        </template>

        <template #item.goodType="{ item }">
          <span
            class="mpt-chip-type"
            :style="{ background: getGoodTypeChipBg(item.goodType), color: getGoodTypeChipColor(item.goodType), borderColor: getGoodTypeChipBorder(item.goodType) }"
          >
            {{ item.goodType }}
          </span>
        </template>

        <template #item.actions="{ item }">
          <div class="market-actions">
            <div class="mpt-action-btn mpt-action-btn--add" @click.stop="$emit('add-supplier', item)">
              <Plus :size="15" />
            </div>
            <div class="mpt-action-btn mpt-action-btn--edit" @click.stop="$emit('edit-item', item)">
              <Pencil :size="15" />
            </div>
            <div class="mpt-action-btn mpt-action-btn--delete" @click.stop="$emit('delete-item', item)">
              <Trash2 :size="15" />
            </div>
          </div>
        </template>

        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length" class="market-table__expanded-cell">
              <div class="market-expanded">
                <div class="market-expanded__inner">
                  <table class="market-expanded__table w-100">
                    <thead>
                      <tr class="market-expanded__thead-row">
                        <th v-for="h in supplierHeaders" :key="h.key" class="market-expanded__th text-left">
                          {{ h.title }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="row in getSupplierRows(item)"
                        :key="row.id"
                        class="market-expanded__tbody-row"
                      >
                        <td class="market-expanded__td">{{ row.supplierName || "-" }}</td>
                        <td class="market-expanded__td">{{ row.supplierItemName || "-" }}</td>
                        <td class="market-expanded__td">{{ row.unit || "-" }}</td>
                        <td class="market-expanded__td">{{ row.unitsPerPurchase ?? "-" }}</td>
                        <td class="market-expanded__td">{{ formatPrice(row.price) }}</td>
                        <td class="market-expanded__td">{{ formatPrice(row.pricePerUnit) }}</td>
                        <td class="market-expanded__td" style="font-weight:600">{{ formatPrice(row.recipeUnitCost) }}</td>
                        <td class="market-expanded__td">{{ row.purchasePackaging || "-" }}</td>
                        <td class="market-expanded__td">{{ formatAddedAt(row.addedAt) }}</td>
                        <td class="market-expanded__td">
                          <div class="market-actions">
                            <div class="mpt-action-btn mpt-action-btn--edit" @click.stop="$emit('edit-supplier-row', item, row)">
                              <Pencil :size="14" />
                            </div>
                            <div class="mpt-action-btn mpt-action-btn--delete" @click.stop="$emit('delete-supplier-row', item, row)">
                              <Trash2 :size="14" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </v-data-table>
    </v-card-text>
  </v-card>
</template>

<script>
import { ChevronDown, ChevronRight, ImageOff, Pencil, Plus, Trash2 } from 'lucide-vue-next';

export default {
  name: 'MarketPriceTable',
  components: {
    ChevronDown,
    ChevronRight,
    ImageOff,
    Pencil,
    Plus,
    Trash2,
  },
  props: {
    isDark: {
      type: Boolean,
      default: false,
    },
    headers: {
      type: Array,
      required: true,
    },
    items: {
      type: Array,
      required: true,
    },
    loading: {
      type: Boolean,
      default: false,
    },
    expanded: {
      type: Array,
      default: () => [],
    },
    supplierHeaders: {
      type: Array,
      required: true,
    },
  },
  emits: ['update:expanded', 'toggle-expand', 'add-supplier', 'edit-item', 'delete-item', 'edit-supplier-row', 'delete-supplier-row'],
  methods: {
    // Affiche la date « Added » au format dd/mm/yyyy hh:mm.
    formatAddedAt(value) {
      if (!value || value === '-') return '-';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '-';
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    isExpanded(item) {
      const id = item?.id || item?.value?.id;
      return this.expanded.some(e => (e?.id || e?.value?.id) === id);
    },
    getSupplierRows(item) {
      const raw = item?.raw || item?.value || item;
      return raw?.supplierRows || [];
    },
    formatPrice(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return "€0.00";
      return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
    },
    getGoodTypeColor(goodType) {
      const colors = {
        'Food': '#10b981',
        'Beverage': '#3b82f6',
        'Non-Food': '#f59e0b',
        'Supply': '#8b5cf6',
        'Equipment': '#ff3131',
      };
      return colors[goodType] || '#6b7280';
    },
    getGoodTypeChipBg(goodType) {
      const map = {
        'Food': '#f0fdf4',
        'Beverage': '#eff6ff',
        'Non-Food': '#fffbeb',
        'Supply': '#f5f3ff',
        'Equipment': '#fef2f2',
      };
      return map[goodType] || '#f3f4f6';
    },
    getGoodTypeChipColor(goodType) {
      const map = {
        'Food': '#16a34a',
        'Beverage': '#2563eb',
        'Non-Food': '#d97706',
        'Supply': '#7c3aed',
        'Equipment': '#ff3131',
      };
      return map[goodType] || '#6b7280';
    },
    getGoodTypeChipBorder(goodType) {
      const map = {
        'Food': '#bbf7d0',
        'Beverage': '#bfdbfe',
        'Non-Food': '#fde68a',
        'Supply': '#ddd6fe',
        'Equipment': '#fecaca',
      };
      return map[goodType] || '#e5e7eb';
    },
  },
};
</script>

<style scoped>
/* === Main table === */
.market-table :deep(.v-data-table__td) {
  vertical-align: middle;
}

.market-table :deep(.v-data-table__th),
.market-table :deep(.v-data-table__td) {
  font-size: 13px;
  padding-top: 10px;
  padding-bottom: 10px;
}

.market-table :deep(.v-data-table__th) {
  padding-left: 16px;
  padding-right: 16px;
  font-size: 11px !important;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9ca3af !important;
  background: #fafafa !important;
}

.market-table :deep(.v-data-table__td) {
  padding-left: 16px;
  padding-right: 16px;
}

.market-table :deep(tbody tr:hover td) {
  background: #fafafa !important;
}

/* === Chips === */
.mpt-chip-supplier {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  border-radius: 100px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  display: inline-block;
}

.mpt-chip-type {
  border: 1px solid;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  display: inline-block;
}

/* === Action buttons === */
.market-actions {
  display: flex;
  gap: 4px;
}

.mpt-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #f3f4f6;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.mpt-action-btn--edit:hover {
  background: #e5e7eb;
  color: #374151;
}

.mpt-action-btn--delete:hover {
  background: #fef2f2;
  color: #ff3131;
}

.mpt-action-btn--add:hover {
  background: #eff6ff;
  color: #2563eb;
}

/* === Expanded row === */
.market-table__expanded-cell {
  padding: 12px 16px !important;
  background: #f8fafc !important;
}

.market-expanded {
  margin: 4px 0;
}

.market-expanded__inner {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  background: white;
}

.market-expanded__table {
  border-collapse: collapse;
}

.market-expanded__thead-row {
  background: #f9fafb;
}

.market-expanded__th {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9ca3af;
  padding: 8px 12px;
  white-space: nowrap;
  border-bottom: 1px solid #e5e7eb;
}

.market-expanded__tbody-row:hover .market-expanded__td {
  background: #fafafa;
}

.market-expanded__td {
  font-size: 12.5px;
  padding: 8px 12px;
  color: #374151;
  border-bottom: 1px solid #f3f4f6;
  white-space: nowrap;
}

.market-expanded__tbody-row:last-child .market-expanded__td {
  border-bottom: none;
}

/* ── Dark mode ── */
.market-table--dark .market-table :deep(.v-data-table__th) { color: #94a3b8 !important; background: #1a2332 !important; }
.market-table--dark .market-table :deep(tbody tr:hover td) { background: rgba(255,255,255,.03) !important; }
.market-table--dark .mpt-chip-supplier { background: rgba(37,99,235,.15); color: #93c5fd; border-color: rgba(37,99,235,.3); }
.market-table--dark .mpt-action-btn { background: rgba(255,255,255,.08); color: #94a3b8; }
.market-table--dark .mpt-action-btn--edit:hover { background: rgba(255,255,255,.14); color: #e2e8f0; }
.market-table--dark .market-table__expanded-cell { background: #0f172a !important; }
.market-table--dark .market-expanded__inner { border-color: rgba(255,255,255,.08); background: #1e293b; }
.market-table--dark .market-expanded__thead-row { background: #1a2332; }
.market-table--dark .market-expanded__th { color: #94a3b8; border-bottom-color: rgba(255,255,255,.08); }
.market-table--dark .market-expanded__tbody-row:hover .market-expanded__td { background: rgba(255,255,255,.03); }
.market-table--dark .market-expanded__td { color: #cbd5e1; border-bottom-color: rgba(255,255,255,.06); }
</style>
