<template>
  <Teleport to="body">
    <Transition name="ctcd-slide">
      <div v-if="modelValue" class="ctcd-overlay" @mousedown.self="close">
        <div class="ctcd-panel" :class="{'ctcd-panel--dark': isDark}">

          <!-- Gradient header -->
          <div class="ctcd-header">
            <div class="ctcd-header__icon">
              <FolderOpen :size="20" color="#fff" />
            </div>
            <div class="ctcd-header__text">
              <div class="ctcd-header__title">
                {{ t('componentTypeList.categoriesTitle') }}
                <span class="ctcd-header__type-name">{{ componentType?.name }}</span>
              </div>
              <div class="ctcd-header__subtitle">{{ categoryList.length }} {{ t('componentTypeList.categories') }}</div>
            </div>
            <button class="ctcd-close-btn" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="ctcd-body">
            <div v-if="categoryList.length > 0" class="ctcd-list">
              <div
                v-for="cat in categoryList"
                :key="cat.id"
                class="ctcd-item"
                :class="{'ctcd-item--dark': isDark}"
              >
                <div class="ctcd-item-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                    <circle cx="7" cy="7" r="1"/>
                  </svg>
                </div>
                <div class="ctcd-item-info">
                  <div class="ctcd-item-name">{{ cat.name }}</div>
                  <div class="ctcd-item-date">{{ formatDate(cat.createdAt) }}</div>
                </div>
                <v-chip size="small" color="primary" variant="tonal" rounded="lg" class="ml-auto">Category</v-chip>
              </div>
            </div>
            <div v-else class="ctcd-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              <div class="mt-3">{{ t('componentTypeList.noCategoriesFound') }}</div>
            </div>
          </div>

          <!-- Footer -->
          <div class="ctcd-footer">
            <button class="ctcd-fbtn ctcd-fbtn--cancel" @click="close">
              {{ t('componentTypeList.close') }}
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
  name: 'ComponentTypeCategoriesDrawer',
  components: { X, FolderOpen },
  props: {
    modelValue: { type: Boolean, default: false },
    componentType: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  computed: {
    categoryList() {
      return Array.isArray(this.componentType?.categoryList) ? this.componentType.categoryList : [];
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
.ctcd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

/* ── Panel ── */
.ctcd-panel {
  width: 560px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}
.ctcd-panel--dark {
  background: #111827;
  border-left-color: #374151;
  color: #f9fafb;
}

/* ── Gradient header ── */
.ctcd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.ctcd-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ctcd-header__text {
  flex: 1;
  min-width: 0;
}
.ctcd-header__title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}
.ctcd-header__type-name {
  color: rgba(255, 255, 255, .85);
  font-weight: 800;
}
.ctcd-header__subtitle {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin-top: 2px;
}
.ctcd-close-btn {
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
.ctcd-close-btn:hover {
  background: rgba(255, 255, 255, .25);
}

/* ── Body ── */
.ctcd-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
}

.ctcd-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ctcd-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.ctcd-item:hover {
  border-color: #fca5a5;
  box-shadow: 0 2px 8px rgba(255, 49, 49, .08);
}
.ctcd-item--dark {
  background: #1a2332;
  border-color: #374151;
}
.ctcd-item--dark:hover {
  border-color: #ff3131;
}

.ctcd-item-icon {
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
.ctcd-item--dark .ctcd-item-icon {
  background: rgba(255, 49, 49, .15);
}

.ctcd-item-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;
}
.ctcd-item--dark .ctcd-item-name {
  color: #f9fafb;
}
.ctcd-item-date {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 2px;
}

.ctcd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  color: #9ca3af;
  font-size: 0.9rem;
}

/* ── Footer ── */
.ctcd-footer {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, .06);
}
.ctcd-panel--dark .ctcd-footer {
  background: #1a2332;
  border-top-color: #374151;
}

.ctcd-fbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
  height: 40px;
  border-radius: 50px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all .2s;
}
.ctcd-fbtn--cancel {
  background: #f3f4f6;
  color: #374151;
}
.ctcd-fbtn--cancel:hover {
  background: #e5e7eb;
}

/* ── Transition ── */
.ctcd-slide-enter-active,
.ctcd-slide-leave-active {
  transition: opacity 0.25s ease;
}
.ctcd-slide-enter-active .ctcd-panel,
.ctcd-slide-leave-active .ctcd-panel {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.ctcd-slide-enter-from,
.ctcd-slide-leave-to {
  opacity: 0;
}
.ctcd-slide-enter-from .ctcd-panel,
.ctcd-slide-leave-to .ctcd-panel {
  transform: translateX(100%);
}
</style>
