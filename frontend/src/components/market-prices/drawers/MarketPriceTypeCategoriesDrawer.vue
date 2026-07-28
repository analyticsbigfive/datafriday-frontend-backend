<template>
  <Teleport to="body">
    <Transition name="mptcd-slide">
      <div v-if="modelValue" class="mptcd-overlay" @mousedown.self="close">
        <div class="mptcd-panel" :class="{'mptcd-panel--dark': isDark}">

          <!-- Gradient header -->
          <div class="mptcd-header">
            <div class="mptcd-header__icon">
              <FolderOpen :size="20" color="#fff" />
            </div>
            <div class="mptcd-header__text">
              <div class="mptcd-header__title">
                {{ t('marketPriceTypeList.categoriesTitle') }}
                <span class="mptcd-header__type-name">{{ marketPriceType?.name }}</span>
              </div>
              <div class="mptcd-header__subtitle">{{ categoryList.length }} {{ t('marketPriceTypeList.categories') }}</div>
            </div>
            <button class="mptcd-close-btn" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="mptcd-body">
            <div v-if="categoryList.length > 0" class="mptcd-list">
              <div
                v-for="cat in categoryList"
                :key="cat.id"
                class="mptcd-item"
                :class="{'mptcd-item--dark': isDark}"
              >
                <div class="mptcd-item-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                    <circle cx="7" cy="7" r="1"/>
                  </svg>
                </div>
                <div class="mptcd-item-info">
                  <div class="mptcd-item-name">{{ cat.name }}</div>
                  <div class="mptcd-item-date">{{ formatDate(cat.createdAt) }}</div>
                </div>
                <v-chip size="small" color="primary" variant="tonal" rounded="lg" class="ml-auto">{{ t('marketPriceTypeList.categoryChipLabel') }}</v-chip>
              </div>
            </div>
            <div v-else class="mptcd-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              <div class="mt-3">{{ t('marketPriceTypeList.noCategoriesFound') }}</div>
            </div>
          </div>

          <!-- Footer -->
          <div class="mptcd-footer">
            <button class="mptcd-fbtn mptcd-fbtn--cancel" @click="close">
              {{ t('marketPriceTypeList.close') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, FolderOpen } from 'lucide-vue-next';

export default {
  name: 'MarketPriceTypeCategoriesDrawer',
  components: { X, FolderOpen },
  props: {
    modelValue: { type: Boolean, default: false },
    marketPriceType: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  computed: {
    categoryList() {
      return Array.isArray(this.marketPriceType?.categoryList) ? this.marketPriceType.categoryList : [];
    },
  },
  methods: {
    close() {
      this.$emit('update:modelValue', false);
    },
    formatDate(value) {
      if (!value) return '-';
      try { return new Date(value).toLocaleString(); }
      catch { return String(value); }
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.mptcd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

/* ── Panel ── */
.mptcd-panel {
  width: 560px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}
.mptcd-panel--dark {
  background: #111827;
  border-left-color: #374151;
  color: #f9fafb;
}

/* ── Gradient header ── */
.mptcd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.mptcd-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mptcd-header__text {
  flex: 1;
  min-width: 0;
}
.mptcd-header__title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: #fff;
}
.mptcd-header__type-name {
  color: rgba(255, 255, 255, .85);
  font-weight: var(--fw-bold);
}
.mptcd-header__subtitle {
  font-size: var(--fs-sm);
  color: rgba(255, 255, 255, .72);
  margin-top: 2px;
}
.mptcd-close-btn {
  background: rgba(255, 255, 255, .15);
  border: none;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: background .15s;
  flex-shrink: 0;
}
.mptcd-close-btn:hover {
  background: rgba(255, 255, 255, .25);
}

/* ── Body ── */
.mptcd-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
}

.mptcd-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mptcd-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.mptcd-item:hover {
  border-color: #fca5a5;
  box-shadow: 0 2px 8px rgba(255, 49, 49, .08);
}
.mptcd-item--dark {
  background: #1a2332;
  border-color: #374151;
}
.mptcd-item--dark:hover {
  border-color: #ff3131;
}

.mptcd-item-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(255, 49, 49, .08);
  color: #ff3131;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mptcd-item--dark .mptcd-item-icon {
  background: rgba(255, 49, 49, .15);
}

.mptcd-item-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;
}
.mptcd-item--dark .mptcd-item-name {
  color: #f9fafb;
}
.mptcd-item-date {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 2px;
}

.mptcd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  color: #9ca3af;
  font-size: 0.9rem;
}

/* ── Footer ── */
.mptcd-footer {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, .06);
}
.mptcd-panel--dark .mptcd-footer {
  background: #1a2332;
  border-top-color: #374151;
}

.mptcd-fbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
  height: 40px;
  border-radius: 50px;
  font-size: var(--fs-base);
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all .2s;
}
.mptcd-fbtn--cancel {
  background: #f3f4f6;
  color: #374151;
}
.mptcd-fbtn--cancel:hover {
  background: #e5e7eb;
}
.mptcd-panel--dark .mptcd-fbtn--cancel { background: #374151; color: #d1d5db; }
.mptcd-panel--dark .mptcd-fbtn--cancel:hover { background: #4b5563; }

/* ── Transition ── */
.mptcd-slide-enter-active,
.mptcd-slide-leave-active {
  transition: opacity 0.25s ease;
}
.mptcd-slide-enter-active .mptcd-panel,
.mptcd-slide-leave-active .mptcd-panel {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.mptcd-slide-enter-from,
.mptcd-slide-leave-to {
  opacity: 0;
}
.mptcd-slide-enter-from .mptcd-panel,
.mptcd-slide-leave-to .mptcd-panel {
  transform: translateX(100%);
}
</style>
