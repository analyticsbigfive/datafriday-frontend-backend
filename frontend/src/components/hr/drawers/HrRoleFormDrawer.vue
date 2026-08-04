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

              <!-- 4. SI Agency → Supplier multi-select — filtré aux agences éligibles pour CE
                   département (BUG-266-02 : affichait avant TOUTES les agences du tenant, sans
                   recouper avec HrSupplier.departments). Création à la volée (2026-08-01, retour
                   utilisateur) : si aucune agence n'est éligible, on ouvre directement le tiroir
                   de création plutôt que de forcer un aller-retour vers l'écran Suppliers. -->
              <div v-if="form.contractType === 'AGENCY'" class="hpd-field mb-3">
                <label class="hpd-field-label">{{ t('hrColSupplier') }} <span class="hpd-required">*</span></label>
                <div v-if="!eligibleSuppliers.length" class="hpd-notice">
                  <Building2 :size="18" class="me-2" style="flex-shrink:0" />
                  {{ allSuppliers.length ? t('hrNoSupplierForDept') : t('hrNoSupplierYet') }}
                </div>
                <div v-else class="hrd-pill-grid mb-2">
                  <button
                    v-for="s in eligibleSuppliers" :key="s.id" type="button"
                    class="hrd-pill" :class="{ 'hrd-pill--active': form.supplierIds.includes(s.id) }"
                    @click="toggleSupplier(s.id)"
                  >
                    <Check :size="12" class="hrd-pill__check" />
                    {{ s.name }}
                  </button>
                </div>
                <button type="button" class="hrd-create-supplier" @click="openCreateSupplier">
                  <Plus :size="14" />
                  {{ t('hrCreateSupplierInline') }}
                </button>
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
                    <NumberField
                      id="hrd-rate" v-model="form.rate" :decimals="2" :min="0"
                      pad grouping class="hpd-input hpd-rate__input"
                    />
                    <span class="hpd-rate__suffix">{{ rateSuffix }}</span>
                  </div>
                </div>
              </template>
            </div>

            <!-- 6. Sous-type (du département choisi ci-dessus) + NON LIÉ -->
            <div v-if="subtypeOptions.length" class="hpd-section">
              <div class="hpd-section__label">{{ t('hrFnbCategory') }} — {{ selectedDepartmentLabel }}</div>
              <div class="hrd-pill-grid">
                <button
                  v-for="c in subtypeOptions" :key="c.value" type="button"
                  class="hrd-pill"
                  :class="{ 'hrd-pill--active': form.fnbCategories.includes(c.value) }"
                  @click="toggleFnb(c.value)"
                >
                  <Check :size="12" class="hrd-pill__check" />
                  {{ c.label }}
                </button>
                <button
                  type="button" class="hrd-pill" :class="{ 'hrd-pill--active': notLinked }"
                  :title="t('hrFnbNotLinkedHint')"
                  @click="clearFnbCategories"
                >
                  <Check :size="12" class="hrd-pill__check" />
                  {{ t('hrFnbNotLinked') }}
                </button>
              </div>
            </div>

            <!-- Département modifié mais pas encore enregistré : les règles Sinking valideraient
                 contre le département PERSISTÉ (pas form.department) et échoueraient de façon
                 trompeuse — on explique plutôt que de laisser une erreur "fnbCategory invalide". -->
            <div
              v-if="departmentUnsaved && form.fnbCategories.length > 0"
              class="hpd-notice"
            >
              <AlertCircle :size="18" class="me-2" style="flex-shrink:0" />
              {{ t('hrSinkingRuleSaveDeptFirst') }}
            </div>

            <!-- STF-2 : dotation conditionnelle « Sinking » (rôle × sous-type) — une carte par
                 règle, champs étiquetés (BUG-263-02 : la ligne unique à 4 champs sans libellé
                 était illisible/peu intuitive). -->
            <div v-if="showSinkingRules" class="hpd-section">
              <div class="hpd-section__label">{{ t('hrSinkingRulesTitle') }}</div>
              <div v-if="sinkingError" class="hpd-error-inline mb-2">{{ sinkingError }}</div>

              <div v-if="!ruleDrafts.length" class="hrd-sinking__empty">{{ t('hrSinkingRulesEmpty') }}</div>

              <div v-else class="hrd-sinking__list">
                <div v-for="(rule, idx) in ruleDrafts" :key="rule.id ?? `new-${idx}`" class="hrd-sinking__card">
                  <div class="hrd-sinking__card-header">
                    <span class="hrd-sinking__card-title">{{ t('hrSinkingRuleNumber') }} {{ idx + 1 }}</span>
                    <button
                      type="button" class="hrd-sinking__delete" :disabled="rule.saving"
                      @click="removeRuleDraft(rule, idx)"
                    >
                      <X :size="13" />
                      {{ t('hrSinkingRuleRemove') }}
                    </button>
                  </div>

                  <div class="hpd-field mb-2">
                    <label class="hpd-field-label">{{ t('hrSinkingRuleCategory') }}</label>
                    <select v-model="rule.fnbCategory" class="hpd-input hpd-select" @change="saveRuleDraft(rule)">
                      <option v-for="c in ruleCategoryOptions(rule)" :key="c" :value="c">{{ fnbLabel(c) }}</option>
                    </select>
                  </div>

                  <div class="hpd-field mb-2">
                    <label class="hpd-field-label">{{ t('hrSinkingRuleCondition') }}</label>
                    <select v-model="rule.conditionAttribute" class="hpd-input hpd-select" @change="saveRuleDraft(rule)">
                      <option value="">{{ t('hrSinkingRuleConditionNone') }}</option>
                      <option v-for="a in CONDITION_ATTRIBUTES" :key="a.value" :value="a.value">{{ a.label }}</option>
                    </select>
                  </div>

                  <div class="hrd-sinking__field-row">
                    <div v-if="rule.conditionAttribute" class="hpd-field">
                      <label class="hpd-field-label">{{ t('hrSinkingRuleMinValue') }}</label>
                      <NumberField
                        v-model="rule.conditionMinValue" :decimals="2" :min="0"
                        :empty-value="0" class="hpd-input" @change="saveRuleDraft(rule)"
                      />
                    </div>
                    <div class="hpd-field">
                      <label class="hpd-field-label">{{ t('hrSinkingRuleQty') }}</label>
                      <NumberField
                        v-model="rule.mandatoryQty" :decimals="0" :step="1" :min="1"
                        :empty-value="1" class="hpd-input" @change="saveRuleDraft(rule)"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button type="button" class="hrd-sinking__add" @click="addRuleDraft">
                <Plus :size="15" />
                {{ t('hrSinkingRuleAdd') }}
              </button>
            </div>

            <!-- 7. Avancé — algoKey. Section normale (pas repliable) : un <details> fermé par
                 défaut en bas d'un formulaire pouvant devenir long (Sinking Rules) se perdait
                 facilement, retour utilisateur 2026-07-31 ("Avanced algo; ça se perd quand la
                 liste est longue") — même traitement visuel que les autres sections. -->
            <div class="hpd-section">
              <div class="hpd-section__label">{{ t('hrAdvancedAlgo') }}</div>
              <div class="hpd-field">
                <label class="hpd-field-label" for="hrd-algo">algoKey</label>
                <select id="hrd-algo" v-model="form.algoKey" class="hpd-input hpd-select">
                  <option value="">—</option>
                  <option v-for="k in ALGO_KEYS" :key="k" :value="k">{{ k }}</option>
                </select>
                <span class="hrd-hint">{{ algoHint }}</span>
              </div>
            </div>
          </div>

          <!-- ── Error : rendue ici, hors zone scrollable, toujours visible juste au-dessus
               des boutons — plutôt qu'en haut du corps (invisible une fois scrollé sur ce
               drawer particulièrement long). Erreur PRINCIPALE seulement — sinkingError reste
               inline dans sa propre section (contrôle contextuel, pas ce correctif). ── -->
          <div v-if="error" class="hpd__error">
            <AlertCircle :size="14" style="flex-shrink:0" class="me-2" />
            {{ error }}
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

  <!-- Création d'agence à la volée (2026-08-01) — tiroir imbriqué, propre Teleport (empile
       naturellement au-dessus par ordre d'insertion DOM). Département pré-coché avec celui du
       rôle en cours pour que la nouvelle agence soit immédiatement éligible (cf. eligibleSuppliers
       ci-dessous) sans étape manuelle supplémentaire. -->
  <HrSupplierFormDrawer
    v-model="supplierDrawerOpen"
    mode="create"
    :initial="{ departments: [form.department] }"
    :spaces="spaces"
    @saved="onSupplierCreated"
  />
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useTheme } from 'vuetify'
import { AlertCircle, Briefcase, Building2, Check, Pencil, Plus, Save, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import * as hrApi from '@/utils/hrApi'
import {
  getHrSinkingRules,
  createHrSinkingRule,
  updateHrSinkingRule,
  deleteHrSinkingRule,
} from '@/api/endpoints/hr.api'
import { newId } from '../hrShared'
import { buildTools, toolOf } from '@/components/spaces/views/builder2/constants/elementTaxonomy'
import HrSupplierFormDrawer from './HrSupplierFormDrawer.vue'
import NumberField from '@/components/common/NumberField.vue'

// Clés d'attributs SpaceElement.attributes déjà consommées par l'algo de staffing
// (staffing.service.ts) — mêmes noms (value), pour que la condition d'une règle Sinking
// pointe vers un attribut réellement lu par le calcul. Label lisible pour l'utilisateur
// (BUG-263-02 : la valeur brute "nbFriteuses" s'affichait auparavant telle quelle).
const CONDITION_ATTRIBUTES = [
  { value: 'nbFriteuses', label: t('hrCondAttrNbFriteuses') },
  { value: 'nbTireuses', label: t('hrCondAttrNbTireuses') },
  { value: 'nbDinettes', label: t('hrCondAttrNbDinettes') },
]

// Vocabulaires — miroir du backend (features/hr/hr.service.ts)
const RATE_REQUIRED_CONTRACTS = ['CDD', 'AGENCY', 'FREELANCE']
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
  // Transmis tel quel au tiroir imbriqué HrSupplierFormDrawer (création d'agence à la volée,
  // BUG-266-02) — même shape que celui reçu par HrSuppliersView.vue (getSpacesLight()).
  spaces: { type: Array, default: () => [] },
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

// CFG-2 Étape 4.5, généralisée le 2026-07-31 (retour utilisateur : le sous-type proposé doit
// suivre le département choisi, pas rester figé sur `shop`) : sous-types du département
// SÉLECTIONNÉ sur ce rôle, mêmes fonctions que le Builder (elementTaxonomy.js). Un sous-type
// ajouté par le super-admin, sur n'importe quel département, apparaît ici sans changement de code.
const subtypeOptions = computed(() => {
  const tools = buildTools(store.getters['departments/departments'] || [])
  return toolOf(form.department, tools)?.subtypes || []
})
const selectedDepartmentLabel = computed(
  () => DEPARTMENTS.value.find((d) => d.value === form.department)?.label || form.department,
)
// BUG-266-02 : le sélecteur d'agences affichait TOUTES les agences du tenant, jamais filtrées par
// HrSupplier.departments — on pouvait lier une agence "shop uniquement" à un rôle Hospitality sans
// aucun garde-fou, ni ici ni côté backend (qui ne vérifie que l'existence du fournisseur). Filtré
// au département du rôle, même idiome que subtypeOptions ci-dessus.
// `extraSuppliers` : agences créées à la volée (voir HrSupplierFormDrawer imbriqué plus bas) —
// props.suppliers ne se met à jour qu'au prochain `load()` du parent (déclenché par le @saved DE
// CE rôle, pas par la création d'une agence en cours d'édition) ; fusionné ici pour un affichage
// immédiat sans attendre. Dédupliqué par id au cas où props.suppliers finirait par les inclure.
const extraSuppliers = ref([])
const allSuppliers = computed(() => {
  const byId = new Map(props.suppliers.map((s) => [s.id, s]))
  for (const s of extraSuppliers.value) byId.set(s.id, s)
  return [...byId.values()]
})
const eligibleSuppliers = computed(
  () => allSuppliers.value.filter((s) => (s.departments || []).includes(form.department)),
)
const supplierDrawerOpen = ref(false)
function openCreateSupplier() {
  supplierDrawerOpen.value = true
}
function onSupplierCreated(supplier) {
  if (!supplier?.id) return
  extraSuppliers.value.push(supplier)
  if (!form.supplierIds.includes(supplier.id)) form.supplierIds.push(supplier.id)
}
// "NOT LINKED" n'est pas un champ persisté séparément — HrRole n'a que fnbCategories:String[].
// Dérivé de l'absence de tags plutôt que d'un ref indépendant : évite le désync qui rendait les
// pastilles injoignables (ref notLinked resté à `true` après reset() empêchait de cocher quoi que
// ce soit tant qu'on n'avait pas cliqué "NOT LINKED" pour le repasser à `false` — retour
// utilisateur 2026-07-31, "je dois cocher/décocher NOT LINKED pour pouvoir en choisir d'autres").
const notLinked = computed(() => form.fnbCategories.length === 0)
// Un sous-type coché appartient au vocabulaire du département — invalide dès que le département
// change (le backend le rejetterait de toute façon, cf. resolveFnbCategories scopé au
// département du rôle). On FILTRE (pas un clear brutal) : sans effet quand reset() vient de
// peupler department+fnbCategories cohérents pour un rôle déjà persisté (le watcher se déclenche
// après, en post-flush, sur des valeurs déjà valides) ; vide réellement les tags devenus
// invalides seulement quand l'utilisateur change interactivement le département.
watch(() => form.department, (newDept) => {
  const tools = buildTools(store.getters['departments/departments'] || [])
  const validValues = new Set((toolOf(newDept, tools)?.subtypes || []).map((s) => s.value))
  form.fnbCategories = form.fnbCategories.filter((c) => validValues.has(c))
  // Même principe pour les agences déjà cochées : une agence liée pour l'ancien département
  // n'est pas forcément éligible pour le nouveau (BUG-266-02).
  const eligibleIds = new Set(
    allSuppliers.value.filter((s) => (s.departments || []).includes(newDept)).map((s) => s.id),
  )
  form.supplierIds = form.supplierIds.filter((id) => eligibleIds.has(id))
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
// Un changement de département non enregistré rend les tags de subtype actuellement affichés
// (form.fnbCategories) invalides pour le rôle tel qu'il existe encore en base — saveRuleDraft()
// valide côté backend contre le département PERSISTÉ (assertValidSinkingRule va chercher le rôle
// par roleId), pas contre form.department. Sans ce garde-fou : "fnbCategory invalide" trompeur dès
// qu'on ajoute une règle Sinking juste après avoir changé le département sans encore sauvegarder.
// Repli `sector` IDENTIQUE à reset() (même chaîne `p?.department || p?.sector || 'shop'`) — sinon
// un rôle chargé uniquement via le champ legacy `sector` déclenchait ce garde-fou immédiatement à
// l'ouverture, sans qu'aucun changement n'ait eu lieu (faux positif).
const persistedDepartment = computed(
  () => props.initial?.department || props.initial?.sector || 'shop',
)
const departmentUnsaved = computed(
  () => props.mode === 'edit' && !!props.initial?.id && form.department !== persistedDepartment.value,
)
// Sinking rules : rôle déjà persisté (édition) + au moins un tag sélectionné + département à jour
// en base (sinon la validation backend échoue silencieusement, cf. departmentUnsaved). `notLinked`
// est l'inverse de "au moins un tag" — pas reconditionné séparément (cf. définition ci-dessus).
const showSinkingRules = computed(() =>
  props.mode === 'edit' && !!props.initial?.id && form.fnbCategories.length > 0 && !departmentUnsaved.value
)
function fnbLabel(value) {
  return subtypeOptions.value.find((c) => c.value === value)?.label || value
}
// Une règle Sinking peut référencer un sous-type décoché depuis dans la grille (form.fnbCategories
// ne le contient plus) — sans ça, le <select> de la règle se retrouvait sans option correspondante
// et s'affichait vide/muet, sans indiquer quelle valeur était réellement enregistrée.
function ruleCategoryOptions(rule) {
  if (rule.fnbCategory && !form.fnbCategories.includes(rule.fnbCategory)) {
    return [rule.fnbCategory, ...form.fnbCategories]
  }
  return form.fnbCategories
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
  const i = form.fnbCategories.indexOf(value)
  if (i >= 0) form.fnbCategories.splice(i, 1)
  else form.fnbCategories.push(value)
}
// "NOT LINKED" est un raccourci pour vider la sélection — pas un mode séparé (notLinked est
// dérivé de form.fnbCategories.length === 0, cf. sa définition) : cliquer dessus quand la liste
// est déjà vide n'a simplement aucun effet.
function clearFnbCategories() {
  form.fnbCategories = []
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
      fnbCategories: [...form.fnbCategories],
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

/* Error : barre fixe entre le corps scrollable et le footer (bordure haute, pas basse,
   pour se détacher du corps plutôt que du footer). */
.hpd__error {
  display: flex;
  align-items: center;
  padding: 10px 24px;
  background: #fef2f2;
  border-top: 1px solid #fecaca;
  font-size: var(--fs-base);
  color: #ff3131;
  flex-shrink: 0;
}

/* Body */
.hpd__body {
  flex: 1 1 0;
  min-height: 0; /* sinon un enfant flex refuse de rétrécir sous la hauteur de son contenu
    (min-height:auto par défaut) — le corps grandit indéfiniment et c'est .hpd-panel
    (overflow:hidden) qui coupe net, au lieu du scroll interne prévu ici. */
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
.hpd-input.number-field__input { text-align: center; }
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
.hrd-pill__check { opacity: 0; transition: opacity 0.15s; }
.hrd-pill--active .hrd-pill__check { opacity: 1; }
.hpd--dark .hrd-pill { background: #1e293b; border-color: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.55); }
.hpd--dark .hrd-pill:hover:not(:disabled) { border-color: #ff3131; color: #e84444; background: rgba(255, 49, 49, 0.1); }
.hpd--dark .hrd-pill--active { background: rgba(255, 49, 49, 0.15); border-color: #ff3131; color: #e84444; }

.hrd-hint { font-size: var(--fs-xs); color: #9ca3af; }

/* Sinking rules (STF-2) — une carte étiquetée par règle (BUG-263-02) */
.hrd-sinking__empty {
  font-size: var(--fs-sm);
  color: #9ca3af;
  padding: 14px;
  border: 1px dashed #e5e7eb;
  border-radius: 12px;
  text-align: center;
}
.hrd-sinking__list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
.hrd-sinking__card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; background: #fafafa; }
.hrd-sinking__card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.hrd-sinking__card-title {
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: 0.9px;
  color: #9ca3af;
}
.hrd-sinking__delete {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.15s, color 0.15s;
}
.hrd-sinking__delete:hover:not(:disabled) { background: #fef2f2; color: #ff3131; }
.hrd-sinking__delete:disabled { opacity: 0.5; cursor: not-allowed; }
.hrd-sinking__field-row { display: flex; gap: 10px; }
.hrd-sinking__field-row .hpd-field { flex: 1 1 0; min-width: 0; }
.hrd-sinking__add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  border: 1.5px dashed #d1d5db;
  border-radius: 12px;
  background: transparent;
  color: #6b7280;
  font-size: var(--fs-md);
  font-weight: var(--fw-medium);
  cursor: pointer;
  transition: border-color 0.18s, color 0.18s, background 0.18s;
}
.hrd-sinking__add:hover { border-color: #ff3131; color: #ff3131; background: #fff5f5; }
.hpd-error-inline { font-size: var(--fs-xs); color: #ff3131; }
.hpd--dark .hrd-sinking__card { background: #1e293b; border-color: rgba(255, 255, 255, 0.12); }
.hpd--dark .hrd-sinking__empty { border-color: rgba(255, 255, 255, 0.12); color: #64748b; }
.hpd--dark .hrd-sinking__delete { color: #64748b; }
.hpd--dark .hrd-sinking__delete:hover:not(:disabled) { background: rgba(255, 49, 49, 0.1); color: #e84444; }
.hpd--dark .hrd-sinking__add { border-color: rgba(255, 255, 255, 0.18); color: rgba(255, 255, 255, 0.55); }
.hpd--dark .hrd-sinking__add:hover { border-color: #ff3131; color: #e84444; background: rgba(255, 49, 49, 0.1); }

.hrd-create-supplier {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  border: 1.5px dashed #d1d5db;
  border-radius: 100px;
  background: transparent;
  color: #6b7280;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  cursor: pointer;
  transition: border-color 0.18s, color 0.18s, background 0.18s;
}
.hrd-create-supplier:hover { border-color: #ff3131; color: #ff3131; background: #fff5f5; }
.hpd--dark .hrd-create-supplier { border-color: rgba(255, 255, 255, 0.18); color: rgba(255, 255, 255, 0.55); }
.hpd--dark .hrd-create-supplier:hover { border-color: #ff3131; color: #e84444; background: rgba(255, 49, 49, 0.1); }

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
