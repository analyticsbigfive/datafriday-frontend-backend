<template>
  <!-- Liste déroulante avec recherche des écrans Market Price. Volontairement SANS défilement
       virtuel (contrairement à v-select / v-autocomplete) : toutes les options sont rendues, la
       liste défile normalement jusqu'à la dernière, et la hauteur suit la fenêtre au lieu des
       310 px figés de Vuetify. -->
  <v-menu
    v-model="open"
    location="bottom"
    :offset="4"
    :z-index="zIndex"
    :close-on-content-click="false"
    :disabled="disabled"
    :min-width="menuWidth"
    @after-enter="focusSearch"
    @update:model-value="onToggle"
  >
    <template #activator="{ props: menuProps }">
      <button
        ref="triggerRef"
        type="button"
        class="mpss-trigger"
        :class="{ 'mpss-trigger--open': open, 'mpss-trigger--dark': isDark, 'mpss-trigger--disabled': disabled, 'mpss-trigger--pill': variant === 'pill' }"
        :disabled="disabled"
        v-bind="menuProps"
      >
        <span class="mpss-trigger__label" :class="{ 'mpss-trigger__label--placeholder': !selectedLabel }">
          {{ selectedLabel || placeholder }}
        </span>
        <span
          v-if="clearable && selectedLabel && !disabled"
          class="mpss-trigger__clear"
          role="button"
          tabindex="-1"
          @click.stop="clear"
        >
          <X :size="14" />
        </span>
        <ChevronDown :size="16" class="mpss-trigger__chevron" :class="{ 'mpss-trigger__chevron--open': open }" />
      </button>
    </template>

    <div class="mpss-menu" :class="{ 'mpss-menu--dark': isDark }" :style="{ width: menuWidth + 'px' }">
      <div class="mpss-search">
        <Search :size="15" class="mpss-search__icon" />
        <input
          ref="searchRef"
          v-model="query"
          type="text"
          class="mpss-search__input"
          :placeholder="resolvedSearchPlaceholder"
          autocomplete="off"
          @keydown.enter.prevent="pickFirst"
        />
      </div>

      <button v-if="createLabel" type="button" class="mpss-create" @click="onCreate">
        <PlusCircle :size="16" />
        <span>{{ createLabel }}</span>
      </button>

      <div class="mpss-list" role="listbox">
        <button
          v-for="opt in filteredOptions"
          :key="opt.key"
          type="button"
          role="option"
          class="mpss-item"
          :class="{ 'mpss-item--active': opt.value === modelValue }"
          :aria-selected="opt.value === modelValue"
          @click="pick(opt)"
        >
          <span class="mpss-item__label">{{ opt.title }}</span>
          <Check v-if="opt.value === modelValue" :size="15" class="mpss-item__check" />
        </button>
        <div v-if="!filteredOptions.length" class="mpss-empty">{{ resolvedEmptyText }}</div>
      </div>
    </div>
  </v-menu>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import { Check, ChevronDown, PlusCircle, Search, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { normalizeSearchSelectOptions, filterSearchSelectOptions } from '../utils/searchSelectOptions';

const props = defineProps({
  modelValue: { type: [String, Number, null], default: null },
  /** Chaînes, ou objets lus via itemTitle / itemValue. */
  items: { type: Array, default: () => [] },
  itemTitle: { type: String, default: 'title' },
  itemValue: { type: String, default: 'value' },
  placeholder: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '' },
  emptyText: { type: String, default: '' },
  /** Libellé de l'entrée « Ajouter ... » en tête de liste ; absente si vide. */
  createLabel: { type: String, default: '' },
  clearable: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  /** 'field' = champ de formulaire pleine largeur ; 'pill' = filtre compact de la barre de la liste. */
  variant: { type: String, default: 'field', validator: (v) => ['field', 'pill'].includes(v) },
  zIndex: { type: Number, default: 10001 },
});
const emit = defineEmits(['update:modelValue', 'create']);

const MIN_MENU_WIDTH = 240;
const open = ref(false);
const query = ref('');
const menuWidth = ref(320);
const triggerRef = ref(null);
const searchRef = ref(null);

const { t } = useI18n();
const resolvedSearchPlaceholder = computed(() => props.searchPlaceholder || t('mpssSearchPlaceholder'));
const resolvedEmptyText = computed(() => props.emptyText || t('anNoResults'));

const options = computed(() => normalizeSearchSelectOptions(props.items, props.itemTitle, props.itemValue));
const filteredOptions = computed(() => filterSearchSelectOptions(options.value, query.value));
const selectedLabel = computed(() => {
  if (props.modelValue === null || props.modelValue === undefined || props.modelValue === '') return '';
  const hit = options.value.find((o) => o.value === props.modelValue);
  // Valeur absente de la liste (ex. option supprimée) : on l'affiche telle quelle plutôt qu'un champ vide.
  return hit ? hit.title : String(props.modelValue);
});

