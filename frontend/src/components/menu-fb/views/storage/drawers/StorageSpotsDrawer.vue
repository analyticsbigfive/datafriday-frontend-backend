<template>
  <Teleport to="body">
    <Transition name="ssd">
      <div v-if="modelValue" class="ssd-overlay" @mousedown.self="close">
        <aside class="ssd" :class="{ 'ssd--dark': isDark }" role="dialog" aria-modal="true">
          <header class="ssd-head">
            <span class="ssd-head__tile" aria-hidden="true"><Store :size="22" /></span>
            <div class="ssd-head__text">
              <template v-if="names.length > 1">
                <h2 class="ssd-head__title">{{ t('storageProductsCount').replace('{n}', names.length) }}</h2>
                <ul class="ssd-head__names"><li v-for="n in names" :key="n">{{ n }}</li></ul>
              </template>
              <h2 v-else class="ssd-head__title">{{ productName }} - [{{ reference }}]</h2>
              <p class="ssd-head__sub">{{ t('storageSpotsSubtitle') }}</p>
              <p v-if="spaceName" class="ssd-head__space">{{ spaceName }}</p>
            </div>
            <button type="button" class="ssd-head__close" :aria-label="t('storageClose')" @click="close">
              <X :size="18" />
            </button>
          </header>

          <div class="ssd-bar">
            <div class="ssd-search">
              <Search :size="16" class="ssd-search__icon" />
              <input v-model="search" type="search" class="ssd-search__input" :placeholder="t('storageSpotsSearch')" />
            </div>
            <div class="ssd-seg" role="tablist">
              <button type="button" role="tab" class="ssd-seg__btn" :class="{ 'ssd-seg__btn--on': tab === 'shops' }" :aria-selected="tab === 'shops'" @click="tab = 'shops'">
                {{ t('storageTabShops') }} ({{ counts.shops }})
              </button>
              <button type="button" role="tab" class="ssd-seg__btn" :class="{ 'ssd-seg__btn--on': tab === 'storages' }" :aria-selected="tab === 'storages'" @click="tab = 'storages'">
                {{ t('storageTabStorages') }} ({{ counts.storages }})
              </button>
            </div>
          </div>

          <div v-if="readOnly" class="ssd-readonly" role="note">{{ t('storageReadOnly') }}</div>

          <button
            v-if="visible.length"
            type="button"
            class="ssd-all"
            role="checkbox"
            :aria-checked="someSelected ? 'mixed' : allSelected"
            :disabled="readOnly"
            @click="toggleAll"
          >
            <span class="ssd-all__box" :class="{ 'ssd-all__box--on': allSelected || someSelected }">
              <Minus v-if="someSelected" :size="14" :stroke-width="3" />
              <Check v-else-if="allSelected" :size="14" :stroke-width="3" />
            </span>
            <span class="ssd-all__text">{{ t('storageSelectAll') }} ({{ visible.length }})</span>
          </button>

          <div class="ssd-list">
            <v-progress-linear v-if="loading" indeterminate color="#ff3131" height="3" />
            <div v-if="loadError" class="ssd-msg ssd-msg--err">{{ t('storageSpotsLoadError') }}</div>
            <div v-else-if="!loading && !visible.length" class="ssd-msg">
              {{ tab === 'shops' ? t('storageNoShops') : t('storageNoStorages') }}
            </div>
            <template v-else-if="visible.length">
              <p class="ssd-section">{{ tab === 'shops' ? t('storageSectionShops') : t('storageSectionStorages') }}</p>
              <div
                v-for="spot in visible"
                :key="spot.id"
                class="ssd-row"
                :class="{ 'ssd-row--on': spot.stored || spot.partial, 'ssd-row--ro': readOnly }"
                role="checkbox"
                :aria-checked="spot.partial ? 'mixed' : spot.stored"
                :tabindex="readOnly ? -1 : 0"
                @click="toggle(spot)"
                @keydown.space.prevent="toggle(spot)"
                @keydown.enter.prevent="toggle(spot)"
              >
                <span class="ssd-row__tile" aria-hidden="true"><component :is="spotIcon" :size="18" /></span>
                <span class="ssd-row__info">
                  <span class="ssd-row__name">{{ spot.name }}</span>
                  <span class="ssd-row__type">{{ spot.type || (tab === 'shops' ? t('storageTabShops') : t('storageTabStorages')) }}</span>
                </span>
                <span v-if="spot.stored || spot.partial" class="ssd-buffer" @click.stop>
                  <label class="ssd-buffer__label" :for="`ssd-buf-${spot.id}`">{{ t('storageBuffer') }}</label>
                  <span class="ssd-buffer__group" :class="{ 'ssd-buffer__group--off': readOnly }">
                  <input
                    :id="`ssd-buf-${spot.id}`"
                    class="ssd-buffer__input"
                    :class="{ 'ssd-buffer__input--mixed': spot.quantity === null }"
                    type="number"
                    min="0"
                    step="any"
                    :value="spot.quantity === null ? '' : spot.quantity"
                    :placeholder="spot.quantity === null ? t('storageMixedValues') : ''"
                    :disabled="readOnly"
                    @input="onBufferInput(spot, $event)"
                    @keydown.stop
                  />
                    <span class="ssd-buffer__pack">{{ bufferLabel }}</span>
                  </span>
                </span>
                <span class="ssd-row__check" :class="{ 'ssd-row__check--on': spot.stored || spot.partial }" aria-hidden="true">
                  <Minus v-if="spot.partial" :size="14" :stroke-width="3" />
                  <Check v-else-if="spot.stored" :size="14" :stroke-width="3" />
                </span>
              </div>
            </template>
          </div>

          <footer class="ssd-foot">
            <button type="button" class="ssd-foot__close" @click="close">{{ t('storageClose') }}</button>
            <div class="ssd-foot__info">
              <span v-if="saveStatus === 'saving'" class="ssd-foot__state">{{ t('storageSaving') }}</span>
              <span v-else-if="saveStatus === 'saved'" class="ssd-foot__state ssd-foot__state--ok">
                <Check :size="14" /> {{ t('storageSaved') }}
              </span>
              <span v-else-if="saveStatus === 'error'" class="ssd-foot__state ssd-foot__state--err">
                {{ t('storageSaveFailed') }}<template v-if="saveError"> : {{ saveError }}</template>
              </span>
              <span class="ssd-foot__hint">{{ t('storageAutoSaveHint') }}</span>
            </div>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, toRef } from 'vue'
