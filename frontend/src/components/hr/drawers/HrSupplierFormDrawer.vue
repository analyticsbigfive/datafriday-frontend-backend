<template>
  <Teleport to="body">
    <Transition name="hsd">
      <div v-if="modelValue" class="hsd-overlay" @mousedown.self="close">
        <div class="hsd-panel" :class="{ 'hsd--dark': isDark }">

          <!-- ── Header ── -->
          <div class="hsd__header">
            <div class="hsd__header-icon">
              <Pencil v-if="mode === 'edit'" :size="22" color="white" />
              <Building2 v-else :size="22" color="white" />
            </div>
            <div class="hsd__header-titles">
              <div class="hsd__header-title">{{ mode === 'edit' ? t('hrSupplierEditTitle') : t('hrSupplierAddTitle') }}</div>
              <div class="hsd__header-subtitle">{{ mode === 'edit' ? t('hrSupplierFormEditSubtitle') : t('hrSupplierFormAddSubtitle') }}</div>
            </div>
            <button class="hsd__close-btn" :disabled="loading" :aria-label="t('hrCancel')" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- ── Error ── -->
          <div v-if="error" class="hsd__error">
            <AlertCircle :size="14" style="flex-shrink:0" class="me-2" />
            {{ error }}
          </div>

          <!-- ── Body ── -->
          <div class="hsd__body">
            <!-- Photo -->
            <div class="hsd-photo" @click="triggerPicturePicker">
              <input ref="fileInput" type="file" accept="image/*" class="d-none" @change="onPictureSelected" />
              <div class="hsd-photo__zone" :class="{ 'hsd-photo__zone--filled': imagePreview }">
                <div v-if="imagePreview" class="hsd-photo__preview">
                  <img :src="imagePreview" alt="" class="hsd-photo__img" />
                  <div class="hsd-photo__overlay">
                    <Camera :size="26" color="white" />
                    <span>{{ t('clickToChange') }}</span>
                  </div>
                  <button class="hsd-photo__remove" :aria-label="t('hrDelete')" @click.stop="clearPicture">
                    <X :size="13" color="#ff3131" />
                  </button>
                </div>
                <div v-else class="hsd-photo__placeholder">
                  <div class="hsd-photo__icon">
                    <ImagePlus :size="30" style="color:#ff3131" />
                  </div>
                  <span class="hsd-photo__label">{{ t('uploadPicture') }}</span>
                  <span class="hsd-photo__hint">{{ t('fileFormat') }}</span>
                </div>
              </div>
            </div>

            <!-- Identité -->
            <div class="hsd-section">
              <div class="hsd-section__label">{{ t('hrColName') }}</div>
              <div class="hsd-field mb-3">
                <label class="hsd-field-label" for="hsd-name">{{ t('hrColName') }} <span class="hsd-required">*</span></label>
                <input id="hsd-name" v-model="form.name" type="text" class="hsd-input" />
              </div>
              <div class="hsd-field">
                <label class="hsd-field-label" for="hsd-contact">{{ t('hrColContact') }}</label>
                <input id="hsd-contact" v-model="form.contactName" type="text" class="hsd-input" />
              </div>
            </div>

            <!-- Contact -->
            <div class="hsd-section">
              <div class="hsd-section__label">{{ t('hrColEmail') }} / {{ t('hrColPhone') }}</div>
              <div class="row g-3">
                <div class="col-6">
                  <div class="hsd-field">
                    <label class="hsd-field-label" for="hsd-email">{{ t('hrColEmail') }}</label>
                    <input id="hsd-email" v-model="form.email" type="email" class="hsd-input" />
                  </div>
                </div>
                <div class="col-6">
                  <div class="hsd-field">
                    <label class="hsd-field-label" for="hsd-phone">{{ t('hrColPhone') }}</label>
                    <input id="hsd-phone" v-model="form.phone" type="tel" class="hsd-input" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Sites -->
            <div class="hsd-section">
              <div class="hsd-section__header">
                <div class="hsd-section__label mb-0">
                  {{ t('hrColSpaces') }}
                  <span class="hsd-site-count">({{ form.spaceIds.length }}/{{ spaces.length }})</span>
                </div>
                <button v-if="spaces.length" type="button" class="hsd-toggle-all" @click="toggleAllSpaces">
                  {{ isAllSpacesChecked ? t('hrSelectNone') : t('hrSelectAll') }}
                </button>
              </div>
              <div class="hsd-pill-grid">
                <div
                  v-for="s in spaces"
                  :key="s.id"
                  class="hsd-pill"
                  :class="{ 'hsd-pill--active': form.spaceIds.includes(s.id) }"
                  @click="toggleSpace(s.id)"
                >
                  <Check :size="12" class="hsd-pill__check" />
                  {{ s.name }}
                </div>
              </div>
            </div>

            <!-- Départements -->
            <div class="hsd-section">
              <div class="hsd-section__label">{{ t('hrColDepartments') }}</div>
              <div class="hsd-pill-grid">
                <div
                  v-for="dep in DEPARTMENTS"
                  :key="dep.value"
                  class="hsd-pill"
                  :class="{ 'hsd-pill--active': form.departments.includes(dep.value) }"
                  @click="toggleDepartment(dep.value)"
                >
                  <Check :size="12" class="hsd-pill__check" />
                  {{ dep.label }}
                </div>
              </div>
            </div>
          </div>

          <!-- ── Footer ── -->
          <div class="hsd__footer">
            <button class="hsd-btn hsd-btn--cancel" :disabled="loading" @click="close">{{ t('hrCancel') }}</button>
            <button class="hsd-btn hsd-btn--save" :disabled="!form.name.trim() || loading" @click="submit">
              <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              <Save v-if="mode === 'edit'" :size="15" class="me-1" />
              <Check v-else :size="15" class="me-1" />
              {{ t('hrSave') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useTheme } from 'vuetify'
import { AlertCircle, Building2, Camera, Check, ImagePlus, Pencil, Save, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import * as hrApi from '@/utils/hrApi'
import { newId } from '../hrShared'

// CFG-2 Étape 4 : HR_SUPPLIER_DEPARTMENTS (liste figée) retiré — remplacé par le référentiel
// global Department (store `departments`), filtré `allowsSuppliers` (mêmes 7 départements que
// l'ancienne liste, cf. backfill-departments.ts). `form.departments` stocke `code ?? id` (valeur
// stable), plus le libellé — le backend rejette désormais un libellé brut (CFG-2 Étape 4).
const store = useStore()
onMounted(() => store.dispatch('departments/fetchDepartments'))
const DEPARTMENTS = computed(() =>
  (store.getters['departments/departments'] || [])
    .filter((d) => d.allowsSuppliers)
    .map((d) => ({ value: d.code ?? d.id, label: d.name })),
)

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  initial: { type: Object, default: null },
  spaces: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const loading = ref(false)
const error = ref('')
const fileInput = ref(null)
const imagePreview = ref('')
const form = reactive({ id: '', name: '', email: '', phone: '', contactName: '', picture: '', spaceIds: [], departments: [] })

function reset() {
  const s = props.initial
  form.id = s?.id || newId()
  form.name = s?.name || ''
  form.email = s?.email || ''
  form.phone = s?.phone || ''
  form.contactName = s?.contactName || ''
  form.picture = s?.picture || ''
  form.spaceIds = [...(s?.spaceIds || [])]
  form.departments = [...(s?.departments || [])]
  imagePreview.value = s?.picture || ''
  error.value = ''
  loading.value = false
}
watch(() => props.modelValue, (open) => { if (open) reset() })

function triggerPicturePicker() { fileInput.value?.click() }
function clearPicture() {
  if (imagePreview.value && imagePreview.value.startsWith('blob:')) URL.revokeObjectURL(imagePreview.value)
  imagePreview.value = ''
  form.picture = ''
  if (fileInput.value) fileInput.value.value = ''
}
async function onPictureSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  clearPicture()
  imagePreview.value = URL.createObjectURL(file)
  try {
    form.picture = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('FileReader error'))
      reader.readAsDataURL(file)
    })
  } catch {
    form.picture = ''
  }
}

