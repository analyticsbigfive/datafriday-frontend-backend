<template>
  <Teleport to="body">
    <Transition name="ssd">
      <div v-if="modelValue" class="ssd-overlay" @mousedown.self="close">
        <aside class="ssd" :class="{ 'ssd--dark': isDark }" role="dialog" aria-modal="true">
          <header class="ssd-head">
            <div class="ssd-head__text">
              <h2 class="ssd-head__title">{{ productName }} - [{{ reference }}]</h2>
              <p class="ssd-head__sub">{{ t('storageSpotsSubtitle') }}</p>
              <p v-if="spaceName" class="ssd-head__space">{{ spaceName }}</p>
            </div>
            <button type="button" class="ssd-head__close" :aria-label="t('storageClose')" @click="close">
              <X :size="18" />
            </button>
          </header>

          <div class="ssd-search">
            <Search :size="16" class="ssd-search__icon" />
            <input v-model="search" type="search" class="ssd-search__input" :placeholder="t('storageSpotsSearch')" />
          </div>

          <div class="ssd-tabs" role="tablist">
            <button type="button" role="tab" class="ssd-tab" :class="{ 'ssd-tab--on': tab === 'shops' }" :aria-selected="tab === 'shops'" @click="tab = 'shops'">
              {{ t('storageTabShops') }} ({{ counts.shops }})
            </button>
            <button type="button" role="tab" class="ssd-tab" :class="{ 'ssd-tab--on': tab === 'storages' }" :aria-selected="tab === 'storages'" @click="tab = 'storages'">
              {{ t('storageTabStorages') }} ({{ counts.storages }})
            </button>
          </div>

          <div v-if="readOnly" class="ssd-readonly" role="note">{{ t('storageReadOnly') }}</div>

          <label v-if="visible.length" class="ssd-all">
            <input type="checkbox" :checked="allSelected" :disabled="readOnly" @change="toggleAll" />
            <span>{{ t('storageSelectAll') }} ({{ visible.length }})</span>
          </label>

          <div class="ssd-list">
            <v-progress-linear v-if="loading" indeterminate color="#ff3131" height="3" />
            <div v-if="loadError" class="ssd-msg ssd-msg--err">{{ t('storageSpotsLoadError') }}</div>
            <div v-else-if="!loading && !visible.length" class="ssd-msg">
              {{ tab === 'shops' ? t('storageNoShops') : t('storageNoStorages') }}
            </div>
            <div v-for="spot in visible" :key="spot.id" class="ssd-row">
              <label class="ssd-row__main">
                <input type="checkbox" :checked="spot.stored" :disabled="readOnly" @change="toggle(spot)" />
                <span class="ssd-row__name">{{ spot.name }}</span>
              </label>
              <div v-if="spot.stored" class="ssd-buffer">
                <label class="ssd-buffer__label" :for="`ssd-buf-${spot.id}`">{{ t('storageBuffer') }}</label>
                <input
                  :id="`ssd-buf-${spot.id}`"
                  class="ssd-buffer__input"
                  type="number"
                  min="0"
                  step="any"
                  :value="spot.quantity"
                  :disabled="readOnly"
                  @input="setBuffer(spot, $event.target.value)"
                />
              </div>
            </div>
          </div>

          <footer class="ssd-foot">
            <span v-if="saveStatus === 'saving'" class="ssd-foot__state">{{ t('storageSaving') }}</span>
            <span v-else-if="saveStatus === 'saved'" class="ssd-foot__state ssd-foot__state--ok">
              <Check :size="14" /> {{ t('storageSaved') }}
            </span>
            <span v-else-if="saveStatus === 'error'" class="ssd-foot__state ssd-foot__state--err">
              {{ t('storageSaveFailed') }}<template v-if="saveError"> : {{ saveError }}</template>
            </span>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { toRef } from 'vue'
import { Check, Search, X } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { useStorageSpots } from '@/composables/useStorageSpots'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  productName: { type: String, default: '' },
  reference: { type: String, default: '' },
  spaceId: { type: String, default: '' },
  spaceName: { type: String, default: '' },
  readOnly: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const {
  loading, loadError, tab, search, visible, counts, allSelected,
  saveStatus, saveError, toggle, toggleAll, setBuffer, finish,
} = useStorageSpots({
  isOpen: toRef(props, 'modelValue'),
  spaceId: toRef(props, 'spaceId'),
  productName: toRef(props, 'productName'),
  readOnly: toRef(props, 'readOnly'),
})

async function close() {
  emit('update:modelValue', false)
  await finish()
}
</script>

