<template>
  <!-- Drawer « Ajouter un Goal » / « Ajouter un Nombre de staff par Zone Manager »
       (maquettes Bertrand). Un champ valeur + sélection d'espaces + « TOUS ».
       Self-contained (parité drawers/HrSupplierFormDrawer `.hsd-*`), pas de CSS partagé. -->
  <Teleport to="body">
    <Transition name="hsd">
      <div v-if="modelValue" class="hsd-overlay" @mousedown.self="close">
        <div class="hsd-panel" :class="{ 'hsd--dark': isDark }">

          <!-- Header -->
          <div class="hsd__header">
            <div class="hsd__header-icon">
              <Target v-if="kind === 'goal'" :size="22" color="white" />
              <UserCog v-else :size="22" color="white" />
            </div>
            <div class="hsd__header-titles">
              <div class="hsd__header-title">{{ title }}</div>
              <div class="hsd__header-subtitle">{{ t('hrSettingsSubtitle') }}</div>
            </div>
            <button class="hsd__close-btn" :aria-label="t('hrCancel')" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Error -->
          <div v-if="error" class="hsd__error">
            <AlertCircle :size="14" style="flex-shrink:0" class="me-2" />
            {{ error }}
          </div>

          <!-- Body -->
          <div class="hsd__body">
            <!-- Valeur -->
            <div class="hsd-section">
              <div class="hsd-field">
                <label class="hsd-field-label" for="hr-value">{{ valueLabel }} <span class="hsd-required">*</span></label>
                <NumberField
                  id="hr-value"
                  v-model="form.value"
                  :decimals="2"
                  :step="kind === 'goal' ? 10 : 1"
                  :min="0"
                  :empty-value="0"
                  class="hsd-input"
                />
              </div>
            </div>

            <!-- Espaces + TOUS — un espace déjà couvert par une AUTRE ligne spécifique n'est
                 plus proposé (2026-08-01, retour utilisateur : plutôt que de laisser choisir puis
                 rejeter à l'enregistrement, "on retire de la liste des possibilités" ceux qui ont
                 déjà une valeur). Un override délibéré sur "Tous" reste possible (cf. question
                 #41) : seul le chevauchement entre deux lignes spécifiques est exclu ici. -->
            <div class="hsd-section">
              <div v-if="!selectableSpaces.length && existingAllSpaces" class="hsd-notice">
                <AlertCircle :size="18" class="me-2" style="flex-shrink:0" />
                {{ t('hrValueAllCovered') }}
              </div>
              <template v-else>
                <div class="hsd-section__header">
                  <div class="hsd-section__label mb-0">
                    {{ t('hrColSpaces') }}
                    <span class="hsd-site-count">({{ form.allSpaces ? selectableSpaces.length : form.spaceIds.length }}/{{ selectableSpaces.length }})</span>
                  </div>
                  <button
                    v-if="selectableSpaces.length && !form.allSpaces"
                    type="button"
                    class="hsd-toggle-all"
                    @click="toggleAllSpaces"
                  >
                    {{ isAllSpacesChecked ? t('hrSelectNone') : t('hrSelectAll') }}
                  </button>
                </div>
                <div class="hsd-pill-grid">
                  <div
                    v-if="!existingAllSpaces"
                    class="hsd-pill hsd-pill--all"
                    :class="{ 'hsd-pill--active': form.allSpaces }"
                    @click="toggleAll"
                  >
                    <Check :size="12" class="hsd-pill__check" />
                    {{ t('hrAllSpaces') }}
                  </div>
                  <div
                    v-for="s in selectableSpaces"
                    :key="s.id"
                    class="hsd-pill"
                    :class="{ 'hsd-pill--active': !form.allSpaces && form.spaceIds.includes(s.id), 'hsd-pill--disabled': form.allSpaces }"
                    @click="toggleSpace(s.id)"
                  >
                    <Check :size="12" class="hsd-pill__check" />
                    {{ s.name }}
                  </div>
                </div>
                <p v-if="existingAllSpaces" class="hsd-hint">{{ t('hrValueOverrideHint') }}</p>
              </template>
            </div>
          </div>

          <!-- Footer -->
          <div class="hsd__footer">
            <button class="hsd-btn hsd-btn--cancel" @click="close">{{ t('hrCancel') }}</button>
            <button class="hsd-btn hsd-btn--save" :disabled="!isValid" @click="submit">
              <Check :size="15" class="me-1" />
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
import { useTheme } from 'vuetify'
import { AlertCircle, Check, Target, UserCog, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import NumberField from '@/components/common/NumberField.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  kind: { type: String, default: 'goal' }, // 'goal' | 'staff'
  mode: { type: String, default: 'create' },
  initial: { type: Object, default: null },
  spaces: { type: Array, default: () => [] },
  // Lignes existantes (goals ou staffRatios selon `kind`) — sert à retirer de la liste les
  // espaces déjà couverts par une AUTRE ligne spécifique (2026-08-01). Ce tiroir n'est utilisé
  // qu'en création (mode toujours 'create' en pratique, cf. HrSettingsView.vue) : pas de logique
  // d'exclusion-de-soi-même nécessaire ici, contrairement au backend (assertNoGoalOverlap).
  lines: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'submit'])

