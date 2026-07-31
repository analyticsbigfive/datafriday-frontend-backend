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
              <div class="hpd__header-title">{{ mode === 'edit' ? t('hrRoleEditTitle') : t('hrRoleAddTitle') }}</div>
              <div class="hpd__header-subtitle">{{ mode === 'edit' ? t('hrRoleFormEditSubtitle') : t('hrRoleFormAddSubtitle') }}</div>
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

          <!-- ── Body — logique conditionnelle EXACTE spec §2.1 ── -->
          <div class="hpd__body">
            <!-- 1. Department + 2. Nom du rôle -->
            <div class="hpd-section">
              <div class="hpd-section__label">{{ t('hrDepartment') }}</div>
              <div class="hpd-field mb-3">
                <label class="hpd-field-label" for="hrd-dept">{{ t('hrDepartment') }} <span class="hpd-required">*</span></label>
                <select id="hrd-dept" v-model="form.department" class="hpd-input hpd-select">
                  <option v-for="d in DEPARTMENTS" :key="d.value" :value="d.value">{{ d.label }}</option>
                </select>
              </div>
              <div class="hpd-field">
                <label class="hpd-field-label" for="hrd-name">{{ t('hrRoleName') }} <span class="hpd-required">*</span></label>
                <input
                  id="hrd-name" v-model="form.name" type="text" class="hpd-input"
                  list="hrd-known-names" autocomplete="off" @input="autoAlgoKey"
                />
                <datalist id="hrd-known-names">
                  <option v-for="name in knownNames" :key="name" :value="name" />
                </datalist>
              </div>
            </div>

            <!-- 3-5. Contrat (SI Department = F&B) -->
            <div v-if="isFnb" class="hpd-section">
              <div class="hpd-section__label">{{ t('hrContractType') }}</div>
              <div class="hpd-field mb-3">
                <label class="hpd-field-label" for="hrd-contract">{{ t('hrContractType') }} <span class="hpd-required">*</span></label>
                <select id="hrd-contract" v-model="form.contractType" class="hpd-input hpd-select">
                  <option value="" disabled>—</option>
                  <option value="CDD">CDD</option>
                  <option value="FREELANCE">Freelance</option>
                  <option value="CDI">CDI</option>
                  <option value="AGENCY">Agency</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <!-- 4. SI Agency → Supplier multi-select -->
              <div v-if="form.contractType === 'AGENCY'" class="hpd-field mb-3">
                <label class="hpd-field-label">{{ t('hrColSupplier') }} <span class="hpd-required">*</span></label>
                <div v-if="!suppliers.length" class="hpd-notice">
                  <Building2 :size="18" class="me-2" style="flex-shrink:0" />
                  {{ t('hrNoSupplierYet') }}
                </div>
                <div v-else class="hrd-pill-grid">
                  <button
                    v-for="s in suppliers" :key="s.id" type="button"
                    class="hrd-pill" :class="{ 'hrd-pill--active': form.supplierIds.includes(s.id) }"
                    @click="toggleSupplier(s.id)"
                  >
                    <Check :size="12" class="hrd-pill__check" />
                    {{ s.name }}
                  </button>
                </div>
              </div>

              <!-- 5. SI CDD / Agency / Freelance → Rate type + montant -->
              <template v-if="needsRate">
                <div class="hpd-field mb-3">
                  <label class="hpd-field-label" for="hrd-rate-type">{{ t('hrRateType') }} <span class="hpd-required">*</span></label>
                  <select id="hrd-rate-type" v-model="form.rateType" class="hpd-input hpd-select">
                    <option value="HOURLY">{{ t('hrRateHourly') }}</option>
                    <option value="DAILY">{{ t('hrRateDaily') }}</option>
                    <option value="MONTHLY">{{ t('hrRateMonthly') }}</option>
                  </select>
                </div>
                <div class="hpd-field">
                  <label class="hpd-field-label" for="hrd-rate">{{ rateLabel }} <span class="hpd-required">*</span></label>
                  <div class="hpd-rate">
                    <input id="hrd-rate" v-model.number="form.rate" type="number" min="0" step="0.5" class="hpd-input hpd-rate__input" />
                    <span class="hpd-rate__suffix">{{ rateSuffix }}</span>
                  </div>
                </div>
              </template>
            </div>

            <!-- 6. F&B Category (subtype) + NON LIÉ -->
            <div class="hpd-section">
              <div class="hpd-section__label">{{ t('hrFnbCategory') }}</div>
              <div class="hrd-pill-grid">
                <button
                  v-for="c in FNB_CATEGORIES" :key="c.value" type="button"
                  class="hrd-pill"
                  :class="{ 'hrd-pill--active': !notLinked && form.fnbCategories.includes(c.value), 'hrd-pill--off': notLinked }"
                  :disabled="notLinked"
                  @click="toggleFnb(c.value)"
                >
                  <Check :size="12" class="hrd-pill__check" />
                  {{ c.label }}
                </button>
                <button
                  type="button" class="hrd-pill" :class="{ 'hrd-pill--active': notLinked }"
                  @click="toggleNotLinked"
                >
                  <Check :size="12" class="hrd-pill__check" />
                  {{ t('hrFnbNotLinked') }}
                </button>
              </div>
            </div>

            <!-- STF-2 : dotation conditionnelle « Sinking » (rôle × sous-type FNB) -->
            <details v-if="showSinkingRules" class="hrd-advanced">
              <summary>{{ t('hrSinkingRulesTitle') }}</summary>
              <div class="hrd-advanced__inner hrd-sinking">
                <div v-if="sinkingError" class="hpd-error-inline">{{ sinkingError }}</div>
                <div v-for="(rule, idx) in ruleDrafts" :key="rule.id ?? `new-${idx}`" class="hrd-sinking__row">
                  <select v-model="rule.fnbCategory" class="hpd-input hpd-select" @change="saveRuleDraft(rule)">
                    <option v-for="c in form.fnbCategories" :key="c" :value="c">{{ fnbLabel(c) }}</option>
                  </select>
                  <select v-model="rule.conditionAttribute" class="hpd-input hpd-select" @change="saveRuleDraft(rule)">
                    <option value="">{{ t('hrSinkingRuleConditionNone') }}</option>
                    <option v-for="a in CONDITION_ATTRIBUTES" :key="a" :value="a">{{ a }}</option>
                  </select>
                  <input
                    v-if="rule.conditionAttribute" v-model.number="rule.conditionMinValue" type="number" min="0"
                    class="hpd-input hrd-sinking__num" :placeholder="t('hrSinkingRuleMinValue')"
                    @change="saveRuleDraft(rule)"
                  />
                  <input
                    v-model.number="rule.mandatoryQty" type="number" min="1" class="hpd-input hrd-sinking__num"
                    :placeholder="t('hrSinkingRuleQty')" @change="saveRuleDraft(rule)"
                  />
                  <button
                    type="button" class="hrd-sinking__remove" :disabled="rule.saving"
                    :aria-label="t('hrSinkingRuleRemove')" @click="removeRuleDraft(rule, idx)"
                  >
                    <X :size="14" />
                  </button>
                </div>
                <button type="button" class="hrd-pill" @click="addRuleDraft">
                  <Check :size="12" class="hrd-pill__check" />
                  {{ t('hrSinkingRuleAdd') }}
                </button>
              </div>
            </details>

            <!-- 7. Avancé — algoKey (repliable) -->
            <details class="hrd-advanced">
              <summary>{{ t('hrAdvancedAlgo') }}</summary>
              <div class="hrd-advanced__inner">
                <div class="hpd-field">
                  <label class="hpd-field-label" for="hrd-algo">algoKey</label>
                  <select id="hrd-algo" v-model="form.algoKey" class="hpd-input hpd-select">
                    <option value="">—</option>
                    <option v-for="k in ALGO_KEYS" :key="k" :value="k">{{ k }}</option>
                  </select>
                  <span class="hrd-hint">{{ algoHint }}</span>
                </div>
              </div>
            </details>
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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useTheme } from 'vuetify'
import { AlertCircle, Briefcase, Building2, Check, Pencil, Save, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import * as hrApi from '@/utils/hrApi'
import {
  getHrSinkingRules,
  createHrSinkingRule,
  updateHrSinkingRule,
  deleteHrSinkingRule,
} from '@/api/endpoints/hr.api'
import { newId } from '../hrShared'

// Clés d'attributs SpaceElement.attributes déjà consommées par l'algo de staffing
// (staffing.service.ts) — mêmes noms, pour que la condition d'une règle Sinking
// pointe vers un attribut réellement lu par le calcul.
const CONDITION_ATTRIBUTES = ['nbFriteuses', 'nbTireuses', 'nbBurgersPrevus', 'nbDinettes', 'nbHotdogsPrevus']

// Vocabulaires — miroir du backend (features/hr/hr.service.ts)
const RATE_REQUIRED_CONTRACTS = ['CDD', 'AGENCY', 'FREELANCE']
// Parité 1:1 avec les 9 sous-types F&B du Builder (elementTaxonomy.js, tool `shop`).
// Élargi de 4 à 9 le 2026-07-30 (retour utilisateur : "Beer" ne doit plus fusionner
// silencieusement dans "Beverage").
const FNB_CATEGORIES = [
  { value: 'FOOD', label: 'Food' },
  { value: 'BEVERAGE', label: 'Beverage' },
  { value: 'BEER', label: 'Beer' },
  { value: 'GP_PREMIUM', label: 'GP Premium' },
  { value: 'TEMPORARY', label: 'Temporary' },
  { value: 'DRINKEE', label: 'Drinkee' },
  { value: 'MIXOLOGY', label: 'Mixology' },
  { value: 'FRONT_FOOD', label: 'Front Food' },
  { value: 'KITCHEN_FOOD', label: 'Kitchen Food' },
]
const ALGO_KEYS = [
  'RESPONSABLE_ZONE', 'RESPONSABLE_PDV', 'CAISSIER', 'RUNNER',
  'BARMAN', 'CHEF_DE_PARTIE', 'COMMIS', 'EPR',
]
// Pré-remplissage automatique de l'algoKey quand le nom matche (spec §2.1.7)
const ALGO_NAME_PATTERNS = [
  [/responsable.*zone|resp.*zone/i, 'RESPONSABLE_ZONE'],
  [/responsable.*pdv|resp.*pdv/i, 'RESPONSABLE_PDV'],
  [/caissier|cashier/i, 'CAISSIER'],
  [/runner/i, 'RUNNER'],
  [/barman|bartender/i, 'BARMAN'],
  [/chef de partie/i, 'CHEF_DE_PARTIE'],
  [/commis/i, 'COMMIS'],
  [/\bepr\b|plonge/i, 'EPR'],
]

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  initial: { type: Object, default: null },
  suppliers: { type: Array, default: () => [] },
  positionNames: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

// CFG-2 Étape 4 : DEPARTMENTS (liste figée) retiré — référentiel global Department (store
// `departments`), filtré `needsRh` (un rôle RH n'a de sens que pour un département staffé).
// `form.department` stocke `code ?? id` (valeur stable), plus le libellé.
const store = useStore()
onMounted(() => store.dispatch('departments/fetchDepartments'))
const DEPARTMENTS = computed(() =>
  (store.getters['departments/departments'] || [])
    .filter((d) => d.needsRh)
    .map((d) => ({ value: d.code ?? d.id, label: d.name })),
)

const loading = ref(false)
const error = ref('')
const notLinked = ref(false)
const ruleDrafts = ref([])
const sinkingError = ref('')
const form = reactive({
  id: '',
  department: 'shop',
  name: '',
  contractType: '',
  rateType: 'HOURLY',
  rate: null,
  fnbCategories: [],
  algoKey: '',
  supplierIds: [],
})

const knownNames = computed(() => {
  const names = props.positionNames.map((p) => (typeof p === 'string' ? p : p?.name)).filter(Boolean)
  return [...new Set(names)]
})

// 'shop' = code STABLE du département F&B (Department.code), jamais affecté par un renommage
// de Department.name — même raison que côté backend (hr.service.ts::normalizeRole).
const isFnb = computed(() => form.department === 'shop')
const needsRate = computed(() => isFnb.value && RATE_REQUIRED_CONTRACTS.includes(form.contractType))
const rateLabel = computed(() => {
  if (form.rateType === 'DAILY') return t('hrRateLabelDaily')
  if (form.rateType === 'MONTHLY') return t('hrRateLabelMonthly')
  return t('hrRateLabelHourly')
})
const rateSuffix = computed(() => {
  if (form.rateType === 'DAILY') return '€ / d'
  if (form.rateType === 'MONTHLY') return '€ / m'
  return '€ / h'
})
const algoHint = computed(() =>
  form.algoKey ? t('hrAlgoKeyHintMapped') : t('hrAlgoKeyHintNone')
)
// Sinking rules : rôle déjà persisté (édition) + au moins un tag F&B sélectionné.
const showSinkingRules = computed(() =>
  props.mode === 'edit' && !!props.initial?.id && !notLinked.value && form.fnbCategories.length > 0
)
function fnbLabel(value) {
  return FNB_CATEGORIES.find((c) => c.value === value)?.label || value
}

// Validation MIROIR du DTO backend (normalizeRole)
const canSave = computed(() => {
  if (!form.name.trim()) return false
  if (isFnb.value && !form.contractType) return false
  if (needsRate.value && (form.rate === null || form.rate === '' || Number(form.rate) < 0)) return false
  if (isFnb.value && form.contractType === 'AGENCY' && form.supplierIds.length === 0) return false
  return true
})

function toggleSupplier(id) {
  const i = form.supplierIds.indexOf(id)
  if (i >= 0) form.supplierIds.splice(i, 1)
  else form.supplierIds.push(id)
}
function toggleFnb(value) {
  if (notLinked.value) return
  const i = form.fnbCategories.indexOf(value)
  if (i >= 0) form.fnbCategories.splice(i, 1)
  else form.fnbCategories.push(value)
}
function toggleNotLinked() {
  notLinked.value = !notLinked.value
  if (notLinked.value) form.fnbCategories = [] // désactivé/vidé si NON LIÉ
}
function autoAlgoKey() {
  for (const [pattern, key] of ALGO_NAME_PATTERNS) {
    if (pattern.test(form.name)) { form.algoKey = key; return }
  }
}

function reset() {
  const p = props.initial
  form.id = p?.id || newId()
  // p?.sector (forme legacy) est déjà résolu en code par hrApi.js::toDepartment() en amont —
  // simple repli, pas de revalidation ici (le backend est la garde d'existence de toute façon).
  form.department = p?.department || p?.sector || 'shop'
  form.name = p?.name || p?.positionName || ''
  form.contractType = p?.contractType || ''
  form.rateType = p?.rateType || 'HOURLY'
  form.rate = p?.rate ?? p?.ratePerHour ?? null
  form.fnbCategories = [...(p?.fnbCategories || [])]
  form.algoKey = p?.algoKey || ''
  form.supplierIds = [...(p?.supplierIds || (p?.supplierId ? [p.supplierId] : []))]
  notLinked.value = !form.fnbCategories.length && !!p?.id
  error.value = ''
  loading.value = false
  if (!form.algoKey && form.name) autoAlgoKey()
}

async function loadSinkingRules() {
  sinkingError.value = ''
  if (props.mode !== 'edit' || !props.initial?.id) { ruleDrafts.value = []; return }
  try {
    const rows = await getHrSinkingRules({ roleId: props.initial.id })
    ruleDrafts.value = rows.map((r) => ({ ...r, saving: false }))
  } catch (_) {
    ruleDrafts.value = []
  }
}
function addRuleDraft() {
  ruleDrafts.value.push({
    id: null,
    fnbCategory: form.fnbCategories[0] || '',
    conditionAttribute: '',
    conditionMinValue: null,
    mandatoryQty: 1,
    saving: false,
  })
}
async function saveRuleDraft(draft) {
  if (!draft.fnbCategory) return
  draft.saving = true
  sinkingError.value = ''
  try {
    const payload = {
      roleId: props.initial.id,
      fnbCategory: draft.fnbCategory,
      conditionAttribute: draft.conditionAttribute || null,
      conditionMinValue: draft.conditionAttribute ? Number(draft.conditionMinValue) || 0 : null,
      mandatoryQty: Number(draft.mandatoryQty) || 1,
    }
    const saved = draft.id
      ? await updateHrSinkingRule(draft.id, payload)
      : await createHrSinkingRule(payload)
    Object.assign(draft, saved)
  } catch (e) {
    sinkingError.value = e?.response?.data?.message || t('hrSinkingRuleSaveError')
  } finally {
    draft.saving = false
  }
}
async function removeRuleDraft(draft, idx) {
  if (draft.id) {
    try { await deleteHrSinkingRule(draft.id) } catch (_) { /* best effort */ }
  }
  ruleDrafts.value.splice(idx, 1)
}

watch(() => props.modelValue, (open) => { if (open) { reset(); loadSinkingRules() } })

function close() {
  emit('update:modelValue', false)
}

async function submit() {
  if (!canSave.value) { error.value = t('hrSaveError'); return }
  loading.value = true
  error.value = ''
  try {
    // Champs masqués remis à null à la sauvegarde (spec §2.1) — le backend
    // (normalizeRole) refait la même normalisation par défense en profondeur.
    const payload = {
      id: form.id,
      department: form.department,
      name: form.name.trim(),
      contractType: isFnb.value ? form.contractType : null,
      rateType: needsRate.value ? form.rateType : null,
      rate: needsRate.value ? Number(form.rate) : null,
      fnbCategories: notLinked.value ? [] : [...form.fnbCategories],
      algoKey: form.algoKey || null,
      supplierIds: form.contractType === 'AGENCY' ? [...form.supplierIds] : [],
    }
    if (props.mode === 'edit') await hrApi.updateStaffPosition(payload)
    else await hrApi.createStaffPosition(payload)

    const name = payload.name
    if (!knownNames.value.some((n) => n.toLowerCase() === name.toLowerCase())) {
      try { await hrApi.createPositionName({ id: newId(), name }) } catch (_) { /* best effort */ }
    }

    emit('saved')
    close()
  } catch (e) {
    error.value = e?.response?.data?.message || t('hrSaveError')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* Drawer coulissant self-contained (parité HrSupplierFormDrawer `.hsd-*`), tokens
   de la charte typo. Chrome identique à l'ancien HrPositionFormDrawer (`.hpd-*`). */
.hpd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.38);
  display: flex;
  justify-content: flex-end;
}
.hpd-panel {
  width: 560px;
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
  background-color: #fafafa;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  font-family: inherit;
}
.hpd-input:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1);
  background-color: #fff;
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

