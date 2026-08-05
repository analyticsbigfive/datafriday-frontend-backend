<template>
  <SectionCard
    v-if="tool && subtypeOptions.length"
    :title="`${t('b2SubtypesPrefix')} ${tool.label}`"
    :icon="tool.icon"
    default-open
  >
    <div class="st-list">
      <label
        v-for="option in subtypeOptions"
        :key="option.value"
        class="st-item"
      >
        <input
          type="checkbox"
          class="st-native"
          :checked="(element.subtypes || []).includes(option.value)"
          @change="(e) => toggle(option.value, e.target.checked)"
        />
        <span class="st-box"><Check :size="13" :stroke-width="3" /></span>
        <span class="st-label">{{ option.label }}</span>
      </label>
    </div>
  </SectionCard>
</template>

<script setup>
import { computed, inject, onMounted } from 'vue'
import { useStore as useVuexStore } from 'vuex'
import { Check } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'
import { toolOf, storageSubtypesFor, buildTools } from '../../../constants/elementTaxonomy'

const { t } = useI18n()
const store = inject('builderStore')
const vuexStore = useVuexStore()
const element = computed(() => store.selectedElement.value)

// CFG-2 Étape 5 : les 8 départements (nom/couleur/icône/sous-types génériques) viennent
// désormais du référentiel global Department — plus de liste statique elementTaxonomy.js.
onMounted(() => {
  vuexStore.dispatch('departments/fetchDepartments')
  vuexStore.dispatch('storageTypes/fetchStorageTypes')
})
const tools = computed(() => buildTools(vuexStore.getters['departments/departments'] || []))
const tool = computed(() => toolOf(element.value?.type, tools.value))

// Le tool "storage" a ses sous-types de CONDITION (dry/cold/belowzero + créations tenant)
// pilotés par le référentiel StorageType (Configurations), pas par ses propres Subtype
// génériques (lien délibéré établi avant CFG-2 Étape 5, préservé ici) — les autres tools
// utilisent leurs sous-types Department normaux.
const subtypeOptions = computed(() => {
  if (tool.value?.type !== 'storage') return tool.value?.subtypes || []
  return storageSubtypesFor(vuexStore.getters['storageTypes/storageTypes'] || [])
})

function toggle(value, checked) {
  const el = element.value
  if (!el) return
  const previous = [...(el.subtypes || [])]
  const next = checked ? [...new Set([...previous, value])] : previous.filter((v) => v !== value)
  store.commitElementPatch(el.id, { subtypes: next }, { subtypes: previous }, 'Sous-types')
}
</script>

<style scoped>
.st-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.st-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.st-item:hover { background: rgba(var(--v-theme-on-surface), 0.04); }

/* Case native masquée : la case visuelle est .st-box. */
.st-native {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
}
.st-box {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 2px solid rgba(var(--v-theme-on-surface), 0.25);
  background: rgba(var(--v-theme-on-surface), 0.02);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.st-native:checked + .st-box {
  background: #ff3131;
  border-color: #ff3131;
  color: #fff;
}
.st-native:focus-visible + .st-box {
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.16);
}
.st-label {
  font-size: var(--fs-md);
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
}
</style>
