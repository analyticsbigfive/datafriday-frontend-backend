<template>
  <Teleport to="body">
    <Transition name="smfs-backdrop">
      <div v-if="modelValue" class="smfs-backdrop" @click="close"></div>
    </Transition>
    <Transition name="smfs-sheet">
      <div
        v-if="modelValue"
        class="smfs-sheet"
        :class="{ 'smfs--dark': isDark }"
        role="dialog"
        aria-modal="true"
      >
        <div class="smfs-handle"></div>

        <div class="smfs-header">
          <span class="smfs-header__title">{{ t('spaceList.mobileFiltersTitle') }}</span>
          <button class="smfs-close" @click="close" :aria-label="t('spaceList.mobileClose')">
            <X :size="18" />
          </button>
        </div>

        <div class="smfs-body">
          <div class="smfs-field">
            <label class="smfs-label">{{ t('spaceList.labelSpaceType') }}</label>
            <select
              class="smfs-select"
              :value="typeFilter"
              @change="$emit('update:typeFilter', $event.target.value)"
            >
              <option value="">{{ t('spaceList.typePlaceholder') }}</option>
              <option v-for="type in spaceTypes" :key="type" :value="type">{{ type }}</option>
            </select>
          </div>

          <div class="smfs-field">
            <label class="smfs-label">{{ t('spaceList.mobileSortLabel') }}</label>
            <select
              class="smfs-select"
              :value="sortBy"
              @change="$emit('update:sortBy', $event.target.value)"
            >
              <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.title }}</option>
            </select>
          </div>

          <div class="smfs-field">
            <label class="smfs-label">{{ t('spaceList.mobileDisplayLabel') }}</label>
            <div class="smfs-view-toggle">
              <button
                type="button"
                class="smfs-view-btn"
                :class="{ 'smfs-view-btn--active': viewMode === 'grid' }"
                @click="$emit('update:viewMode', 'grid')"
              >
                <LayoutGrid :size="16" /> {{ t('spaceList.mobileGrid') }}
              </button>
              <button
                type="button"
                class="smfs-view-btn"
                :class="{ 'smfs-view-btn--active': viewMode === 'list' }"
                @click="$emit('update:viewMode', 'list')"
              >
                <List :size="16" /> {{ t('spaceList.mobileList') }}
              </button>
            </div>
          </div>

          <button type="button" class="smfs-refresh-btn" :disabled="refreshing" @click="$emit('refresh')">
            <RefreshCw :size="15" :class="{ 'smfs-spin': refreshing }" />
            {{ t('spaceList.retry') }}
          </button>
        </div>

        <button type="button" class="smfs-apply-btn" @click="close">
          {{ t('spaceList.mobileApply') }}
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { LayoutGrid, List, RefreshCw, X } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'

export default {
  name: 'SpaceMobileFilterSheet',
  components: { LayoutGrid, List, RefreshCw, X },
  props: {
    modelValue: { type: Boolean, default: false },
    typeFilter: { type: String, default: '' },
    sortBy: { type: String, default: '' },
    viewMode: { type: String, default: 'grid' },
    spaceTypes: { type: Array, default: () => [] },
    sortOptions: { type: Array, default: () => [] },
    refreshing: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'update:typeFilter', 'update:sortBy', 'update:viewMode', 'refresh'],
  setup() {
    const { t } = useI18n()
    return { t }
  },
  methods: {
    close() {
      this.$emit('update:modelValue', false)
    },
  },
}
</script>

<style scoped>
.smfs-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, .45);
  z-index: 1000;
}

.smfs-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1001;
  background: #fff;
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, .18);
  padding: 8px 20px calc(20px + env(safe-area-inset-bottom, 0px));
  max-height: 80vh;
  overflow-y: auto;
}
.smfs-sheet.smfs--dark {
  background: #1a2332;
}

.smfs-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: #e5e7eb;
  margin: 0 auto 14px;
}
.smfs--dark .smfs-handle { background: #374151; }

.smfs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.smfs-header__title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: #111827;
}
.smfs--dark .smfs-header__title { color: #f9fafb; }
.smfs-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.smfs--dark .smfs-close { background: #111827; color: #9ca3af; }

.smfs-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 18px;
}
.smfs-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.smfs-label {
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: #9ca3af;
}
.smfs--dark .smfs-label { color: #6b7280; }

.smfs-select {
  height: 44px;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  padding: 0 14px;
  font-size: var(--fs-md);
  color: #111827;
  background: #f9fafb;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}
.smfs--dark .smfs-select { border-color: #374151; background: #111827; color: #f9fafb; }

.smfs-view-toggle {
  display: flex;
  gap: 8px;
}
.smfs-view-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  border-radius: 12px;
  border: 1.5px solid #e5e7eb;
  background: #f9fafb;
  color: #6b7280;
  font-size: var(--fs-md);
  font-weight: 500;
  cursor: pointer;
}
.smfs--dark .smfs-view-btn { border-color: #374151; background: #111827; color: #9ca3af; }
.smfs-view-btn--active {
  background: #ff3131;
  border-color: #ff3131;
  color: #fff;
}

.smfs-refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  border-radius: 12px;
  border: 1.5px solid #e5e7eb;
  background: #f9fafb;
  color: #374151;
  font-size: var(--fs-md);
  font-weight: 500;
  cursor: pointer;
}
.smfs--dark .smfs-refresh-btn { border-color: #374151; background: #111827; color: #d1d5db; }
.smfs-refresh-btn:disabled { opacity: .6; cursor: not-allowed; }
.smfs-spin { animation: smfsSpin .8s linear infinite; }
@keyframes smfsSpin { to { transform: rotate(360deg); } }

.smfs-apply-btn {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 50px;
  background: #ff3131;
  color: #fff;
  font-size: var(--fs-md);
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(255, 49, 49, .3);
}

/* Transitions */
.smfs-backdrop-enter-active, .smfs-backdrop-leave-active { transition: opacity .2s ease; }
.smfs-backdrop-enter-from, .smfs-backdrop-leave-to { opacity: 0; }

.smfs-sheet-enter-active { transition: transform .28s cubic-bezier(.32, .72, 0, 1); }
.smfs-sheet-leave-active { transition: transform .2s ease-in; }
.smfs-sheet-enter-from, .smfs-sheet-leave-to { transform: translateY(100%); }
</style>
