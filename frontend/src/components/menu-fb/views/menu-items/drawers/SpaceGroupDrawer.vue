<template>
  <Teleport to="body">
    <Transition name="sgd">
      <div v-if="modelValue" class="sgd-overlay" @click.self="close">
        <div class="sgd-panel" :class="{ 'sgd-panel--dark': isDark }">

          <!-- Header -->
          <div class="sgd-header">
            <div class="sgd-header__icon"><Building2 :size="20" color="white" /></div>
            <div class="sgd-header__text">
              <div class="sgd-header__title">{{ selectable ? t('menuItemCreate.spacesDrawerTitle') : t('menuItemCreate.spacesDrawerViewTitle') }}</div>
              <div class="sgd-header__sub">
                <template v-if="selectable">{{ t('menuItemCreate.spacesDrawerSubtitle') }}</template>
                <template v-else>{{ spaceIds.length }} {{ t('menuItemCreate.spacesDrawerViewSubtitle') }}</template>
              </div>
            </div>
            <button class="sgd-header__close" @click="close"><X :size="16" /></button>
          </div>

          <!-- Search (selection mode only) -->
          <div v-if="selectable" class="sgd-search">
            <v-text-field
              v-model="search"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              :placeholder="t('menuItemCreate.spacesDrawerSearch')"
              prepend-inner-icon="mdi-magnify"
              clearable
            />
          </div>

          <!-- Body -->
          <div class="sgd-body">
            <div v-if="!displayedSpaces.length" class="sgd-empty">
              {{ t('menuItemCreate.spacesDrawerNoData') }}
            </div>

            <div v-else class="sgd-cards">
              <div
                v-for="space in displayedSpaces"
                :key="space.id || space._id"
                class="sgd-card"
                :class="{ 'sgd-card--selected': selectable && isSelected(space.id || space._id) }"
                @click="selectable && toggleSpace(space.id || space._id)"
              >
                <div class="sgd-card__top">
                  <v-checkbox
                    v-if="selectable"
                    :model-value="isSelected(space.id || space._id)"
                    density="compact"
                    hide-details
                    color="#111827"
                    class="sgd-checkbox"
                    @update:model-value="val => setSelected(space.id || space._id, val)"
                    @click.stop
                  />
                  <span class="sgd-dot" />
                  <div class="sgd-card__info">
                    <div class="sgd-card__name-row">
                      <span class="sgd-card__name">{{ space.name }}</span>
                      <v-chip
                        v-if="space.spaceType"
                        size="x-small"
                        variant="tonal"
                        color="#ff3131"
                        rounded="lg"
                        class="sgd-chip"
                      >
                        {{ space.spaceType }}
                      </v-chip>
                    </div>
                    <!-- View mode: afficher TTC/HT/Marge du groupe de prix -->
                    <div v-if="!selectable && groupPrice" class="sgd-card__meta">
                      <span>TTC {{ formatCurrency(groupPrice) }}</span>
                      <span class="sgd-meta-sep">·</span>
                      <span>HT {{ formatCurrency(groupHT) }}</span>
                      <span v-if="groupMarginText !== null" class="sgd-meta-sep">·</span>
                      <span v-if="groupMarginText !== null" :class="groupMarginClass">Marge {{ groupMarginText }}</span>
                    </div>
                    <!-- Selection mode: afficher département et capacité -->
                    <div v-else-if="selectable && (space.department || space.maxCapacity || space.capacity)" class="sgd-card__meta">
                      <span v-if="space.department">{{ t('menuItemCreate.spacesDrawerDept') }} {{ space.department }}</span>
                      <span v-if="space.department && (space.maxCapacity || space.capacity)" class="sgd-meta-sep">·</span>
                      <span v-if="space.maxCapacity || space.capacity">{{ (space.maxCapacity || space.capacity).toLocaleString() }} cap.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer (selection mode only) -->
          <div v-if="selectable" class="sgd-footer">
            <span class="sgd-footer__count">{{ localIds.length }} {{ t('menuItemCreate.spacesCount') }}</span>
            <div class="sgd-footer__actions">
              <button class="sgd-fbtn sgd-fbtn--cancel" @click="close">{{ t('menuItemCreate.cancel') }}</button>
              <button class="sgd-fbtn sgd-fbtn--primary" @click="confirm">{{ t('menuItemCreate.spacesDrawerConfirm') }}</button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { X, Building2 } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { formatCurrency } from '@/composables/useFormatters.js';

