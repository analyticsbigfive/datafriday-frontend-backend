<template>
  <div class="d-flex flex-column" style="height: 100%; min-height: 0;">
    <!-- En-tête : sans image = titre Properties + badge ; avec image = bannière hero. -->
    <div
      class="ip-header"
      :class="{ 'ip-header--image': hasImage }"
      :style="hasImage ? { backgroundImage: `url(${element.image})` } : null"
    >
      <div class="ip-header__row">
        <div class="ip-header__id">
          <template v-if="hasImage">
            <span class="ip-header__type-over">{{ labelOf(element.type) }}</span>
            <span class="ip-header__name-over">{{ element.name }}</span>
          </template>
          <span v-else class="ip-header__title">{{ t('b2PropertiesTitle') }}</span>
        </div>
        <div class="ip-header__actions">
          <!-- Retour : quitte le shop (revient à la liste) SANS retirer l'image
               éventuellement uploadée (contrairement au ✕ qui, avec image, la retire). -->
          <button type="button" class="ip-act" :title="t('b2Back')" @click="closeInspector">
            <v-icon icon="mdi-arrow-left" size="18" />
          </button>
          <button
            type="button"
            class="ip-act ip-act--upload"
            :title="hasImage ? t('b2ChangeImage') : t('b2Image')"
            @click="fileInput?.click()"
          >
            <v-icon
              :icon="hasImage ? 'mdi-camera-outline' : 'mdi-upload'"
              size="18"
              :color="hasImage ? undefined : '#111827'"
            />
          </button>
          <button type="button" class="ip-act" :title="hasImage ? t('b2RemoveImage') : t('close')" @click="onCloseClick">
            <v-icon icon="mdi-close" size="18" />
          </button>
          <button type="button" class="ip-act ip-act--dup" :title="t('b2Duplicate')" :disabled="duplicating" @click="duplicate">
            <v-icon icon="mdi-content-copy" size="16" />
          </button>
          <button type="button" class="ip-act ip-act--danger" :title="t('delete')" @click="deleteOpen = true">
            <v-icon icon="mdi-delete-outline" size="17" />
          </button>
        </div>
      </div>
      <span v-if="!hasImage" class="ip-type-badge" :style="typeBadgeStyle">{{ labelOf(element.type) }}</span>
      <input ref="fileInput" type="file" accept="image/*" style="display: none;" @change="onImagePicked" />
    </div>

    <!-- Sections (matrice sections × type — elementTaxonomy.sectionsForType) -->
    <div class="flex-grow-1 px-4" style="overflow-y: auto; min-height: 0;">
      <!-- Ordre (capture) : Name → Shop Type → [Area] → Configuration →
           Performance → Menu → Inventory → Staffing inputs → Staff → Position. -->
      <IdentitySection />
      <SubtypesSection v-if="sections.subtypes" />
      <StorageShopsSection v-if="sections.storageShops" />
      <ConfigsSection v-if="sections.configs" />
      <PerformanceSection v-if="sections.performance" />
      <MenuSection v-if="sections.menu" />
      <InventorySection v-if="sections.inventory" />
      <StorageInventorySection v-if="sections.storageInventory" />
      <StaffingInputsSection v-if="sections.staffingInputs" />
      <StaffSection v-if="sections.staff" />
      <GeometrySection v-if="sections.geometry" />
    </div>

    <DeleteElementDialog v-model="deleteOpen" :element="element" />
  </div>
</template>

