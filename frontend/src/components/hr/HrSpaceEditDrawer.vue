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

            <!-- Association Rôles et Ventes (11_RH_STAFFING.md §11.16) — cycle de vie API propre,
                 indépendant du submit() du drawer (même précédent que les Sinking Rules dans
                 HrRoleFormDrawer.vue). -->
            <div class="hsd-section">
              <div class="hsd-section__label">{{ t('hrRatiosTitle') }}</div>
              <div v-if="ratiosError" class="hsd-ratios-error">{{ ratiosError }}</div>
              <div v-if="!ratiosLoading && !ratios.length" class="hsd-ratios-empty">{{ t('hrRatiosEmpty') }}</div>
              <div v-else class="hsd-ratios-list">
                <div v-for="ratio in ratios" :key="ratio.id" class="hsd-ratio-card" @click="openEditRatio(ratio)">
                  <button type="button" class="hsd-ratio-card__delete" :aria-label="t('hrDelete')" @click.stop="removeRatio(ratio)">
                    <X :size="13" />
                  </button>
                  <div class="hsd-ratio-card__line">
                    <span class="hsd-ratio-card__muted">{{ t('hrRatioCardRole') }}</span>
                    <span class="hsd-ratio-card__strong">{{ roleName(ratio.roleId) }}</span>
                    <span class="hsd-ratio-card__muted">
                      {{ ratio.ratioBasis === 'REVENUE' ? t('hrRatioCardDependsOnRevenue') : t('hrRatioCardDependsOnQuantity') }}
                    </span>
                    <span class="hsd-ratio-card__strong">{{ menuItemsSummary(ratio) }}</span>
                  </div>
                  <div class="hsd-ratio-card__line">
                    <span class="hsd-ratio-card__muted">{{ t('hrRatioCardAddLine') }} {{ ratio.unitQty }}</span>
                    <span class="hsd-ratio-card__strong">{{ roleName(ratio.roleId) }}</span>
                    <span class="hsd-ratio-card__muted">{{ t('hrRatioCardEvery') }}</span>
                    <span class="hsd-ratio-card__strong">
                      {{ ratio.ratioBasis === 'REVENUE' ? `${ratio.ratioValue} €` : ratio.ratioValue }}
                    </span>
                  </div>
                </div>
              </div>
              <button type="button" class="hsd-ratios-add" @click="openAddRatio">
                <Plus :size="15" /> {{ t('hrRatiosAdd') }}
              </button>
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

  <HrRoleMenuItemRatioFormDialog
    v-model="ratioDialogOpen"
    :space-id="space?.id"
    :initial="editingRatio"
    :roles="roles"
    :menu-items="menuItems"
    @saved="loadRatios"
  />
</template>

<script setup>
import { reactive, computed, watch, ref } from 'vue'
import { useTheme } from 'vuetify'
import { Check, Pencil, Plus, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import NumberField from '@/components/common/NumberField.vue'
import HrRoleMenuItemRatioFormDialog from '@/components/hr/HrRoleMenuItemRatioFormDialog.vue'
import { getHrRoles, getHrRoleMenuItemRatios, deleteHrRoleMenuItemRatio } from '@/api/endpoints/hr.api'
import { getSpaceMenuItemsWithAvailability } from '@/api/endpoints/menu.api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  space: { type: Object, default: null },
  initial: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'submit'])

const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const form = reactive({ goalPerTpe: null, staffPerZoneManager: null })

const ratios = ref([])
const roles = ref([])
const menuItems = ref([])
const ratiosLoading = ref(false)
const ratiosError = ref('')
const ratioDialogOpen = ref(false)
const editingRatio = ref(null)

function roleName(roleId) {
  return roles.value.find((r) => r.id === roleId)?.name || roleId
}
function menuItemsSummary(ratio) {
  if (ratio.allMenuItems) return t('hrRatioCardAllItems')
  const names = ratio.menuItemIds.map((id) => menuItems.value.find((m) => m.id === id)?.name).filter(Boolean)
  return names.join(', ') || ratio.menuItemIds.join(', ')
}

