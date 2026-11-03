<template>
  <Teleport to="body">
    <Transition name="rsb">
      <div v-if="modelValue" class="rsb-overlay" @mousedown.self="close">
        <aside class="rsb" :class="{ 'rsb--dark': isDark }" role="dialog" aria-modal="true">
          <header class="rsb-head">
            <span class="rsb-head__tile" aria-hidden="true"><Warehouse :size="22" /></span>
            <div class="rsb-head__text">
              <h2 class="rsb-head__title">{{ storageName }}</h2>
              <p class="rsb-head__sub">{{ t('srStorageBuffersSubtitle') }}</p>
              <p v-if="spaceName" class="rsb-head__space">{{ spaceName }}</p>
            </div>
            <button type="button" class="rsb-head__close" :aria-label="t('storageClose')" @click="close">
              <X :size="18" />
            </button>
          </header>

          <div class="rsb-bar">
            <div class="rsb-search">
              <Search :size="16" class="rsb-search__icon" />
              <input
                v-model="search"
                type="search"
                class="rsb-search__input"
                :placeholder="t('srStoragePickerSearch')"
                :aria-label="t('srStoragePickerSearch')"
              />
            </div>
            <span class="rsb-count">{{ t('srStorageBuffersStored').replace('{n}', storedCount) }}</span>
          </div>

          <div v-if="readOnly" class="rsb-readonly" role="note">{{ t('storageReadOnly') }}</div>

          <div class="rsb-list">
            <v-progress-linear v-if="loading" indeterminate color="#ff3131" height="3" />
            <div v-if="loadError" class="rsb-msg rsb-msg--err">{{ t('storageSpotsLoadError') }}</div>
            <div v-else-if="!loading && !visible.length" class="rsb-msg">{{ t('srStoragePickerNone') }}</div>
            <template v-else>
              <div
                v-for="row in visible"
                :key="row.key"
                class="rsb-row"
                :class="{ 'rsb-row--on': row.stored, 'rsb-row--ro': readOnly }"
                role="checkbox"
                :aria-checked="row.stored"
                :tabindex="readOnly ? -1 : 0"
                @click="toggle(row)"
                @keydown.space.prevent="toggle(row)"
                @keydown.enter.prevent="toggle(row)"
              >
                <span class="rsb-row__tile" aria-hidden="true"><Package :size="18" /></span>
                <span class="rsb-row__name">{{ row.name }}</span>
                <span v-if="row.stored" class="rsb-buffer" @click.stop>
                  <label class="rsb-buffer__label" :for="`rsb-buf-${row.key}`">{{ t('storageBuffer') }}</label>
                  <span class="rsb-buffer__group" :class="{ 'rsb-buffer__group--off': readOnly }">
                    <input
                      :id="`rsb-buf-${row.key}`"
                      class="rsb-buffer__input"
                      type="number"
                      min="0"
                      step="any"
                      :value="row.quantity"
                      :disabled="readOnly"
                      @input="setBuffer(row, $event.target.value)"
                      @keydown.stop
                    />
                    <span class="rsb-buffer__pack">{{ packLabel(row) }}</span>
                  </span>
                </span>
                <span class="rsb-row__check" :class="{ 'rsb-row__check--on': row.stored }" aria-hidden="true">
                  <Check v-if="row.stored" :size="14" :stroke-width="3" />
                </span>
              </div>
              <p v-if="hiddenCount > 0" class="rsb-msg">{{ t('srStorageBuffersMore').replace('{n}', hiddenCount) }}</p>
            </template>
          </div>

          <footer class="rsb-foot">
            <button type="button" class="rsb-foot__close" @click="close">{{ t('storageClose') }}</button>
            <div class="rsb-foot__info">
              <span v-if="saveStatus === 'saving'" class="rsb-foot__state">{{ t('storageSaving') }}</span>
              <span v-else-if="saveStatus === 'saved'" class="rsb-foot__state rsb-foot__state--ok">
                <Check :size="14" /> {{ t('storageSaved') }}
              </span>
              <span v-else-if="saveStatus === 'error'" class="rsb-foot__state rsb-foot__state--err">
                {{ t('storageSaveFailed') }}<template v-if="saveError"> : {{ saveError }}</template>
              </span>
              <span class="rsb-foot__hint">{{ t('storageAutoSaveHint') }}</span>
            </div>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, toRef } from 'vue'
