<template>
  <!-- Drawer d'édition RH par espace (bouton Edit d'une carte). Modifie le Goal/TPE
       et le nombre de staff/Responsable de zone de CET espace (ligne mono-espace,
       cf. modules/11_RH_STAFFING.md §9.4). Champ vidé = pas de valeur dédiée.
       Self-contained (parité drawers/HrSupplierFormDrawer `.hsd-*`). -->
  <Teleport to="body">
    <Transition name="hsd">
      <div v-if="modelValue" class="hsd-overlay" @mousedown.self="close">
        <div class="hsd-panel" :class="{ 'hsd--dark': isDark }">

          <div class="hsd__header">
            <div class="hsd__header-icon"><Pencil :size="22" color="white" /></div>
            <div class="hsd__header-titles">
              <div class="hsd__header-title">{{ t('hrEditSpaceTitle') }}</div>
              <div class="hsd__header-subtitle">{{ space?.name || '' }}</div>
            </div>
            <button class="hsd__close-btn" :aria-label="t('hrCancel')" @click="close">
              <X :size="18" />
            </button>
          </div>

          <div class="hsd__body">
            <div class="hsd-section">
              <div class="hsd-field mb-3">
                <label class="hsd-field-label" for="hr-edit-goal">{{ t('hrColGoalPerTpe') }}</label>
                <!-- empty-value laissé à null (défaut) : champ vidé = pas de valeur dédiée
                     (cf. commentaire d'en-tête + normalize()). -->
                <NumberField id="hr-edit-goal" v-model="form.goalPerTpe" :decimals="2" :step="10" :min="0" pad grouping class="hsd-input" />
              </div>
              <div class="hsd-field">
                <label class="hsd-field-label" for="hr-edit-staff">{{ t('hrColStaffPerZone') }}</label>
                <NumberField id="hr-edit-staff" v-model="form.staffPerZoneManager" :decimals="0" :step="1" :min="0" class="hsd-input" />
              </div>
              <div class="hsd-hint">{{ t('hrEditSpaceHint') }}</div>
            </div>
          </div>

          <div class="hsd__footer">
            <button class="hsd-btn hsd-btn--cancel" @click="close">{{ t('hrCancel') }}</button>
            <button class="hsd-btn hsd-btn--save" @click="submit">
              <Check :size="15" class="me-1" />
              {{ t('hrSave') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { reactive, computed, watch } from 'vue'
import { useTheme } from 'vuetify'
import { Check, Pencil, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import NumberField from '@/components/common/NumberField.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  space: { type: Object, default: null },
  initial: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'submit'])

const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

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
.hsd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.38);
  display: flex;
  justify-content: flex-end;
}
.hsd-panel {
  width: 480px;
  max-width: 100%;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.14);
  overflow: hidden;
}
.hsd-panel.hsd--dark { background: #0f172a; }

.hsd-enter-active, .hsd-leave-active { transition: opacity 0.25s ease; }
.hsd-enter-active .hsd-panel,
.hsd-leave-active .hsd-panel { transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.hsd-enter-from { opacity: 0; }
.hsd-enter-from .hsd-panel { transform: translateX(100%); }
.hsd-leave-to { opacity: 0; }
.hsd-leave-to .hsd-panel { transform: translateX(100%); }

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
.hsd__close-btn:hover { background: rgba(255, 255, 255, 0.3); }

.hsd__body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 22px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.hsd-section__label {
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: 0.9px;
  color: #9ca3af;
  margin-bottom: 12px;
}
.hsd-field { display: flex; flex-direction: column; gap: 6px; }
.hsd-field-label { font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: #374151; }
.hsd-hint { font-size: var(--fs-xs); color: #9ca3af; margin-top: 4px; }
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
.hsd-btn--cancel { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.hsd-btn--cancel:hover { border-color: #9ca3af; background: #f3f4f6; color: #374151; }
.hsd-btn--save { background: #ff3131; color: #fff; box-shadow: 0 4px 14px rgba(255, 49, 49, 0.3); }
.hsd-btn--save:hover { box-shadow: 0 6px 20px rgba(255, 49, 49, 0.4); transform: translateY(-1px); }

/* Dark */
.hsd--dark .hsd-section__label { color: #64748b; }
.hsd--dark .hsd-field-label { color: #cbd5e1; }
.hsd--dark .hsd-hint { color: #64748b; }
.hsd--dark .hsd-input { background: #1e293b; border-color: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.87); }
.hsd--dark .hsd-input:focus { background: #263548; border-color: #ff3131; }
</style>