<style scoped>
.ssd-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0, 0, 0, 0.4); display: flex; justify-content: flex-end; }
.ssd { width: 480px; max-width: 100%; height: 100%; background: #fff; box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18); display: flex; flex-direction: column; overflow: hidden; color: #111827; }
.ssd--dark { background: #111827; color: #e5e7eb; }
.ssd-enter-active, .ssd-leave-active { transition: opacity 0.25s ease; }
.ssd-enter-active .ssd, .ssd-leave-active .ssd { transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.ssd-enter-from, .ssd-leave-to { opacity: 0; }
.ssd-enter-from .ssd, .ssd-leave-to .ssd { transform: translateX(100%); }

.ssd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 24px; background: #ff3131; color: #fff; }
.ssd-head__text { min-width: 0; }
.ssd-head__title { font-size: var(--fs-lg); font-weight: 700; margin: 0; line-height: 1.3; overflow-wrap: anywhere; }
.ssd-head__sub { font-size: var(--fs-base); margin: 4px 0 0; color: rgba(255, 255, 255, 0.8); }
.ssd-head__space { font-size: var(--fs-sm); margin: 6px 0 0; font-weight: 600; }
.ssd-head__close { flex-shrink: 0; width: 32px; height: 32px; border: none; border-radius: 8px; background: rgba(255, 255, 255, 0.2); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.ssd-head__close:hover { background: rgba(255, 255, 255, 0.32); }

.ssd-search { display: flex; align-items: center; gap: 8px; padding: 12px 24px; border-bottom: 1px solid #e5e7eb; }
.ssd--dark .ssd-search { border-bottom-color: rgba(255, 255, 255, 0.08); }
.ssd-search__icon { color: #9ca3af; flex-shrink: 0; }
.ssd-search__input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--fs-md); color: inherit; }
.ssd-search__input::placeholder { color: #9ca3af; }

.ssd-tabs { display: flex; gap: 4px; padding: 10px 24px 0; border-bottom: 1px solid #e5e7eb; }
.ssd--dark .ssd-tabs { border-bottom-color: rgba(255, 255, 255, 0.08); }
.ssd-tab { border: none; background: transparent; padding: 8px 14px; font-size: var(--fs-md); font-weight: 600; color: #6b7280; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
.ssd-tab--on { color: #ff3131; border-bottom-color: #ff3131; }

.ssd-readonly { padding: 10px 24px; font-size: var(--fs-sm); color: #92400e; background: #fffbeb; border-bottom: 1px solid #fde68a; }
.ssd--dark .ssd-readonly { color: #fcd34d; background: rgba(245,158,11,.1); border-bottom-color: rgba(245,158,11,.25); }
.ssd-buffer__input:disabled { opacity: .6; cursor: not-allowed; }
.ssd-all { display: flex; align-items: center; gap: 10px; padding: 12px 24px; font-size: var(--fs-md); font-weight: 600; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.ssd--dark .ssd-all { border-bottom-color: rgba(255, 255, 255, 0.07); }

.ssd-list { flex: 1; overflow-y: auto; }
.ssd-row { padding: 10px 24px; border-bottom: 1px solid #f0f0f0; display: flex; flex-direction: column; gap: 8px; }
.ssd--dark .ssd-row { border-bottom-color: rgba(255, 255, 255, 0.07); }
.ssd-row__main { display: flex; align-items: center; gap: 10px; cursor: pointer; min-width: 0; }
.ssd-row__name { font-size: var(--fs-md); overflow-wrap: anywhere; }
.ssd-buffer { display: flex; align-items: center; gap: 10px; padding-left: 26px; flex-wrap: wrap; }
.ssd-buffer__label { font-size: var(--fs-base); color: #6b7280; }
.ssd-buffer__input { width: 110px; padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: var(--fs-md); background: transparent; color: inherit; }
.ssd-buffer__input:focus { outline: none; border-color: #ff3131; }
.ssd-msg { padding: 28px 24px; text-align: center; font-size: var(--fs-base); color: #9ca3af; }
.ssd-msg--err { color: #ff3131; }

.ssd-foot { min-height: 44px; display: flex; align-items: center; padding: 10px 24px; border-top: 1px solid #e5e7eb; }
.ssd--dark .ssd-foot { border-top-color: rgba(255, 255, 255, 0.08); }
.ssd-foot__state { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-base); color: #6b7280; }
.ssd-foot__state--ok { color: #16a34a; }
.ssd-foot__state--err { color: #ff3131; }
</style>