import { useStore } from 'vuex'
import { Check, Package, Search, Warehouse, X } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { useStorageBuffers } from '@/composables/useStorageBuffers'
import { packLabelOf } from '@/utils/bufferPackaging'

// Drawer « Paramétrer » d'un stockage (onglet STOCK de Commande) : articles stockés sur ce stockage
// et leur stock tampon en colis. Même droit que la page Stockage (space.edit, sinon lecture seule).
// Émet `closed` après l'enregistrement si quelque chose a été écrit, pour que la vue recharge.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  spaceId: { type: String, default: '' },
  spaceName: { type: String, default: '' },
  elementId: { type: String, default: '' },
  storageName: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'closed'])
const store = useStore()
const { t, locale } = useI18n()

const readOnly = computed(() => !store.getters['auth/can']('space.edit'))

const theme = ref(localStorage.getItem('datafriday:theme') || localStorage.getItem('appTheme') || 'light')
const isDark = computed(() => theme.value === 'dark' || theme.value === 'dataFridayDark')
const onTheme = (e) => { theme.value = e.detail?.theme || 'light' }
window.addEventListener('theme-changed', onTheme)
onBeforeUnmount(() => window.removeEventListener('theme-changed', onTheme))

const {
  search, visible, hiddenCount, storedCount, packOf, loading, loadError, saveStatus, saveError,
  toggle, setBuffer, finish,
} = useStorageBuffers({
  isOpen: toRef(props, 'modelValue'),
  spaceId: toRef(props, 'spaceId'),
  elementId: toRef(props, 'elementId'),
  readOnly,
})

const packLabel = (row) => packLabelOf(packOf(row), t, locale.value, { plural: true })

async function close() {
  emit('update:modelValue', false)
  if (await finish()) emit('closed')
}
</script>