async function loadRatios() {
  const spaceId = props.space?.id
  if (!spaceId) { ratios.value = []; return }
  ratiosLoading.value = true
  ratiosError.value = ''
  try {
    ratios.value = await getHrRoleMenuItemRatios(spaceId)
  } catch (e) {
    ratiosError.value = e?.response?.data?.message || t('hrRatiosLoadError')
  } finally {
    ratiosLoading.value = false
  }
}

async function removeRatio(ratio) {
  try {
    await deleteHrRoleMenuItemRatio(ratio.id)
    ratios.value = ratios.value.filter((r) => r.id !== ratio.id)
  } catch (e) {
    ratiosError.value = e?.response?.data?.message || t('hrRatiosDeleteError')
  }
}

function openAddRatio() {
  editingRatio.value = null
  ratioDialogOpen.value = true
}
function openEditRatio(ratio) {
  editingRatio.value = ratio
  ratioDialogOpen.value = true
}

watch(() => props.modelValue, async (open) => {
  if (!open) return
  form.goalPerTpe = props.initial?.goalPerTpe ?? null
  form.staffPerZoneManager = props.initial?.staffPerZoneManager ?? null

  const spaceId = props.space?.id
  loadRatios()
  if (spaceId) {
    if (!roles.value.length) {
      try { roles.value = await getHrRoles() } catch (_) { /* best effort */ }
    }
    try {
      const res = await getSpaceMenuItemsWithAvailability(spaceId)
      const payload = res?.data ?? res
      menuItems.value = payload?.items || []
    } catch (_) { menuItems.value = [] }
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
.hsd-input.number-field__input { text-align: center; }
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

.hsd-ratios-error { background: #fef2f2; color: #b91c1c; border-radius: 10px; padding: 8px 12px; font-size: var(--fs-sm); margin-bottom: 10px; }
.hsd-ratios-empty { font-size: var(--fs-sm); color: #111827; line-height: 1.5; padding: 10px 0; }
.hsd-ratios-list { display: flex; flex-direction: column; gap: 10px; }
.hsd-ratio-card {
  position: relative; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px 34px 12px 14px;
  background: #f9fafb; cursor: pointer; display: flex; flex-direction: column; gap: 6px;
}
.hsd-ratio-card:hover { border-color: #ff3131; }
.hsd-ratio-card__line { display: flex; flex-wrap: wrap; gap: 5px; align-items: baseline; font-size: var(--fs-sm); }
.hsd-ratio-card__muted { color: #6b7280; }
.hsd-ratio-card__strong { color: #111827; font-weight: var(--fw-semibold); }
.hsd-ratio-card__delete {
  position: absolute; top: 10px; right: 10px; width: 24px; height: 24px; border: none; border-radius: 7px;
  background: transparent; color: #9ca3af; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.15s, color 0.15s;
}
.hsd-ratio-card__delete:hover { background: #fee2e2; color: #dc2626; }
.hsd-ratios-add {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; padding: 8px 16px;
  border-radius: 100px; border: 1.5px dashed #d1d5db; background: transparent; color: #ff3131;
  font-size: var(--fs-sm); font-weight: var(--fw-semibold); cursor: pointer; transition: all 0.2s;
}
.hsd-ratios-add:hover { background: rgba(255, 49, 49, 0.06); border-color: #ff3131; }

/* Dark */
.hsd--dark .hsd-section__label { color: #64748b; }
.hsd--dark .hsd-field-label { color: #cbd5e1; }
.hsd--dark .hsd-hint { color: #64748b; }
.hsd--dark .hsd-input { background: #1e293b; border-color: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.87); }
.hsd--dark .hsd-input:focus { background: #263548; border-color: #ff3131; }
.hsd--dark .hsd-ratios-empty { color: #f9fafb; }
.hsd--dark .hsd-ratio-card { background: #0f172a; border-color: rgba(255, 255, 255, 0.08); }
.hsd--dark .hsd-ratio-card__muted { color: #94a3b8; }
.hsd--dark .hsd-ratio-card__strong { color: #f9fafb; }
.hsd--dark .hsd-ratios-add { border-color: rgba(255, 255, 255, 0.16); }
</style>
