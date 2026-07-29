<template>
  <Teleport to="body">
    <Transition name="hpd">
      <div v-if="modelValue" class="hpd-overlay" @mousedown.self="close">
        <div class="hpd-panel" :class="{ 'hpd--dark': isDark }">

          <!-- ── Header ── -->
          <div class="hpd__header">
            <div class="hpd__header-icon">
              <Pencil v-if="mode === 'edit'" :size="22" color="white" />
              <Briefcase v-else :size="22" color="white" />
            </div>
            <div class="hpd__header-titles">
              <div class="hpd__header-title">{{ mode === 'edit' ? t('hrPositionEditTitle') : t('hrPositionAddTitle') }}</div>
              <div class="hpd__header-subtitle">{{ t('hrPositionsSubtitle') }}</div>
            </div>
            <button class="hpd__close-btn" :disabled="loading" :aria-label="t('hrCancel')" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- ── Error ── -->
          <div v-if="error" class="hpd__error">
            <AlertCircle :size="14" style="flex-shrink:0" class="me-2" />
            {{ error }}
          </div>

          <!-- ── Body ── -->
          <div class="hpd__body">
            <!-- Aucune agence -->
            <div v-if="!suppliers.length" class="hpd-notice">
              <Building2 :size="18" class="me-2" style="flex-shrink:0" />
              {{ t('hrNoSupplierYet') }}
            </div>

            <!-- Agence -->
            <div class="hpd-section">
              <div class="hpd-section__label">{{ t('hrColSupplier') }}</div>
              <div class="hpd-field">
                <label class="hpd-field-label" for="hpd-supplier">{{ t('hrColSupplier') }} <span class="hpd-required">*</span></label>
                <select id="hpd-supplier" v-model="form.supplierId" class="hpd-input hpd-select" :disabled="!suppliers.length">
                  <option value="" disabled>{{ t('hrSelectSupplier') }}</option>
                  <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
            </div>

            <!-- Poste -->
            <div class="hpd-section">
              <div class="hpd-section__label">{{ t('hrColPosition') }}</div>
              <div class="hpd-field mb-3">
                <label class="hpd-field-label" for="hpd-name">{{ t('hrColPosition') }} <span class="hpd-required">*</span></label>
                <input id="hpd-name" v-model="form.positionName" type="text" class="hpd-input" list="hpd-known-positions" autocomplete="off" />
                <datalist id="hpd-known-positions">
                  <option v-for="name in knownNames" :key="name" :value="name" />
                </datalist>
              </div>
              <div class="hpd-field">
                <label class="hpd-field-label" for="hpd-sector">{{ t('hrColSector') }}</label>
                <select id="hpd-sector" v-model="form.sector" class="hpd-input hpd-select">
                  <option value="">—</option>
                  <option v-for="sec in SECTORS" :key="sec" :value="sec">{{ sec }}</option>
                </select>
              </div>
            </div>

            <!-- Tarif -->
            <div class="hpd-section">
              <div class="hpd-section__label">{{ t('hrColRate') }}</div>
              <div class="hpd-field">
                <label class="hpd-field-label" for="hpd-rate">{{ t('hrColRate') }} <span class="hpd-required">*</span></label>
                <div class="hpd-rate">
                  <input id="hpd-rate" v-model.number="form.ratePerHour" type="number" min="0" step="0.5" class="hpd-input hpd-rate__input" />
                  <span class="hpd-rate__suffix">/ h</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Footer ── -->
          <div class="hpd__footer">
            <button class="hpd-btn hpd-btn--cancel" :disabled="loading" @click="close">{{ t('hrCancel') }}</button>
            <button class="hpd-btn hpd-btn--save" :disabled="!canSave || loading" @click="submit">
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
import { computed, reactive, ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import { AlertCircle, Briefcase, Building2, Check, Pencil, Save, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import * as hrApi from '@/utils/hrApi'
import { HR_SECTORS as SECTORS, newId } from '../hrShared'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  initial: { type: Object, default: null },
  suppliers: { type: Array, default: () => [] },
  // Noms de poste déjà utilisés (objets {id,name} ou chaînes), pour l'autocomplétion.
  positionNames: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const loading = ref(false)
const error = ref('')
const form = reactive({ id: '', supplierId: '', positionName: '', sector: '', ratePerHour: null })

// Les noms connus peuvent arriver en objets {id,name} ou en chaînes brutes.
const knownNames = computed(() => {
  const names = props.positionNames.map((p) => (typeof p === 'string' ? p : p?.name)).filter(Boolean)
  return [...new Set(names)]
})

const canSave = computed(() =>
  !!form.supplierId &&
  !!form.positionName.trim() &&
  form.ratePerHour !== null && form.ratePerHour !== '' && Number(form.ratePerHour) >= 0
)

function reset() {
  const p = props.initial
  form.id = p?.id || newId()
  form.supplierId = p?.supplierId || ''
  form.positionName = p?.positionName || ''
  form.sector = p?.sector || ''
  form.ratePerHour = p?.ratePerHour ?? null
  error.value = ''
  loading.value = false
}
watch(() => props.modelValue, (open) => { if (open) reset() })

function close() {
  emit('update:modelValue', false)
}
async function submit() {
  if (!form.supplierId) { error.value = t('hrSaveError'); return }
  if (!form.positionName.trim()) { error.value = t('hrNameRequired'); return }
  if (form.ratePerHour === null || form.ratePerHour === '' || Number(form.ratePerHour) < 0) {
    error.value = t('hrRateRequired'); return
  }
  loading.value = true
  error.value = ''
  try {
    const name = form.positionName.trim()
    const payload = {
      id: form.id,
      supplierId: form.supplierId,
      positionName: name,
      sector: form.sector || '',
      ratePerHour: Number(form.ratePerHour),
    }
    if (props.mode === 'edit') await hrApi.updateStaffPosition(payload)
    else await hrApi.createStaffPosition(payload)

    // Mémorise le nom du poste s'il est nouveau (alimente l'autocomplétion).
    if (!knownNames.value.some((n) => n.toLowerCase() === name.toLowerCase())) {
      try { await hrApi.createPositionName({ id: newId(), name }) } catch (_) { /* best effort */ }
    }

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
/* Drawer coulissant self-contained (parité HrSupplierFormDrawer `.hsd-*`), tokens
   de la charte typo. */
.hpd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.38);
  display: flex;
  justify-content: flex-end;
}
.hpd-panel {
  width: 520px;
  max-width: 100%;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.14);
  overflow: hidden;
}
.hpd-panel.hpd--dark { background: #0f172a; }

/* Transitions */
.hpd-enter-active, .hpd-leave-active { transition: opacity 0.25s ease; }
.hpd-enter-active .hpd-panel,
.hpd-leave-active .hpd-panel { transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.hpd-enter-from { opacity: 0; }
.hpd-enter-from .hpd-panel { transform: translateX(100%); }
.hpd-leave-to { opacity: 0; }
.hpd-leave-to .hpd-panel { transform: translateX(100%); }

/* Header */
.hpd__header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  background: #ff3131;
  flex-shrink: 0;
}
.hpd__header-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.hpd__header-titles { flex: 1; min-width: 0; }
.hpd__header-title { font-size: var(--fs-lg); font-weight: var(--fw-bold); color: #fff; line-height: 1.2; }
.hpd__header-subtitle { font-size: var(--fs-sm); color: rgba(255, 255, 255, 0.72); margin-top: 3px; }
.hpd__close-btn {
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
.hpd__close-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.3); }
.hpd__close-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Error */
.hpd__error {
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
.hpd__body {
  flex: 1 1 0;
  overflow-y: auto;
  padding: 22px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  scrollbar-width: thin;
  scrollbar-color: #e5e7eb transparent;
}
.hpd__body::-webkit-scrollbar { width: 4px; }
.hpd__body::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
.hpd--dark .hpd__body::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); }

/* Notice "aucune agence" */
.hpd-notice {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  font-size: var(--fs-base);
  color: #b45309;
}
.hpd--dark .hpd-notice { background: rgba(180, 83, 9, 0.14); border-color: rgba(251, 146, 60, 0.35); color: #fdba74; }

/* Section */
.hpd-section__label {
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: 0.9px;
  color: #9ca3af;
  margin-bottom: 12px;
}

/* Fields */
.hpd-field { display: flex; flex-direction: column; gap: 6px; }
.hpd-field-label { font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: #374151; }
.hpd-required { color: #ff3131; }
.hpd-input {
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
.hpd-input:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1);
  background: #fff;
}
.hpd-select { appearance: none; -webkit-appearance: none; cursor: pointer; padding-right: 2rem;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.7rem center;
}
.hpd-select:disabled { opacity: 0.55; cursor: not-allowed; }

/* Tarif */
.hpd-rate { position: relative; display: flex; align-items: center; }
.hpd-rate__input { padding-right: 2.4rem; }
.hpd-rate__suffix {
  position: absolute;
  right: 0.85rem;
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  color: #9ca3af;
  pointer-events: none;
}

/* Footer */
.hpd__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
  flex-shrink: 0;
}
.hpd--dark .hpd__footer { border-top-color: rgba(255, 255, 255, 0.08); background: #1e293b; }
.hpd-btn {
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
.hpd-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
.hpd-btn--cancel { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.hpd-btn--cancel:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; color: #374151; }
.hpd-btn--save { background: #ff3131; color: #fff; box-shadow: 0 4px 14px rgba(255, 49, 49, 0.3); }
.hpd-btn--save:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49, 0.4); transform: translateY(-1px); }

/* ── Dark mode ── */
.hpd--dark .hpd-section__label { color: #64748b; }
.hpd--dark .hpd-field-label { color: #cbd5e1; }
.hpd--dark .hpd-input { background: #1e293b; border-color: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.87); }
.hpd--dark .hpd-input:focus { background: #263548; border-color: #ff3131; }
.hpd--dark .hpd-input::placeholder { color: rgba(255, 255, 255, 0.25); }
.hpd--dark .hpd-select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
}
.hpd--dark .hpd-select option { background: #1e293b; color: rgba(255, 255, 255, 0.87); }
.hpd--dark .hpd-rate__suffix { color: #64748b; }
</style>