function onToggle(isOpen) {
  if (isOpen) {
    query.value = '';
    const width = triggerRef.value?.getBoundingClientRect().width;
    if (width) menuWidth.value = Math.max(Math.round(width), MIN_MENU_WIDTH);
  }
}
function focusSearch() {
  nextTick(() => searchRef.value?.focus());
}
function pick(opt) {
  emit('update:modelValue', opt.value);
  open.value = false;
}
function pickFirst() {
  if (filteredOptions.value.length) pick(filteredOptions.value[0]);
}
function clear() {
  emit('update:modelValue', null);
}
function onCreate() {
  open.value = false;
  emit('create');
}
</script>

<style scoped>
.mpss-trigger {
  width: 100%; min-height: 40px; box-sizing: border-box;
  display: flex; align-items: center; gap: 8px;
  padding: 0 12px; text-align: left;
  border: 1.5px solid #e5e7eb; border-radius: 11px; background: #fafafa;
  font: inherit; font-size: var(--fs-md); color: #111827; cursor: pointer;
  transition: border-color .18s, box-shadow .18s, background .18s;
}
.mpss-trigger:hover:not(.mpss-trigger--disabled) { border-color: #d1d5db; }
.mpss-trigger--open { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49, .1); background: #fff; }
.mpss-trigger--disabled { opacity: .55; cursor: not-allowed; }
.mpss-trigger__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mpss-trigger__label--placeholder { color: #9ca3af; }
.mpss-trigger__clear { display: inline-flex; align-items: center; color: #9ca3af; border-radius: 4px; }
.mpss-trigger__clear:hover { color: #ff3131; }
.mpss-trigger__chevron { color: #6b7280; flex-shrink: 0; transition: transform .18s; }
.mpss-trigger__chevron--open { transform: rotate(180deg); }
.mpss-trigger--pill { width: auto; min-height: 0; padding: 5px 12px; border-radius: 100px; background: #f9fafb; font-size: var(--fs-sm); font-weight: var(--fw-medium, 500); color: #374151; }
.mpss-trigger--pill .mpss-trigger__label { max-width: 180px; }
.mpss-trigger--dark { background: #263548; border-color: #374151; color: #e5e7eb; }
.mpss-trigger--dark.mpss-trigger--open { border-color: #ff3131; background: #263548; }
.mpss-trigger--dark .mpss-trigger__chevron,
.mpss-trigger--dark .mpss-trigger__clear { color: #94a3b8; }

/* Hauteur liée à la fenêtre ; barre de défilement toujours visible (macOS la masque par défaut,
   ce qui faisait croire que la liste s'arrêtait). */
.mpss-menu {
  display: flex; flex-direction: column; box-sizing: border-box;
  max-height: min(420px, 60vh);
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, .22); overflow: hidden;
}
.mpss-menu--dark { background: #1f2937; border-color: #374151; color: #f3f4f6; }
.mpss-search { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.mpss-menu--dark .mpss-search { border-bottom-color: #374151; }
.mpss-search__icon { color: #9ca3af; flex-shrink: 0; }
.mpss-search__input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; font-size: var(--fs-md); color: inherit; }
.mpss-search__input::placeholder { color: #9ca3af; }
.mpss-create {
  display: flex; align-items: center; gap: 8px; width: 100%; flex-shrink: 0;
  padding: 10px 14px; border: 0; border-bottom: 1px solid #e5e7eb; background: #fff1f1;
  color: #ff3131; font: inherit; font-size: var(--fs-md); font-weight: 600; cursor: pointer; text-align: left;
}
.mpss-create:hover { background: #fee2e2; }
.mpss-menu--dark .mpss-create { background: rgba(255, 49, 49, .12); border-bottom-color: #374151; }
.mpss-list { flex: 1; min-height: 0; overflow-y: scroll; padding: 4px; }
.mpss-list::-webkit-scrollbar { width: 10px; }
.mpss-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
.mpss-menu--dark .mpss-list::-webkit-scrollbar-thumb { background: #4b5563; background-clip: content-box; }
.mpss-item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;
  box-sizing: border-box; padding: 9px 10px; border: 0; border-radius: 8px; background: transparent;
  font: inherit; font-size: var(--fs-md); color: inherit; text-align: left; cursor: pointer;
}
.mpss-item:hover { background: #f3f4f6; }
.mpss-menu--dark .mpss-item:hover { background: #374151; }
.mpss-item--active { background: #fef2f2; color: #ff3131; font-weight: 600; }
.mpss-menu--dark .mpss-item--active { background: rgba(255, 49, 49, .15); }
.mpss-item__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mpss-item__check { flex-shrink: 0; }
.mpss-empty { padding: 14px 10px; font-size: var(--fs-sm); color: #9ca3af; text-align: center; }
</style>
