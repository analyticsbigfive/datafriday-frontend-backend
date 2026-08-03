<template>
  <!-- Picker Menu Items générique : recherche + "Tout Sélectionner" + liste à cocher.
       Idiome repris de InventoryFilterPanel.vue / ShopMenuItemsDrawer.vue (HTML/CSS pur, pas de
       Vuetify/src/ui). "Tout Sélectionner" ici PERSISTE une intention (allMenuItems), pas juste un
       raccourci de sélection groupée : cocher désactive la liste individuelle. -->
  <div class="hmis" :class="{ 'hmis--dark': isDark }">
    <label class="hmis__all">
      <input
        type="checkbox"
        :checked="allSelected"
        @change="$emit('update:allSelected', $event.target.checked)"
      />
      <span>{{ t('selectAll') }}</span>
    </label>

    <template v-if="!allSelected">
      <input
        v-model="search"
        type="text"
        class="hmis__search"
        :placeholder="t('hrRatioDialogSearchPlaceholder')"
      />
      <div class="hmis__list">
        <div v-if="!filteredItems.length" class="hmis__empty">{{ t('hrRatioDialogMenuItemsEmpty') }}</div>
        <label v-for="item in filteredItems" :key="item.id" class="hmis__row">
          <input
            type="checkbox"
            :checked="modelValue.includes(item.id)"
            @change="toggle(item.id, $event.target.checked)"
          />
          <span class="hmis__row-name">{{ item.name }}</span>
          <span v-if="item.category" class="hmis__row-category">{{ item.category }}</span>
        </label>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTheme } from 'vuetify'
import { t } from '@/i18n'

const props = defineProps({
  items: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
  allSelected: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'update:allSelected'])

const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const search = ref('')

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter((i) => (i.name || '').toLowerCase().includes(q))
})

function toggle(id, checked) {
  const next = checked
    ? [...props.modelValue, id]
    : props.modelValue.filter((v) => v !== id)
  emit('update:modelValue', next)
}
</script>

<style scoped>
.hmis { display: flex; flex-direction: column; gap: 8px; }
.hmis__all {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px;
  background: #f3f4f6; cursor: pointer; font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: #374151;
}
.hmis__search {
  width: 100%; border-radius: 10px; border: 1.5px solid #e5e7eb; font-size: var(--fs-sm);
  padding: 0.5rem 0.7rem; outline: none; background: #fafafa; color: #111827; font-family: inherit;
}
.hmis__search:focus { border-color: #ff3131; background: #fff; }
.hmis__list {
  max-height: 220px; overflow-y: auto; border: 1px solid #f0f0f0; border-radius: 10px;
  display: flex; flex-direction: column;
}
.hmis__empty { padding: 12px; font-size: var(--fs-sm); color: #9ca3af; text-align: center; }
.hmis__row {
  display: flex; align-items: center; gap: 8px; padding: 7px 10px; cursor: pointer;
  border-bottom: 1px solid #f5f5f5; font-size: var(--fs-sm); color: #111827;
}
.hmis__row:last-child { border-bottom: none; }
.hmis__row:hover { background: #fafafa; }
.hmis__row-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hmis__row-category { font-size: var(--fs-xs); color: #9ca3af; flex-shrink: 0; }

/* Dark (isDark via useTheme, cf. MultiSelectFilter.vue) */
.hmis--dark .hmis__all { background: #1e293b; color: #cbd5e1; }
.hmis--dark .hmis__search { background: #1e293b; border-color: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.87); }
.hmis--dark .hmis__list { border-color: rgba(255, 255, 255, 0.08); }
.hmis--dark .hmis__row { color: rgba(255, 255, 255, 0.87); border-bottom-color: rgba(255, 255, 255, 0.06); }
.hmis--dark .hmis__row:hover { background: rgba(255, 255, 255, 0.04); }
.hmis--dark .hmis__row-category { color: #64748b; }
</style>
