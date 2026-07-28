<template>
  <!-- Drawer d'édition RH par espace (bouton Edit d'une carte). Modifie le Goal/TPE
       et le nombre de staff/Responsable de zone de CET espace (ligne mono-espace,
       cf. modules/11_RH_STAFFING.md §9.4). Champ vidé = pas de valeur dédiée. -->
  <Teleport to="body">
    <Transition name="hrd">
      <div v-if="modelValue" class="hrd-overlay" @mousedown.self="close">
        <div class="hrd-panel" :class="{ 'hrd--dark': isDark }">

          <div class="hrd-header">
            <div class="hrd-header-icon"><Pencil :size="22" color="white" /></div>
            <div class="hrd-header-titles">
              <div class="hrd-header-title">{{ t('hrEditSpaceTitle') }}</div>
              <div class="hrd-header-subtitle">{{ space?.name || '' }}</div>
            </div>
            <button class="hrd-close" :aria-label="t('hrCancel')" @click="close">
              <X :size="18" />
            </button>
          </div>

          <div class="hrd-body">
            <div class="hrd-section">
              <div class="hrd-field">
                <label class="hrd-label" for="hr-edit-goal">{{ t('hrColGoalPerTpe') }}</label>
                <input id="hr-edit-goal" v-model.number="form.goalPerTpe" type="number" min="0" step="10" class="hrd-input" />
              </div>
              <div class="hrd-field">
                <label class="hrd-label" for="hr-edit-staff">{{ t('hrColStaffPerZone') }}</label>
                <input id="hr-edit-staff" v-model.number="form.staffPerZoneManager" type="number" min="0" step="1" class="hrd-input" />
              </div>
              <div class="hrd-hint">{{ t('hrEditSpaceHint') }}</div>
            </div>
          </div>

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
import { reactive, watch } from 'vue'
import { Check, Pencil, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import './hrForms.css'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  space: { type: Object, default: null },
  initial: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'submit'])

const form = reactive({ goalPerTpe: null, staffPerZoneManager: null })

watch(() => props.modelValue, (open) => {
  if (open) {
    form.goalPerTpe = props.initial?.goalPerTpe ?? null
    form.staffPerZoneManager = props.initial?.staffPerZoneManager ?? null
  }
})

function normalize(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function close() { emit('update:modelValue', false) }
function submit() {
  emit('submit', {
    goalPerTpe: normalize(form.goalPerTpe),
    staffPerZoneManager: normalize(form.staffPerZoneManager),
  })
}
</script>

<style scoped>
.hrd-hint { font-size: var(--fs-xs); color: #94a3b8; margin-top: 4px; }
</style>