import { Check, Minus, Search, Store, Warehouse, X } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { useStorageSpots } from '@/composables/useStorageSpots'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  productName: { type: String, default: '' },
  // Mode multi-produits : si renseigné (2 noms ou plus), remplace productName.
  productNames: { type: Array, default: () => [] },
  // Produits { name, marketPriceId } : permet d'écrire et de retrouver les lignes par id du Market Price.
  products: { type: Array, default: () => [] },
  reference: { type: String, default: '' },
  spaceId: { type: String, default: '' },
  spaceName: { type: String, default: '' },
  readOnly: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const names = computed(() => (props.productNames.length ? props.productNames : [props.productName]))
const {
  bufferLabel, loading, loadError, tab, search, visible, counts, allSelected,
  someSelected, saveStatus, saveError, toggle, toggleAll, setBuffer, finish,
} = useStorageSpots({
  isOpen: toRef(props, 'modelValue'),
  spaceId: toRef(props, 'spaceId'),
  productNames: names,
  products: toRef(props, 'products'),
  readOnly: toRef(props, 'readOnly'),
})

const spotIcon = computed(() => (tab.value === 'storages' ? Warehouse : Store))

function onBufferInput(spot, event) {
  setBuffer(spot, event.target.value)
}

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

.ssd-head { flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: #ff3131; color: #fff; }
.ssd-head__tile { flex-shrink: 0; width: 44px; height: 44px; border-radius: 12px; background: rgba(255, 255, 255, 0.22); display: flex; align-items: center; justify-content: center; }
.ssd-head__text { flex: 1; min-width: 0; }
.ssd-head__title { font-size: var(--fs-lg); font-weight: 700; margin: 0; line-height: 1.3; overflow-wrap: anywhere; }
.ssd-head__names { margin: 4px 0 0; padding: 0; list-style: none; font-size: var(--fs-sm); color: rgba(255, 255, 255, 0.9); max-height: 96px; overflow-y: auto; }
.ssd-head__names li { overflow-wrap: anywhere; }
.ssd-head__sub { font-size: var(--fs-sm); margin: 2px 0 0; color: rgba(255, 255, 255, 0.85); }
.ssd-head__space { font-size: var(--fs-xs); margin: 2px 0 0; color: rgba(255, 255, 255, 0.75); }
.ssd-head__close { flex-shrink: 0; width: 34px; height: 34px; border: none; border-radius: 10px; background: rgba(255, 255, 255, 0.22); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.ssd-head__close:hover { background: rgba(255, 255, 255, 0.34); }

.ssd-bar { flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 12px 20px; flex-wrap: wrap; }
.ssd-search { flex: 1 1 200px; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 0 14px; height: 40px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; }
.ssd--dark .ssd-search { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.12); }
.ssd-search:focus-within { border-color: #ff3131; }
.ssd-search__icon { color: #9ca3af; flex-shrink: 0; }
.ssd-search__input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--fs-base); color: inherit; }
.ssd-search__input::placeholder { color: #9ca3af; }

.ssd-seg { flex-shrink: 0; display: inline-flex; padding: 3px; gap: 2px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f3f4f6; }
.ssd--dark .ssd-seg { background: rgba(255, 255, 255, 0.06); border-color: rgba(255, 255, 255, 0.12); }
.ssd-seg__btn { border: none; background: transparent; padding: 6px 12px; border-radius: 8px; font-size: var(--fs-sm); font-weight: 600; color: #6b7280; cursor: pointer; white-space: nowrap; }
.ssd-seg__btn--on { background: #374151; color: #fff; }
.ssd--dark .ssd-seg__btn--on { background: #e5e7eb; color: #111827; }

.ssd-readonly { flex-shrink: 0; padding: 10px 20px; font-size: var(--fs-sm); color: #92400e; background: #fffbeb; border-top: 1px solid #fde68a; border-bottom: 1px solid #fde68a; }
.ssd--dark .ssd-readonly { color: #fcd34d; background: rgba(245, 158, 11, .1); border-color: rgba(245, 158, 11, .25); }

.ssd-all { flex-shrink: 0; margin: 0 20px 8px; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid #fecaca; border-radius: 12px; background: #fef2f2; color: #ff3131; font-weight: 700; font-size: var(--fs-md); text-align: left; cursor: pointer; width: calc(100% - 40px); }
.ssd--dark .ssd-all { background: rgba(255, 49, 49, 0.1); border-color: rgba(255, 49, 49, 0.3); }
.ssd-all:disabled { opacity: .6; cursor: not-allowed; }
.ssd-all__box { flex-shrink: 0; width: 20px; height: 20px; border-radius: 5px; border: 2px solid #ff3131; background: #fff; display: flex; align-items: center; justify-content: center; color: #fff; }
.ssd-all__box--on { background: #ff3131; }

.ssd-list { flex: 1; min-height: 0; overflow-y: auto; }
.ssd-section { margin: 0; padding: 10px 20px 6px; font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.06em; color: #9ca3af; text-transform: uppercase; }
.ssd-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: 12px; row-gap: 8px; padding: 10px 20px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.ssd--dark .ssd-row { border-bottom-color: rgba(255, 255, 255, 0.07); }
.ssd-row--on { background: #fef2f2; }
.ssd--dark .ssd-row--on { background: rgba(255, 49, 49, 0.1); }
.ssd-row--ro { cursor: default; }
.ssd-row:focus-visible { outline: 2px solid #ff3131; outline-offset: -2px; }
.ssd-row__tile { grid-column: 1; grid-row: 1; width: 36px; height: 36px; border-radius: 10px; background: #f3f4f6; color: #6b7280; display: flex; align-items: center; justify-content: center; }
.ssd--dark .ssd-row__tile { background: rgba(255, 255, 255, 0.08); color: #9ca3af; }
.ssd-row__info { grid-column: 2; grid-row: 1; display: flex; flex-direction: column; min-width: 0; }
.ssd-row__name { font-size: var(--fs-md); font-weight: 700; overflow-wrap: normal; word-break: normal; line-height: 1.3; }
.ssd-row__type { font-size: var(--fs-xs); color: #9ca3af; }
.ssd-row__check { grid-column: 3; grid-row: 1; width: 24px; height: 24px; border-radius: 50%; border: 2px solid #d1d5db; display: flex; align-items: center; justify-content: center; color: #fff; }
.ssd-row__check--on { background: #ff3131; border-color: #ff3131; }

/* Niveau 2 : aligné sous le nom (colonne 2 à 3), libellé puis champ collé à son unité de colis */
.ssd-buffer { grid-column: 2 / 4; grid-row: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; cursor: default; }
.ssd-buffer__label { font-size: var(--fs-base); color: #374151; white-space: nowrap; }
.ssd--dark .ssd-buffer__label { color: #d1d5db; }
.ssd-buffer__group { display: inline-flex; align-items: stretch; max-width: 100%; min-width: 0; height: 36px; border: 1.5px solid #374151; border-radius: 10px; background: #fff; overflow: hidden; }
.ssd--dark .ssd-buffer__group { background: rgba(255, 255, 255, 0.06); border-color: #9ca3af; }
.ssd-buffer__group:focus-within { border-color: #ff3131; }
.ssd-buffer__group--off { opacity: .6; }
.ssd-buffer__input { width: 88px; min-width: 0; padding: 0 10px; border: none; outline: none; background: transparent; font-size: var(--fs-md); color: #111827; text-align: right; -moz-appearance: textfield; appearance: textfield; }
.ssd--dark .ssd-buffer__input { color: #e5e7eb; }
.ssd-buffer__input::-webkit-outer-spin-button, .ssd-buffer__input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
/* Valeurs mixtes : le placeholder texte a besoin de plus de place qu'un nombre */
.ssd-buffer__input--mixed { width: 120px; }
.ssd-buffer__input:disabled { cursor: not-allowed; }
.ssd-buffer__pack { display: inline-flex; align-items: center; padding: 0 10px; border-left: 1px solid #e5e7eb; background: #f3f4f6; font-size: var(--fs-base); color: #6b7280; line-height: 1.2; min-width: 0; overflow-wrap: normal; word-break: normal; }
.ssd--dark .ssd-buffer__pack { background: rgba(255, 255, 255, 0.08); border-left-color: rgba(255, 255, 255, 0.12); color: #9ca3af; }

.ssd-msg { padding: 28px 20px; text-align: center; font-size: var(--fs-base); color: #9ca3af; }
.ssd-msg--err { color: #ff3131; }

.ssd-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; border-top: 1px solid #e5e7eb; background: inherit; }
.ssd--dark .ssd-foot { border-top-color: rgba(255, 255, 255, 0.08); }
.ssd-foot__close { flex-shrink: 0; border: 1px solid #e5e7eb; background: #f3f4f6; color: #111827; border-radius: 999px; padding: 9px 22px; font-size: var(--fs-md); font-weight: 600; cursor: pointer; }
.ssd--dark .ssd-foot__close { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.12); color: #e5e7eb; }
.ssd-foot__info { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; min-width: 0; text-align: right; }
.ssd-foot__hint { font-size: var(--fs-sm); color: #9ca3af; }
.ssd-foot__state { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-sm); color: #6b7280; }
.ssd-foot__state--ok { color: #16a34a; }
.ssd-foot__state--err { color: #ff3131; }

@media (max-width: 480px) {
  .ssd-head, .ssd-bar, .ssd-foot { padding-left: 16px; padding-right: 16px; }
  .ssd-all { margin-left: 16px; margin-right: 16px; width: calc(100% - 32px); }
  .ssd-section, .ssd-row { padding-left: 16px; padding-right: 16px; }
  .ssd-foot { flex-wrap: wrap; }
}
</style>
