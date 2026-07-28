<template>
  <!-- Drawer « Ajouter un Goal » / « Ajouter un Nombre de staff par Zone Manager »
       (maquettes Bertrand). Un champ valeur + sélection d'espaces + « TOUS ».
       Même chrome que HrSupplierFormDrawer (Teleport + hrForms.css). -->
  <Teleport to="body">
    <Transition name="hrd">
      <div v-if="modelValue" class="hrd-overlay" @mousedown.self="close">
        <div class="hrd-panel" :class="{ 'hrd--dark': isDark }">

          <div class="hrd-header">
            <div class="hrd-header-icon">
              <Target v-if="kind === 'goal'" :size="22" color="white" />
              <UserCog v-else :size="22" color="white" />
            </div>
            <div class="hrd-header-titles">
              <div class="hrd-header-title">{{ title }}</div>
              <div class="hrd-header-subtitle">{{ t('hrSettingsSubtitle') }}</div>
            </div>
            <button class="hrd-close" :aria-label="t('hrCancel')" @click="close">
              <X :size="18" />
            </button>
          </div>

          <div v-if="error" class="hrd-error">
            <AlertCircle :size="14" style="flex-shrink:0" />
            {{ error }}
          </div>

          <div class="hrd-body">
            <!-- Valeur -->
            <div class="hrd-section">
              <div class="hrd-field">
                <label class="hrd-label" for="hr-value">{{ valueLabel }} <span class="hrd-required">*</span></label>
                <input
                  id="hr-value"
                  v-model.number="form.value"
                  type="number"
                  min="0"
                  :step="kind === 'goal' ? '10' : '1'"
                  class="hrd-input"
                />
              </div>
            </div>

            <!-- Espaces + TOUS -->
            <div class="hrd-section">
              <div class="hrd-section__header">
                <div class="hrd-section__label" style="margin-bottom:0">
                  {{ t('hrColSpaces') }}
                  <span class="hrd-section__count">({{ form.allSpaces ? spaces.length : form.spaceIds.length }}/{{ spaces.length }})</span>
                </div>
                <button
                  v-if="spaces.length && !form.allSpaces"
                  type="button"
                  class="hrd-toggle-all"
                  @click="toggleAllSpaces"
                >
                  {{ allSpacesChecked ? t('hrSelectNone') : t('hrSelectAll') }}
                </button>
              </div>
              <div class="hrd-pill-grid">
                <!-- TOUS -->
                <div
                  class="hrd-pill hrd-pill--all"
                  :class="{ 'hrd-pill--active': form.allSpaces }"
                  @click="toggleAll"
                >
                  <Check :size="12" class="hrd-pill__check" />
                  {{ t('hrAllSpaces') }}
                </div>
                <div
                  v-for="s in spaces"
                  :key="s.id"
                  class="hrd-pill"
                  :class="{ 'hrd-pill--active': !form.allSpaces && form.spaceIds.includes(s.id), 'hrd-pill--disabled': form.allSpaces }"
                  @click="toggleSpace(s.id)"
                >
                  <Check :size="12" class="hrd-pill__check" />
                  {{ s.name }}
                </div>
              </div>
            </div>
          </div>

          <div class="hrd-footer">
            <button class="hrd-btn hrd-btn--cancel" @click="close">{{ t('hrCancel') }}</button>
            <button class="hrd-btn hrd-btn--save" :disabled="!isValid" @click="submit">
              <Check :size="15" />
              {{ mode === 'edit' ? t('hrSave') : t('hrAdd') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { AlertCircle, Check, Target, UserCog, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import './hrForms.css'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  kind: { type: String, default: 'goal' }, // 'goal' | 'staff'
  mode: { type: String, default: 'create' },
  initial: { type: Object, default: null },
  spaces: { type: Array, default: () => [] },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'submit'])

const error = ref('')
const form = reactive({ value: null, allSpaces: false, spaceIds: [] })

function reset() {
  const s = props.initial
  form.value = s?.value ?? null
  form.allSpaces = !!s?.allSpaces
  form.spaceIds = [...(s?.spaceIds || [])]
  error.value = ''
}
watch(() => props.modelValue, (open) => { if (open) reset() })

const valueLabel = computed(() => (props.kind === 'goal' ? t('hrColGoalPerTpe') : t('hrColStaffPerZone')))
const title = computed(() => {
  if (props.kind === 'goal') return props.mode === 'edit' ? t('hrEditGoal') : t('hrAddGoal')
  return props.mode === 'edit' ? t('hrEditStaffRatio') : t('hrAddStaffRatio')
})

const isValid = computed(() => {
  const v = Number(form.value)
  if (!Number.isFinite(v) || v < 0) return false
  return form.allSpaces || form.spaceIds.length > 0
})

const allSpacesChecked = ref(false)
watch(() => form.spaceIds.length, () => {
  allSpacesChecked.value = props.spaces.length > 0 && form.spaceIds.length === props.spaces.length
})

function toggleAll() {
  form.allSpaces = !form.allSpaces
  if (form.allSpaces) form.spaceIds = []
}
function toggleSpace(id) {
  if (form.allSpaces) return
  const i = form.spaceIds.indexOf(id)
  if (i === -1) form.spaceIds.push(id)
  else form.spaceIds.splice(i, 1)
}
function toggleAllSpaces() {
  form.spaceIds = allSpacesChecked.value ? [] : props.spaces.map((s) => s.id)
}

function close() { emit('update:modelValue', false) }
function submit() {
  if (!isValid.value) {
    error.value = t('hrValueRequired')
    return
  }
  emit('submit', {
    value: Number(form.value),
    allSpaces: form.allSpaces,
    spaceIds: form.allSpaces ? [] : [...form.spaceIds],
  })
}
</script>

<style scoped>
.hrd-pill--all { font-weight: 700; }
.hrd-pill--disabled { opacity: .4; pointer-events: none; }
</style>