// Verrou de scroll partagé (module-level) : plusieurs instances de ce drawer
// peuvent être ouvertes simultanément (voir MenuItemCreateView.vue). On ne
// retire `overflow: hidden` que quand toutes les instances sont fermées.
let scrollLockCount = 0;
function lockBodyScroll() {
  scrollLockCount += 1;
  document.body.style.overflow = 'hidden';
}
function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = '';
  }
}

export default {
  name: 'SpaceGroupDrawer',
  components: { X, Building2 },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
    // view mode
    spaceIds: { type: Array, default: () => [] },
    groupPrice: { type: Number, default: 0 },
    vatRate: { type: Number, default: null },
    costPerPiece: { type: Number, default: 0 },
    // selection mode
    selectable: { type: Boolean, default: false },
    selectedIds: { type: Array, default: () => [] },
    // shared
    spaces: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue', 'confirm'],
  setup() {
    const { t } = useI18n();
    return { t, formatCurrency };
  },
  data() {
    return {
      search: '',
      localIds: [],
      scrollLocked: false,
    };
  },
  computed: {
    groupHT() {
      const vatRate = Number(this.vatRate) || 0;
      return vatRate > 0 ? this.groupPrice / (1 + vatRate / 100) : this.groupPrice;
    },
    groupMarginText() {
      if (!this.groupPrice || !this.costPerPiece) return null;
      const margin = ((this.groupPrice - this.costPerPiece) / this.groupPrice) * 100;
      return `${margin.toFixed(1)}%`;
    },
    groupMarginClass() {
      if (!this.groupPrice || !this.costPerPiece) return '';
      const margin = ((this.groupPrice - this.costPerPiece) / this.groupPrice) * 100;
      return margin >= 60 ? 'sgd-meta--success' : 'sgd-meta--error';
    },
    displayedSpaces() {
      if (this.selectable) {
        const q = String(this.search || '').toLowerCase().trim();
        if (!q) return this.spaces;
        return this.spaces.filter(s =>
          String(s.name || '').toLowerCase().includes(q) ||
          String(s.spaceType || '').toLowerCase().includes(q)
        );
      }
      return (this.spaces || []).filter(s => this.spaceIds.includes(s.id || s._id));
    },
  },
  watch: {
    modelValue(val) {
      if (val) {
        if (!this.scrollLocked) {
          lockBodyScroll();
          this.scrollLocked = true;
        }
        this.search = '';
        this.localIds = [...(this.selectedIds || [])];
      } else if (this.scrollLocked) {
        unlockBodyScroll();
        this.scrollLocked = false;
      }
    },
  },
  methods: {
    close() { this.$emit('update:modelValue', false); },
    isSelected(id) { return this.localIds.includes(id); },
    setSelected(id, val) {
      if (val) {
        if (!this.localIds.includes(id)) this.localIds = [...this.localIds, id];
      } else {
        this.localIds = this.localIds.filter(x => x !== id);
      }
    },
    toggleSpace(id) { this.setSelected(id, !this.isSelected(id)); },
    confirm() {
      this.$emit('confirm', { spaceIds: [...this.localIds] });
      this.$emit('update:modelValue', false);
    },
  },
  beforeUnmount() {
    if (this.scrollLocked) {
      unlockBodyScroll();
      this.scrollLocked = false;
    }
  },
};
</script>

<style scoped>
.sgd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 3000;
  display: flex;
  justify-content: flex-end;
}

.sgd-panel {
  width: 420px;
  max-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
}

.sgd-header {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49,.2);
}
.sgd-header__icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sgd-header__text { flex: 1; }
.sgd-header__title { font-size: 15px; font-weight: 700; color: #fff; }
.sgd-header__sub { font-size: 12px; color: rgba(255,255,255,.72); margin-top: 2px; }
.sgd-header__close {
  background: rgba(255,255,255,.15); border: none; cursor: pointer;
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; transition: background .15s;
}
.sgd-header__close:hover { background: rgba(255,255,255,.25); }

.sgd-search {
  flex-shrink: 0;
  padding: 12px 16px 8px;
  border-bottom: 1px solid #f3f4f6;
}

.sgd-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  background: #f9fafb;
}

