<template>
  <Teleport to="body">
    <Transition name="ssd-drawer">
      <div v-if="modelValue" class="ssd-overlay" @click.self="cancel">
        <div class="ssd-panel">

          <!-- Header -->
          <div class="ssd-header">
            <div class="ssd-header__icon"><MapPin :size="20" color="white" /></div>
            <div class="ssd-header__text">
              <div class="ssd-header__title">{{ t('menuItemCreate.spacesDrawerTitle') }}</div>
              <div class="ssd-header__sub">{{ t('menuItemCreate.spacesDrawerSubtitle') }}</div>
            </div>
            <button class="ssd-header__close" @click="cancel"><X :size="16" /></button>
          </div>

          <!-- Search -->
          <div class="ssd-search">
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
          <div class="ssd-body">
            <div v-if="!filteredSpaces.length" class="ssd-empty">
              {{ t('menuItemCreate.spacesDrawerNoData') }}
            </div>

            <div v-else class="ssd-cards">
              <div
                v-for="space in filteredSpaces"
                :key="space.id"
                class="ssd-card"
                :class="{ 'ssd-card--selected': isSelected(space.id) }"
                @click="toggleSpace(space.id)"
              >
                <!-- Top row: checkbox + info -->
                <div class="ssd-card__top">
                  <v-checkbox
                    :model-value="isSelected(space.id)"
                    density="compact"
                    hide-details
                    color="#111827"
                    class="ssd-checkbox"
                    @update:model-value="val => setSelected(space.id, val)"
                    @click.stop
                  />
                  <div class="ssd-card__info">
                    <div class="ssd-card__name-row">
                      <span class="ssd-card__name">{{ space.name }}</span>
                      <v-chip
                        v-if="space.spaceType"
                        size="x-small"
                        variant="tonal"
                        color="#ff3131"
                        rounded="lg"
                        class="ssd-chip"
                      >
                        {{ space.spaceType }}
                      </v-chip>
                    </div>
                    <div class="ssd-card__meta">
                      <span v-if="space.department">
                        {{ t('menuItemCreate.spacesDrawerDept') }} {{ space.department }}
                      </span>
                      <span v-if="space.department && (space.maxCapacity || space.capacity)" class="ssd-meta-sep">·</span>
                      <span v-if="space.maxCapacity || space.capacity">
                        {{ (space.maxCapacity || space.capacity).toLocaleString() }} cap.
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="ssd-footer">
            <span class="ssd-footer__count">
              {{ localIds.length }} {{ t('menuItemCreate.spacesCount') }}
            </span>
            <div class="ssd-footer__actions">
              <button class="ssd-fbtn ssd-fbtn--cancel" @click="cancel">{{ t('menuItemCreate.cancel') }}</button>
              <button class="ssd-fbtn ssd-fbtn--primary" @click="confirm">{{ t('menuItemCreate.spacesDrawerConfirm') }}</button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { X, MapPin } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'SpaceSelectionDrawer',
  components: { X, MapPin },
  props: {
    modelValue: { type: Boolean, default: false },
    spaces: { type: Array, default: () => [] },
    selectedIds: { type: Array, default: () => [] },
    prices: { type: Object, default: () => ({}) },
  },
  emits: ['update:modelValue', 'confirm'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      search: '',
      localIds: [],
      localPrices: {},
    };
  },
  computed: {
    filteredSpaces() {
      const q = String(this.search || '').toLowerCase().trim();
      if (!q) return this.spaces;
      return this.spaces.filter(s =>
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.spaceType || '').toLowerCase().includes(q)
      );
    },
  },
  watch: {
    modelValue(val) {
      document.body.style.overflow = val ? 'hidden' : '';
      if (val) {
        this.search = '';
        this.localIds = [...(this.selectedIds || [])];
        this.localPrices = { ...(this.prices || {}) };
      }
    },
  },
  methods: {
    isSelected(id) {
      return this.localIds.includes(id);
    },
    setSelected(id, val) {
      if (val) {
        if (!this.localIds.includes(id)) this.localIds = [...this.localIds, id];
      } else {
        this.localIds = this.localIds.filter(x => x !== id);
      }
    },
    toggleSpace(id) {
      this.setSelected(id, !this.isSelected(id));
    },
    setPrice(id, val) {
      this.localPrices = { ...this.localPrices, [id]: Number(val) || 0 };
    },
    confirm() {
      this.$emit('confirm', {
        spaceIds: [...this.localIds],
        spacePrices: { ...this.localPrices },
      });
      this.$emit('update:modelValue', false);
    },
    cancel() {
      this.$emit('update:modelValue', false);
    },
  },
  beforeUnmount() {
    document.body.style.overflow = '';
  },
};
</script>

<style scoped>
.ssd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 2000;
  display: flex;
  justify-content: flex-end;
}

.ssd-panel {
  width: 600px;
  max-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
}

.ssd-header {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49,.2);
}
.ssd-header__icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ssd-header__text { flex: 1; }
.ssd-header__title { font-size: 15px; font-weight: 700; color: #fff; }
.ssd-header__sub { font-size: 12px; color: rgba(255,255,255,.72); margin-top: 2px; }
.ssd-header__close {
  background: rgba(255,255,255,.15); border: none; cursor: pointer;
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; transition: background .15s;
}
.ssd-header__close:hover { background: rgba(255,255,255,.25); }

.ssd-search {
  flex-shrink: 0;
  padding: 14px 16px 10px;
  background: #ffffff;
  border-bottom: 1px solid #f3f4f6;
}

.ssd-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: #f9fafb;
  padding: 12px 16px;
}

.ssd-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 0.85rem;
  color: #9ca3af;
}

.ssd-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ssd-card {
  background: #ffffff;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.ssd-card:hover {
  border-color: #d1d5db;
  background: #fafafa;
}

.ssd-card--selected {
  border-color: #111827;
  background: #f8fafc;
}

.ssd-card__top {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.ssd-checkbox {
  flex-shrink: 0;
  margin-top: -4px;
}

.ssd-card__info {
  flex: 1;
  min-width: 0;
}

.ssd-card__name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 3px;
}

.ssd-card__name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #111827;
}

.ssd-chip {
  font-size: 0.68rem !important;
}

.ssd-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: #6b7280;
}

.ssd-meta-sep {
  color: #d1d5db;
}


.ssd-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0,0,0,.06);
}

.ssd-footer__count {
  font-size: 0.8rem;
  color: #6b7280;
}

.ssd-footer__actions {
  display: flex;
  gap: 8px;
}

.ssd-fbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 40px; border-radius: 50px;
  font-size: 13.5px; font-weight: 600; cursor: pointer; border: none; transition: all .2s;
}
.ssd-fbtn--cancel { background: #f3f4f6; color: #374151; }
.ssd-fbtn--cancel:hover { background: #e5e7eb; }
.ssd-fbtn--primary { background: #ff3131; color: #fff; }
.ssd-fbtn--primary:hover { box-shadow: 0 4px 12px rgba(255, 49, 49,.35); }
.ssd-fbtn:disabled { opacity: .5; cursor: not-allowed; }

/* Transition */
.ssd-drawer-enter-active,
.ssd-drawer-leave-active { transition: opacity 0.25s ease; }
.ssd-drawer-enter-active .ssd-panel,
.ssd-drawer-leave-active .ssd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.ssd-drawer-enter-from,
.ssd-drawer-leave-to    { opacity: 0; }
.ssd-drawer-enter-from .ssd-panel,
.ssd-drawer-leave-to .ssd-panel { transform: translateX(100%); }
</style>