/* Pills multi-select (parité hsd-pill du drawer Supplier) */
.hrd-pill-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.hrd-pill {
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
.hrd-pill:hover:not(:disabled) { border-color: #ff3131; color: #ff3131; background: #fff5f5; }
.hrd-pill--active {
  border-color: #ff3131;
  background: #fef2f2;
  color: #ff3131;
  font-weight: var(--fw-semibold);
  box-shadow: 0 0 0 2px rgba(255, 49, 49, 0.1);
}
.hrd-pill--off { opacity: 0.4; cursor: not-allowed; }
.hrd-pill__check { opacity: 0; transition: opacity 0.15s; }
.hrd-pill--active .hrd-pill__check { opacity: 1; }
.hpd--dark .hrd-pill { background: #1e293b; border-color: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.55); }
.hpd--dark .hrd-pill:hover:not(:disabled) { border-color: #ff3131; color: #e84444; background: rgba(255, 49, 49, 0.1); }
.hpd--dark .hrd-pill--active { background: rgba(255, 49, 49, 0.15); border-color: #ff3131; color: #e84444; }

/* Section repliable « Avancé » */
.hrd-advanced { border: 1px solid #e5e7eb; border-radius: 11px; overflow: hidden; }
.hrd-advanced summary {
  padding: 10px 14px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: 0.9px;
  color: #9ca3af;
  cursor: pointer;
  background: #fafafa;
  list-style: none;
}
.hrd-advanced summary::-webkit-details-marker { display: none; }
.hrd-advanced__inner { padding: 14px; }
.hrd-hint { font-size: var(--fs-xs); color: #9ca3af; }
.hpd--dark .hrd-advanced { border-color: rgba(255, 255, 255, 0.12); }
.hpd--dark .hrd-advanced summary { background: #1e293b; color: #64748b; }

/* Sinking rules (STF-2) */
.hrd-sinking { display: flex; flex-direction: column; gap: 10px; }
.hrd-sinking__row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.hrd-sinking__row .hpd-select { flex: 1 1 140px; min-width: 120px; }
.hrd-sinking__num { flex: 0 1 90px; padding: 0.5rem 0.6rem; }
.hrd-sinking__remove {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: #f9fafb;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.hrd-sinking__remove:hover:not(:disabled) { background: #fef2f2; color: #ff3131; }
.hrd-sinking__remove:disabled { opacity: 0.5; cursor: not-allowed; }
.hpd-error-inline { font-size: var(--fs-xs); color: #ff3131; }
.hpd--dark .hrd-sinking__remove { background: #1e293b; color: #64748b; }
.hpd--dark .hrd-sinking__remove:hover:not(:disabled) { background: rgba(255, 49, 49, 0.1); color: #e84444; }

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
.hpd--dark .hpd-input { background-color: #1e293b; border-color: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.87); }
.hpd--dark .hpd-input:focus { background-color: #263548; border-color: #ff3131; }
.hpd--dark .hpd-input::placeholder { color: rgba(255, 255, 255, 0.25); }
.hpd--dark .hpd-select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.7rem center;
}
.hpd--dark .hpd-select option { background: #1e293b; color: rgba(255, 255, 255, 0.87); }
.hpd--dark .hpd-rate__suffix { color: #64748b; }
</style>