const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

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

// Un espace couvert par une AUTRE ligne spécifique n'est plus proposé — chevauchement rejeté de
// toute façon côté backend (assertNoGoalOverlap/assertNoRatioOverlap), autant ne pas le proposer.
const coveredSpaceIds = computed(() => {
  const ids = new Set()
  for (const l of props.lines) {
    if (!l.allSpaces) for (const id of l.spaceIds || []) ids.add(id)
  }
  return ids
})
const selectableSpaces = computed(() => props.spaces.filter((s) => !coveredSpaceIds.value.has(s.id)))
// Une ligne "Tous" existe déjà pour ce paramètre → en créer une deuxième est rejeté par le
// backend, donc l'option n'est plus proposée ici (l'override par ligne spécifique reste possible).
const existingAllSpaces = computed(() => props.lines.some((l) => l.allSpaces))

const isAllSpacesChecked = computed(() => selectableSpaces.value.length > 0 && form.spaceIds.length === selectableSpaces.value.length)

function toggleAll() {
  if (existingAllSpaces.value) return
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
  form.spaceIds = isAllSpacesChecked.value ? [] : selectableSpaces.value.map((s) => s.id)
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
/* Drawer coulissant self-contained (parité drawers/HrSupplierFormDrawer `.hsd-*`). */
.hsd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.38);
  display: flex;
  justify-content: flex-end;
}
.hsd-panel {
  width: 520px;
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

.hsd__body {
  flex: 1 1 0;
  min-height: 0;
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
.hsd-notice {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  font-size: var(--fs-base);
  color: #b45309;
}
.hsd-hint { font-size: var(--fs-xs); color: #9ca3af; margin: 10px 0 0; }
.hsd--dark .hsd-notice { background: rgba(180, 83, 9, 0.14); border-color: rgba(251, 146, 60, 0.35); color: #fdba74; }

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
.hsd-pill--all { font-weight: var(--fw-bold); }
.hsd-pill--disabled { opacity: 0.4; pointer-events: none; }
.hsd-pill__check { opacity: 0; transition: opacity 0.15s; }
.hsd-pill--active .hsd-pill__check { opacity: 1; }

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

/* Dark */
.hsd--dark .hsd-section__label { color: #64748b; }
.hsd--dark .hsd-field-label { color: #cbd5e1; }
.hsd--dark .hsd-input { background: #1e293b; border-color: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.87); }
.hsd--dark .hsd-input:focus { background: #263548; border-color: #ff3131; }
.hsd--dark .hsd-pill { background: #1e293b; border-color: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.55); }
.hsd--dark .hsd-pill:hover { border-color: #ff3131; color: #e84444; background: rgba(255, 49, 49, 0.1); }
.hsd--dark .hsd-pill--active { background: rgba(255, 49, 49, 0.15); border-color: #ff3131; color: #e84444; }
</style>