.sgd-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 0.85rem;
  color: #9ca3af;
}

.sgd-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sgd-card {
  background: #ffffff;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 14px;
  transition: border-color 0.15s, background 0.15s;
}

.sgd-card[class*="selected"] {
  cursor: pointer;
}

.sgd-card--selected {
  border-color: #111827;
  background: #f8fafc;
}

.sgd-card:not(.sgd-card--selected):hover {
  border-color: #d1d5db;
  background: #fafafa;
}

.sgd-card__top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sgd-checkbox {
  flex-shrink: 0;
  margin-top: -2px;
}

.sgd-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2563eb;
  flex-shrink: 0;
}

.sgd-card__info {
  flex: 1;
  min-width: 0;
}

.sgd-card__name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 2px;
}

.sgd-card__name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #111827;
}

.sgd-chip {
  font-size: 0.68rem !important;
}

.sgd-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: #6b7280;
}

.sgd-meta-sep {
  color: #d1d5db;
}

.sgd-meta--success { color: #16a34a; font-weight: 600; }
.sgd-meta--error   { color: #ff3131; font-weight: 600; }

.sgd-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0,0,0,.06);
}

.sgd-footer__count {
  font-size: 0.8rem;
  color: #6b7280;
}

.sgd-footer__actions {
  display: flex;
  gap: 8px;
}

.sgd-fbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 40px; border-radius: 50px;
  font-size: 13.5px; font-weight: 600; cursor: pointer; border: none; transition: all .2s;
}
.sgd-fbtn--cancel { background: #f3f4f6; color: #374151; }
.sgd-fbtn--cancel:hover { background: #e5e7eb; }
.sgd-fbtn--primary { background: #ff3131; color: #fff; }
.sgd-fbtn--primary:hover { box-shadow: 0 4px 12px rgba(255, 49, 49,.35); }
.sgd-fbtn:disabled { opacity: .5; cursor: not-allowed; }

/* ── Dark mode ── */
.sgd-panel--dark { background: #1e293b; }
.sgd-panel--dark .sgd-search { border-bottom-color: rgba(255,255,255,.08); }
.sgd-panel--dark .sgd-body { background: #0f172a; }
.sgd-panel--dark .sgd-empty { color: #64748b; }
.sgd-panel--dark .sgd-card { background: #1e293b; border-color: rgba(255,255,255,.08); }
.sgd-panel--dark .sgd-card--selected { border-color: #ff3131; background: rgba(255,49,49,.1); }
.sgd-panel--dark .sgd-card:not(.sgd-card--selected):hover { border-color: rgba(255,255,255,.16); background: rgba(255,255,255,.03); }
.sgd-panel--dark .sgd-card__name { color: #e2e8f0; }
.sgd-panel--dark .sgd-card__meta { color: #94a3b8; }
.sgd-panel--dark .sgd-meta-sep { color: #475569; }
.sgd-panel--dark .sgd-footer { background: #1e293b; border-top-color: rgba(255,255,255,.08); }
.sgd-panel--dark .sgd-footer__count { color: #94a3b8; }
.sgd-panel--dark .sgd-fbtn--cancel { background: rgba(255,255,255,.08); color: #cbd5e1; }
.sgd-panel--dark .sgd-fbtn--cancel:hover { background: rgba(255,255,255,.14); }
.sgd-panel--dark .sgd-checkbox :deep(.v-selection-control__input > .v-icon) { color: #cbd5e1 !important; }

/* Transition */
.sgd-enter-active, .sgd-leave-active { transition: opacity 0.22s ease; }
.sgd-enter-active .sgd-panel, .sgd-leave-active .sgd-panel { transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1); }
.sgd-enter-from, .sgd-leave-to { opacity: 0; }
.sgd-enter-from .sgd-panel, .sgd-leave-to .sgd-panel { transform: translateX(100%); }
</style>