<script setup>
import { ref, computed, inject, onMounted } from 'vue'
import { useStore as useVuexStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import {
  colorOf as colorOfTool, labelOf as labelOfTool, sectionsForType as sectionsForTypeOf, normalizeType, buildTools,
} from '../../constants/elementTaxonomy'
import IdentitySection from './sections/IdentitySection.vue'
import StorageShopsSection from './sections/StorageShopsSection.vue'
import SubtypesSection from './sections/SubtypesSection.vue'
import ConfigsSection from './sections/ConfigsSection.vue'
import GeometrySection from './sections/GeometrySection.vue'
import PerformanceSection from './sections/PerformanceSection.vue'
import MenuSection from './sections/MenuSection.vue'
import InventorySection from './sections/InventorySection.vue'
import StorageInventorySection from './sections/StorageInventorySection.vue'
import StaffingInputsSection from './sections/StaffingInputsSection.vue'
import StaffSection from './sections/StaffSection.vue'
import DeleteElementDialog from '../../dialogs/DeleteElementDialog.vue'

const { t } = useI18n()
const store = inject('builderStore')
const vuexStore = useVuexStore()
onMounted(() => vuexStore.dispatch('departments/fetchDepartments'))
// CFG-2 Étape 5 : départements/sous-types depuis le référentiel global (store `departments`),
// plus la liste statique elementTaxonomy.js — wrappers locaux exposés au template sous les mêmes
// noms (`labelOf`/`colorOf`) pour ne pas changer le template.
const tools = computed(() => buildTools(vuexStore.getters['departments/departments'] || []))
function labelOf(type) { return labelOfTool(type, tools.value) }
function colorOf(type) { return colorOfTool(type, tools.value) }

const element = computed(() => store.selectedElement.value)
const sections = computed(() => sectionsForTypeOf(element.value?.type, tools.value))
const hasImage = computed(() => !!element.value?.image)
// Badge de type : texte à la couleur de l'élément, fond = teinte légère.
const typeBadgeStyle = computed(() => {
  const c = colorOf(element.value?.type) || '#6b7280'
  return { color: c, background: `color-mix(in srgb, ${c} 15%, transparent)` }
})
const deleteOpen = ref(false)
const duplicating = ref(false)
const fileInput = ref(null)

async function duplicate() {
  duplicating.value = true
  try {
    await store.duplicateElement(element.value.id)
  } finally {
    duplicating.value = false
  }
}

// Upload de l'image du shop (bouton caméra/upload de l'entête) → element.image (data URL).
function onImagePicked(event) {
  const file = event.target.files?.[0]
  const el = element.value
  if (!file || !el) return
  const reader = new FileReader()
  reader.onloadend = () => {
    store.commitElementPatch(el.id, { image: reader.result }, { image: el.image }, 'Image')
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}

// Bouton X contextuel : avec image → retire l'image ; sans image → quitte l'inspecteur.
function onCloseClick() {
  if (hasImage.value) removeImage()
  else closeInspector()
}

function removeImage() {
  const el = element.value
  if (!el) return
  store.commitElementPatch(el.id, { image: null }, { image: el.image }, 'Image')
}

// Fermeture : on réactive l'outil palette du type courant pour revenir à la LISTE
// des éléments de ce type (sinon activeTool est nul → ElementListPanel en état vide).
function closeInspector() {
  const toolType = element.value ? normalizeType(element.value.type) : null
  store.selectElement(null)
  if (toolType) store.setActiveTool(toolType)
}
</script>

<style scoped>
.b2-swatch {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  flex-shrink: 0;
}
/* En-tête Properties + actions + badge de type */
.ip-header {
  padding: 14px 16px 16px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.ip-header__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.ip-header__title {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-xl);
  font-weight: 700;
  line-height: 1.2;
  color: rgb(var(--v-theme-on-surface));
}
.ip-header__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.ip-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.6);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.ip-act:hover { background: rgba(var(--v-theme-on-surface), 0.08); color: rgb(var(--v-theme-on-surface)); }
.ip-act:disabled { opacity: 0.45; cursor: default; }
.ip-act--dup { color: #2563eb; }
.ip-act--dup:hover { background: rgba(37, 99, 235, 0.1); color: #2563eb; }
.ip-act--danger { color: #ff3131; }
.ip-act--danger:hover { background: rgba(255, 49, 49, 0.1); color: #ff3131; }
.ip-type-badge {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 100px;
  font-size: var(--fs-base);
  font-weight: 600;
}

/* Wrapper identité (titre Properties, ou type + nom en surimpression sur l'image). */
.ip-header__id { flex: 1; min-width: 0; }

/* État AVEC image : bannière hero. */
.ip-header--image {
  position: relative;
  min-height: 168px;
  padding: 0;
  background-size: cover;
  background-position: center;
  border-bottom: none;
}
.ip-header--image::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.42) 0%, rgba(0, 0, 0, 0) 42%);
  pointer-events: none;
}
.ip-header--image .ip-header__row {
  position: relative;
  z-index: 1;
  align-items: flex-start;
  margin-bottom: 0;
  padding: 12px 14px;
}
.ip-header__type-over,
.ip-header__name-over {
  display: block;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.55);
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ip-header__type-over { font-size: var(--fs-base); font-weight: 600; }
.ip-header__name-over { font-size: var(--fs-lg); font-weight: 700; }

/* Actions en blanc par-dessus l'image (override bleu/rouge). */
.ip-header--image .ip-act,
.ip-header--image .ip-act--dup,
.ip-header--image .ip-act--danger {
  color: #fff;
}
.ip-header--image .ip-act:hover { background: rgba(255, 255, 255, 0.22); color: #fff; }
.ip-header--image .ip-act--danger:hover { background: rgba(255, 49, 49, 0.4); color: #fff; }

/* Scrollbar fine sur la zone de sections */
.flex-grow-1::-webkit-scrollbar { width: 6px; }
.flex-grow-1::-webkit-scrollbar-track { background: transparent; }
.flex-grow-1::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 3px;
}
.flex-grow-1::-webkit-scrollbar-thumb:hover { background: rgba(var(--v-theme-on-surface), 0.32); }

/* Champs de formulaire dans l'inspecteur — parité v1 PropertiesPanelView */
:deep(.v-field--variant-outlined) {
  border-radius: 10px;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
:deep(.v-field--variant-outlined.v-field--focused) {
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}
:deep(.v-field__input) { font-size: var(--fs-base); }
:deep(.v-field--density-compact .v-field__input) { min-height: 36px; }
:deep(.v-label) { font-size: var(--fs-sm); }
</style>