<style scoped>
.rsb-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0, 0, 0, 0.4); display: flex; justify-content: flex-end; }
.rsb { width: 480px; max-width: 100%; height: 100%; background: #fff; box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18); display: flex; flex-direction: column; overflow: hidden; color: #111827; }
.rsb--dark { background: #111827; color: #e5e7eb; }
.rsb-enter-active, .rsb-leave-active { transition: opacity 0.25s ease; }
.rsb-enter-active .rsb, .rsb-leave-active .rsb { transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.rsb-enter-from, .rsb-leave-to { opacity: 0; }
.rsb-enter-from .rsb, .rsb-leave-to .rsb { transform: translateX(100%); }

.rsb-head { flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: #ff3131; color: #fff; }
.rsb-head__tile { flex-shrink: 0; width: 44px; height: 44px; border-radius: 12px; background: rgba(255, 255, 255, 0.22); display: flex; align-items: center; justify-content: center; }
.rsb-head__text { flex: 1; min-width: 0; }
.rsb-head__title { font-size: var(--fs-lg); font-weight: var(--fw-bold); margin: 0; line-height: 1.3; overflow-wrap: anywhere; }
.rsb-head__sub { font-size: var(--fs-sm); margin: 2px 0 0; color: rgba(255, 255, 255, 0.85); }
.rsb-head__space { font-size: var(--fs-xs); margin: 2px 0 0; color: rgba(255, 255, 255, 0.75); }
.rsb-head__close { flex-shrink: 0; width: 34px; height: 34px; border: none; border-radius: 10px; background: rgba(255, 255, 255, 0.22); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.rsb-head__close:hover { background: rgba(255, 255, 255, 0.34); }

.rsb-bar { flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 12px 20px; flex-wrap: wrap; }
.rsb-search { flex: 1 1 200px; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 0 14px; height: 40px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; }
.rsb--dark .rsb-search { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.12); }
.rsb-search:focus-within { border-color: #ff3131; }
.rsb-search__icon { color: #9ca3af; flex-shrink: 0; }
.rsb-search__input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--fs-base); color: inherit; }
.rsb-search__input::placeholder { color: #9ca3af; }
.rsb-count { font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: #6b7280; white-space: nowrap; }

.rsb-readonly { flex-shrink: 0; padding: 10px 20px; font-size: var(--fs-sm); color: #92400e; background: #fffbeb; border-top: 1px solid #fde68a; border-bottom: 1px solid #fde68a; }
.rsb--dark .rsb-readonly { color: #fcd34d; background: rgba(245, 158, 11, .1); border-color: rgba(245, 158, 11, .25); }

.rsb-list { flex: 1; min-height: 0; overflow-y: auto; }
.rsb-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: 12px; row-gap: 8px; padding: 10px 20px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.rsb--dark .rsb-row { border-bottom-color: rgba(255, 255, 255, 0.07); }
.rsb-row--on { background: #fef2f2; }
.rsb--dark .rsb-row--on { background: rgba(255, 49, 49, 0.1); }
.rsb-row--ro { cursor: default; }
.rsb-row:focus-visible { outline: 2px solid #ff3131; outline-offset: -2px; }
.rsb-row__tile { grid-column: 1; grid-row: 1; width: 36px; height: 36px; border-radius: 10px; background: #f3f4f6; color: #6b7280; display: flex; align-items: center; justify-content: center; }
.rsb--dark .rsb-row__tile { background: rgba(255, 255, 255, 0.08); color: #9ca3af; }
.rsb-row__name { grid-column: 2; grid-row: 1; min-width: 0; font-size: var(--fs-md); font-weight: var(--fw-bold); line-height: 1.3; overflow-wrap: anywhere; }
.rsb-row__check { grid-column: 3; grid-row: 1; width: 24px; height: 24px; border-radius: 50%; border: 2px solid #d1d5db; display: flex; align-items: center; justify-content: center; color: #fff; }
.rsb-row__check--on { background: #ff3131; border-color: #ff3131; }

.rsb-buffer { grid-column: 2 / 4; grid-row: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; cursor: default; }
.rsb-buffer__label { font-size: var(--fs-base); color: #374151; white-space: nowrap; }
.rsb--dark .rsb-buffer__label { color: #d1d5db; }
.rsb-buffer__group { display: inline-flex; align-items: stretch; max-width: 100%; min-width: 0; height: 36px; border: 1.5px solid #374151; border-radius: 10px; background: #fff; overflow: hidden; }
.rsb--dark .rsb-buffer__group { background: rgba(255, 255, 255, 0.06); border-color: #9ca3af; }
.rsb-buffer__group:focus-within { border-color: #ff3131; }
.rsb-buffer__group--off { opacity: .6; }
.rsb-buffer__input { width: 88px; min-width: 0; padding: 0 10px; border: none; outline: none; background: transparent; font-size: var(--fs-md); color: #111827; text-align: right; -moz-appearance: textfield; appearance: textfield; }
.rsb--dark .rsb-buffer__input { color: #e5e7eb; }
.rsb-buffer__input::-webkit-outer-spin-button, .rsb-buffer__input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.rsb-buffer__input:disabled { cursor: not-allowed; }
.rsb-buffer__pack { display: inline-flex; align-items: center; padding: 0 10px; border-left: 1px solid #e5e7eb; background: #f3f4f6; font-size: var(--fs-base); color: #6b7280; line-height: 1.2; min-width: 0; }
.rsb--dark .rsb-buffer__pack { background: rgba(255, 255, 255, 0.08); border-left-color: rgba(255, 255, 255, 0.12); color: #9ca3af; }

.rsb-msg { padding: 28px 20px; text-align: center; font-size: var(--fs-base); color: #9ca3af; }
.rsb-msg--err { color: #ff3131; }

.rsb-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; border-top: 1px solid #e5e7eb; background: inherit; }
.rsb--dark .rsb-foot { border-top-color: rgba(255, 255, 255, 0.08); }
.rsb-foot__close { flex-shrink: 0; border: 1px solid #e5e7eb; background: #f3f4f6; color: #111827; border-radius: 999px; padding: 9px 22px; font-size: var(--fs-md); font-weight: var(--fw-semibold); cursor: pointer; }
.rsb--dark .rsb-foot__close { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.12); color: #e5e7eb; }
.rsb-foot__info { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; min-width: 0; text-align: right; }
.rsb-foot__hint { font-size: var(--fs-sm); color: #9ca3af; }
.rsb-foot__state { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-sm); color: #6b7280; }
.rsb-foot__state--ok { color: #16a34a; }
.rsb-foot__state--err { color: #ff3131; }

@media (max-width: 480px) {
  .rsb-head, .rsb-bar, .rsb-foot, .rsb-row { padding-left: 16px; padding-right: 16px; }
  .rsb-foot { flex-wrap: wrap; }
}
</style>