const isAllSpacesChecked = computed(() =>
  props.spaces.length > 0 && form.spaceIds.length === props.spaces.length
)
function toggleSpace(id) {
  const i = form.spaceIds.indexOf(id)
  if (i === -1) form.spaceIds.push(id)
  else form.spaceIds.splice(i, 1)
}
function toggleAllSpaces() {
  form.spaceIds = isAllSpacesChecked.value ? [] : props.spaces.map((s) => s.id)
}
function toggleDepartment(dep) {
  const i = form.departments.indexOf(dep)
  if (i === -1) form.departments.push(dep)
  else form.departments.splice(i, 1)
}

function close() {
  emit('update:modelValue', false)
}
async function submit() {
  if (!form.name.trim()) { error.value = t('hrNameRequired'); return }
  loading.value = true
  error.value = ''
  try {
    const payload = {
      id: form.id,
      name: form.name.trim(),
      email: form.email,
      phone: form.phone,
      contactName: form.contactName,
      picture: form.picture,
      spaceIds: [...form.spaceIds],
      departments: [...form.departments],
    }
    if (props.mode === 'edit') await hrApi.updateHRSupplier(payload)
    else await hrApi.createHRSupplier(payload)
    emit('saved')
    close()
  } catch (e) {
    error.value = t('hrSaveError')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* Drawer coulissant self-contained (parité SupplierFormDrawer `.sfd-*`), tokens
   de la charte typo. */
.hsd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.38);
  display: flex;
  justify-content: flex-end;
}
.hsd-panel {
  width: 560px;
  max-width: 100%;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.14);
  overflow: hidden;
}
.hsd-panel.hsd--dark { background: #0f172a; }

/* Transitions */
.hsd-enter-active, .hsd-leave-active { transition: opacity 0.25s ease; }
.hsd-enter-active .hsd-panel,
.hsd-leave-active .hsd-panel { transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.hsd-enter-from { opacity: 0; }
.hsd-enter-from .hsd-panel { transform: translateX(100%); }
.hsd-leave-to { opacity: 0; }
.hsd-leave-to .hsd-panel { transform: translateX(100%); }

/* Header */
.hsd__header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  background: #ff3131;
  flex-shrink: 0;
}
.hsd__header-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.hsd__header-titles { flex: 1; min-width: 0; }
.hsd__header-title { font-size: var(--fs-lg); font-weight: var(--fw-bold); color: #fff; line-height: 1.2; }
.hsd__header-subtitle { font-size: var(--fs-sm); color: rgba(255, 255, 255, 0.72); margin-top: 3px; }
.hsd__close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.18s;
  flex-shrink: 0;
}
.hsd__close-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.3); }
.hsd__close-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Error */
.hsd__error {
  display: flex;
  align-items: center;
  padding: 10px 24px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  font-size: var(--fs-base);
  color: #ff3131;
  flex-shrink: 0;
}

