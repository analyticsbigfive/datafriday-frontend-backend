<template>
  <Teleport to="body">
    <Transition name="hrd">
      <div v-if="modelValue" class="hrd-overlay" @mousedown.self="close">
        <div class="hrd-panel" :class="{ 'hrd--dark': isDark }">

          <!-- Header rouge -->
          <div class="hrd-header">
            <div class="hrd-header-icon">
              <Pencil v-if="mode === 'edit'" :size="22" color="white" />
              <BriefcaseBusiness v-else :size="22" color="white" />
            </div>
            <div class="hrd-header-titles">
              <div class="hrd-header-title">{{ mode === 'edit' ? t('hrPositionsEdit') : t('hrPositionsAdd') }}</div>
              <div class="hrd-header-subtitle">{{ t('hrPositionsSubtitle') }}</div>
            </div>
            <button class="hrd-close" :aria-label="t('hrCancel')" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Erreur -->
          <div v-if="error" class="hrd-error">
            <AlertCircle :size="14" style="flex-shrink:0" />
            {{ error }}
          </div>

          <!-- Corps -->
          <div class="hrd-body">
            <div class="hrd-section">
              <div class="hrd-field">
                <label class="hrd-label" for="hr-pos-supplier">{{ t('hrColSupplier') }} <span class="hrd-required">*</span></label>
                <select id="hr-pos-supplier" v-model="form.supplierId" class="hrd-input">
                  <option :value="null" disabled>—</option>
                  <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>

              <div class="hrd-field">
                <label class="hrd-label" for="hr-pos-sector">{{ t('hrColSector') }} <span class="hrd-required">*</span></label>
                <select id="hr-pos-sector" v-model="form.sector" class="hrd-input">
                  <option value="" disabled>—</option>
                  <option v-for="sec in sectorOptions" :key="sec" :value="sec">{{ sec }}</option>
                </select>
              </div>

              <div class="hrd-field">
                <label class="hrd-label" for="hr-pos-name">{{ t('hrColPosition') }} <span class="hrd-required">*</span></label>
                <input id="hr-pos-name" v-model="form.positionName" type="text" class="hrd-input" list="hr-pos-name-list" />
                <datalist id="hr-pos-name-list">
                  <option v-for="n in positionNameOptions" :key="n" :value="n" />
                </datalist>
              </div>

              <div class="hrd-field">
                <label class="hrd-label" for="hr-pos-rate">{{ t('hrColRate') }} <span class="hrd-required">*</span></label>
                <input id="hr-pos-rate" v-model.number="form.ratePerHour" type="number" min="0" step="0.5" class="hrd-input" />
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="hrd-footer">
            <button class="hrd-btn hrd-btn--cancel" @click="close">{{ t('hrCancel') }}</button>
            <button class="hrd-btn hrd-btn--save" @click="submit">
              <Check :size="15" />
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
import { AlertCircle, BriefcaseBusiness, Check, Pencil, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import { HR_SECTORS, newId } from './hrShared'
import './hrForms.css'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  initial: { type: Object, default: null },
  suppliers: { type: Array, default: () => [] },
  positionNames: { type: Array, default: () => [] },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'submit'])

const error = ref('')
const form = reactive({ id: '', supplierId: null, sector: '', positionName: '', ratePerHour: 0 })

function reset() {
  const p = props.initial
  form.id = p?.id || newId()
  form.supplierId = p?.supplierId ?? null
  form.sector = p?.sector || ''
  form.positionName = p?.positionName || ''
  form.ratePerHour = typeof p?.ratePerHour === 'number' ? p.ratePerHour : 0
  error.value = ''
}
watch(() => props.modelValue, (open) => { if (open) reset() })

const supplierById = computed(() => Object.fromEntries(props.suppliers.map((s) => [s.id, s])))
// Secteurs proposés : ceux déclarés par l'agence choisie, sinon la liste complète.
const sectorOptions = computed(() => {
  const declared = supplierById.value[form.supplierId]?.sectors
  return declared?.length ? declared : HR_SECTORS
})
// Noms de poste connus pour le secteur choisi (saisie libre possible via datalist).
const positionNameOptions = computed(() => {
  const rows = props.positionNames.filter((n) => !form.sector || n.sector === form.sector)
  return [...new Set(rows.map((n) => n.name))]
})

function close() {
  emit('update:modelValue', false)
}
function submit() {
  if (!form.supplierId) { error.value = t('hrRequired'); return }
  if (!form.sector) { error.value = t('hrRequired'); return }
  if (!form.positionName.trim()) { error.value = t('hrRequired'); return }
  if (!(form.ratePerHour >= 0)) { error.value = t('hrRequired'); return }
  emit('submit', {
    id: form.id,
    supplierId: form.supplierId,
    sector: form.sector,
    positionName: form.positionName.trim(),
    ratePerHour: Number(form.ratePerHour) || 0,
  })
}
</script>
