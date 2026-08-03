<template>
  <!-- Modale "Ajouter/Modifier une association" (11_RH_STAFFING.md §11.16) — même charte que
       ResolveWeezeventLinkDialog.vue (header rouge, pilules) et même idiome de sauvegarde que
       HrRoleFormDrawer's Sinking Rules (le composant gère lui-même son appel API). -->
  <Teleport to="body">
    <div v-if="modelValue" class="hrmd-overlay" @mousedown.self="close">
      <div class="hrmd-panel" :class="{ 'hrmd--dark': isDark }">
        <div class="hrmd__header">
          <div class="hrmd__icon"><LinkIcon :size="20" color="white" /></div>
          <div class="hrmd__title">{{ initial ? t('hrRatioDialogTitleEdit') : t('hrRatioDialogTitleAdd') }}</div>
          <button type="button" class="hrmd__close" :aria-label="t('hrCancel')" @click="close">
            <X :size="18" />
          </button>
        </div>

        <div class="hrmd__body">
          <div v-if="error" class="hrmd-error">{{ error }}</div>

          <div class="hrmd-field mb-3">
            <label class="hrmd-field-label">{{ t('hrRatioDialogRole') }}</label>
            <select v-model="form.roleId" class="hrmd-input hrmd-select">
              <option value="" disabled>{{ t('hrRatioDialogSelectRole') }}</option>
              <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </div>

          <div class="hrmd-field mb-3">
            <label class="hrmd-field-label">{{ t('hrRatioDialogBasis') }}</label>
            <div class="hrmd-radio-row">
              <label class="hrmd-radio">
                <input v-model="form.ratioBasis" type="radio" value="REVENUE" />
                <span>{{ t('hrRatioDialogBasisRevenue') }}</span>
              </label>
              <label class="hrmd-radio">
                <input v-model="form.ratioBasis" type="radio" value="QUANTITY" />
                <span>{{ t('hrRatioDialogBasisQuantity') }}</span>
              </label>
            </div>
          </div>

          <div class="hrmd-field mb-3">
            <label class="hrmd-field-label">{{ t('hrRatioDialogMenuItems') }}</label>
            <HrMenuItemMultiSelect
              v-model="form.menuItemIds"
              v-model:allSelected="form.allMenuItems"
              :items="menuItems"
            />
          </div>

          <div class="hrmd-field-row">
            <div class="hrmd-field">
              <label class="hrmd-field-label">{{ t('hrRatioDialogUnitQty') }}</label>
              <NumberField v-model="form.unitQty" :decimals="0" :step="1" :min="1" :empty-value="1" class="hrmd-input" />
            </div>
            <div class="hrmd-field">
              <label class="hrmd-field-label">
                {{ form.ratioBasis === 'REVENUE' ? t('hrRatioDialogRatioValueRevenue') : t('hrRatioDialogRatioValueQuantity') }}
              </label>
              <NumberField v-model="form.ratioValue" :decimals="2" :min="0.01" class="hrmd-input" />
            </div>
          </div>
        </div>

        <div class="hrmd__footer">
          <button type="button" class="hrmd-btn hrmd-btn--cancel" @click="close">{{ t('hrCancel') }}</button>
          <button type="button" class="hrmd-btn hrmd-btn--save" :disabled="saving" @click="submit">
            {{ t('hrSave') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, computed, watch, ref } from 'vue'
import { useTheme } from 'vuetify'
import { X, Link as LinkIcon } from 'lucide-vue-next'
import { t } from '@/i18n'
import NumberField from '@/components/common/NumberField.vue'
import HrMenuItemMultiSelect from '@/components/hr/HrMenuItemMultiSelect.vue'
import { createHrRoleMenuItemRatio, updateHrRoleMenuItemRatio } from '@/api/endpoints/hr.api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  spaceId: { type: String, required: true },
  initial: { type: Object, default: null },
  roles: { type: Array, default: () => [] },
  menuItems: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const saving = ref(false)
const error = ref('')

function emptyForm() {
  return { roleId: '', ratioBasis: 'QUANTITY', unitQty: 1, ratioValue: null, allMenuItems: false, menuItemIds: [] }
}
const form = reactive(emptyForm())

watch(() => props.modelValue, (open) => {
  if (!open) return
  error.value = ''
  Object.assign(form, props.initial
    ? {
        roleId: props.initial.roleId,
        ratioBasis: props.initial.ratioBasis,
        unitQty: props.initial.unitQty,
        ratioValue: props.initial.ratioValue,
        allMenuItems: props.initial.allMenuItems,
        menuItemIds: [...(props.initial.menuItemIds || [])],
      }
    : emptyForm())
})

function close() { emit('update:modelValue', false) }

async function submit() {
  error.value = ''
  if (!form.roleId) { error.value = t('hrRatioDialogRoleRequired'); return }
  if (!form.allMenuItems && !form.menuItemIds.length) { error.value = t('hrRatioDialogMenuItemsRequired'); return }
  const ratioValue = Number(form.ratioValue)
  if (!Number.isFinite(ratioValue) || ratioValue <= 0) { error.value = t('hrRatioDialogRatioValueRequired'); return }

  const payload = {
    spaceId: props.spaceId,
    roleId: form.roleId,
    ratioBasis: form.ratioBasis,
    ratioValue,
    unitQty: Number(form.unitQty) || 1,
    allMenuItems: form.allMenuItems,
    menuItemIds: form.allMenuItems ? [] : form.menuItemIds,
  }

  saving.value = true
  try {
    const saved = props.initial
      ? await updateHrRoleMenuItemRatio(props.initial.id, payload)
      : await createHrRoleMenuItemRatio(payload)
    emit('saved', saved)
    close()
  } catch (e) {
    error.value = e?.response?.data?.message || t('hrRatioDialogSaveError')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.hrmd-overlay {
  position: fixed; inset: 0; z-index: 10000; background: rgba(0, 0, 0, 0.38);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.hrmd-panel {
  width: 480px; max-width: 100%; max-height: 90vh; background: #fff; border-radius: 16px;
  overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
}
.hrmd-panel.hrmd--dark { background: #1e293b; }

.hrmd__header { display: flex; align-items: center; gap: 12px; padding: 16px 18px; background: #ff3131; flex-shrink: 0; }
.hrmd__icon { width: 38px; height: 38px; border-radius: 11px; background: rgba(255, 255, 255, 0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.hrmd__title { flex: 1; min-width: 0; color: #fff; font-size: var(--fs-md); font-weight: var(--fw-bold); }
.hrmd__close { width: 30px; height: 30px; border: none; border-radius: 8px; background: rgba(255, 255, 255, 0.18); color: rgba(255, 255, 255, 0.9); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.18s; flex-shrink: 0; }
.hrmd__close:hover { background: rgba(255, 255, 255, 0.3); }

.hrmd__body { padding: 18px; overflow-y: auto; flex: 1; min-height: 0; }
.hrmd-error { background: #fef2f2; color: #b91c1c; border-radius: 10px; padding: 8px 12px; font-size: var(--fs-sm); margin-bottom: 14px; }
.hrmd--dark .hrmd-error { background: rgba(239, 68, 68, 0.12); color: #fca5a5; }

.hrmd-field { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.hrmd-field-row { display: flex; gap: 12px; }
.hrmd-field-label { font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: #374151; }
.hrmd--dark .hrmd-field-label { color: #cbd5e1; }

.hrmd-input {
  width: 100%; border-radius: 11px; border: 1.5px solid #e5e7eb; font-size: var(--fs-base);
  color: #111827; padding: 0.6rem 0.75rem; line-height: 1.4; background: #fafafa; outline: none;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s; font-family: inherit;
}
.hrmd-input:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1); background: #fff; }
.hrmd--dark .hrmd-input { background: #0f172a; border-color: rgba(255, 255, 255, 0.14); color: rgba(255, 255, 255, 0.87); }
.hrmd--dark .hrmd-input:focus { background: #172033; }
.hrmd-select { appearance: none; }

.hrmd-radio-row { display: flex; gap: 16px; }
.hrmd-radio { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: #374151; cursor: pointer; }
.hrmd--dark .hrmd-radio { color: #cbd5e1; }

.hrmd__footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 18px; border-top: 1px solid #f0f0f0; background: #fafafa; flex-shrink: 0; }
.hrmd--dark .hrmd__footer { background: #111827; border-top-color: rgba(255, 255, 255, 0.08); }
.hrmd-btn { display: inline-flex; align-items: center; padding: 8px 20px; border-radius: 100px; font-size: var(--fs-base); font-weight: var(--fw-semibold); cursor: pointer; border: none; transition: all 0.2s; }
.hrmd-btn--cancel { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.hrmd--dark .hrmd-btn--cancel { border-color: rgba(255, 255, 255, 0.14); color: #cbd5e1; }
.hrmd-btn--cancel:hover { background: #f3f4f6; color: #374151; }
.hrmd--dark .hrmd-btn--cancel:hover { background: #374151; color: #fff; }
.hrmd-btn--save { background: #ff3131; color: #fff; }
.hrmd-btn--save:hover:not(:disabled) { box-shadow: 0 4px 14px rgba(255, 49, 49, 0.35); transform: translateY(-1px); }
.hrmd-btn--save:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