/* Body */
.hsd__body {
  flex: 1 1 0;
  overflow-y: auto;
  padding: 22px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  scrollbar-width: thin;
  scrollbar-color: #e5e7eb transparent;
}
.hsd__body::-webkit-scrollbar { width: 4px; }
.hsd__body::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
.hsd--dark .hsd__body::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); }

/* Photo (parité .sfd-photo) */
.hsd-photo { cursor: pointer; }
.hsd-photo__zone {
  border: 2px dashed #e5e7eb;
  border-radius: 14px;
  min-height: 130px;
  background: #fafafa;
  overflow: hidden;
  position: relative;
  transition: border-color 0.2s, background 0.2s;
}
.hsd-photo__zone:hover { border-color: #ff3131; background: #fff5f5; }
.hsd-photo__zone--filled { border-style: solid; border-color: #e5e7eb; background: #fff; min-height: 160px; }
.hsd-photo__placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28px 16px; gap: 6px; }
.hsd-photo__icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}
.hsd-photo__label { font-size: var(--fs-base); font-weight: var(--fw-semibold); color: #374151; }
.hsd-photo__hint { font-size: var(--fs-xs); color: #9ca3af; }
.hsd-photo__preview { position: relative; width: 100%; height: 160px; }
.hsd-photo__img { width: 100%; height: 100%; object-fit: cover; }
.hsd-photo__overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.25s;
  color: #fff;
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
}
.hsd-photo__zone:hover .hsd-photo__overlay { opacity: 1; }
.hsd-photo__remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  z-index: 1;
}
.hsd--dark .hsd-photo__zone { background: #1e293b; border-color: rgba(255, 255, 255, 0.15); }
.hsd--dark .hsd-photo__zone:hover { border-color: #ff3131; background: rgba(255, 49, 49, 0.08); }
.hsd--dark .hsd-photo__label { color: rgba(255, 255, 255, 0.87); }
.hsd--dark .hsd-photo__hint { color: rgba(255, 255, 255, 0.4); }

/* Section */
.hsd-section__label {
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: 0.9px;
  color: #9ca3af;
  margin-bottom: 12px;
}
.hsd-section__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.hsd-site-count { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: #9ca3af; text-transform: none; letter-spacing: 0; margin-left: 4px; }
.hsd-toggle-all { background: none; border: none; font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: #ff3131; cursor: pointer; padding: 0; }
.hsd-toggle-all:hover { text-decoration: underline; }

/* Fields */
.hsd-field { display: flex; flex-direction: column; gap: 6px; }
.hsd-field-label { font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: #374151; }
.hsd-required { color: #ff3131; }
.hsd-input {
  width: 100%;
  border-radius: 11px;
  border: 1.5px solid #e5e7eb;
  font-size: var(--fs-base);
  color: #111827;
  padding: 0.65rem 0.8rem;
  line-height: 1.4;
  background: #fafafa;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  font-family: inherit;
}
.hsd-input:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1);
  background: #fff;
}

/* Pills */
.hsd-pill-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.hsd-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 13px;
  border-radius: 100px;
  border: 1.5px solid #e5e7eb;
  background: #f9fafb;
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
  color: #6b7280;
  cursor: pointer;
  user-select: none;
  transition: all 0.18s;
}
.hsd-pill:hover { border-color: #ff3131; color: #ff3131; background: #fff5f5; }
.hsd-pill--active {
  border-color: #ff3131;
  background: #fef2f2;
  color: #ff3131;
  font-weight: var(--fw-semibold);
  box-shadow: 0 0 0 2px rgba(255, 49, 49, 0.1);
}
.hsd-pill__check { opacity: 0; transition: opacity 0.15s; }
.hsd-pill--active .hsd-pill__check { opacity: 1; }

/* Footer */
.hsd__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
  flex-shrink: 0;
}
.hsd--dark .hsd__footer { border-top-color: rgba(255, 255, 255, 0.08); background: #1e293b; }
.hsd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 24px;
  border-radius: 100px;
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  line-height: 1.4;
}
.hsd-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
.hsd-btn--cancel { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.hsd-btn--cancel:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; color: #374151; }
.hsd-btn--save { background: #ff3131; color: #fff; box-shadow: 0 4px 14px rgba(255, 49, 49, 0.3); }
.hsd-btn--save:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49, 0.4); transform: translateY(-1px); }

/* ── Dark mode ── */
.hsd--dark .hsd-section__label { color: #64748b; }
.hsd--dark .hsd-field-label { color: #cbd5e1; }
.hsd--dark .hsd-input { background: #1e293b; border-color: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.87); }
.hsd--dark .hsd-input:focus { background: #263548; border-color: #ff3131; }
.hsd--dark .hsd-input::placeholder { color: rgba(255, 255, 255, 0.25); }
.hsd--dark .hsd-pill { background: #1e293b; border-color: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.55); }
.hsd--dark .hsd-pill:hover { border-color: #ff3131; color: #e84444; background: rgba(255, 49, 49, 0.1); }
.hsd--dark .hsd-pill--active { background: rgba(255, 49, 49, 0.15); border-color: #ff3131; color: #e84444; }
</style>
