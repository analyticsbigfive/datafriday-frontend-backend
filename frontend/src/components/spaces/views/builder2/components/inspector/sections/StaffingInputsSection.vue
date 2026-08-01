<template>
  <SectionCard :title="t('b2StaffingInputsTitle')" icon="mdi-calculator-variant-outline">
    <div class="sfi-grid">
      <div class="sfi-field">
        <label class="sfi-label" for="sfi-metres">
          {{ t('b2MetresLineaires') }}
          <v-icon icon="mdi-information-outline" size="12" :title="t('b2MetresLineairesHint')" />
        </label>
        <input
          id="sfi-metres" class="sfi-input" type="number" min="0" step="0.1"
          placeholder="—"
          :value="attrs.metresLineaires ?? ''"
          @change="(e) => commit('metresLineaires', e.target.value === '' ? null : Number(e.target.value))"
        />
      </div>

      <div class="sfi-field">
        <label class="sfi-label" for="sfi-tx">{{ t('b2TxParSeconde') }}</label>
        <select
          id="sfi-tx" class="sfi-input sfi-select"
          :value="attrs.txParSeconde ?? 30"
          @change="(e) => commit('txParSeconde', Number(e.target.value))"
        >
          <option :value="30">30 tx/s</option>
          <option :value="60">60 tx/s</option>
        </select>
      </div>

      <div v-for="field in NUMBER_FIELDS" :key="field.key" class="sfi-field">
        <label class="sfi-label" :for="`sfi-${field.key}`">{{ t(field.labelKey) }}</label>
        <input
          :id="`sfi-${field.key}`" class="sfi-input" type="number" min="0" step="1"
          :value="attrs[field.key] ?? 0"
          @change="(e) => commit(field.key, Number(e.target.value) || 0)"
        />
      </div>
    </div>

    <div class="sfi-toggles">
      <label class="sfi-toggle" :title="t('b2OuvertureObligatoireHint')">
        <input
          type="checkbox" :checked="!!attrs.ouvertureObligatoire"
          @change="(e) => commit('ouvertureObligatoire', e.target.checked)"
        />
        {{ t('b2OuvertureObligatoire') }}
      </label>
      <label class="sfi-toggle">
        <input
          type="checkbox" :checked="!!attrs.hasResponsablePdv"
          @change="(e) => commit('hasResponsablePdv', e.target.checked)"
        />
        {{ t('b2HasResponsablePdv') }}
      </label>
    </div>

    <!-- Règles Sinking (STF-2) qui concernent CET élément (fnbCategory ∈ ses sous-types) —
         2026-08-01, retour utilisateur : savoir directement ici pourquoi un rôle apparaît (ou
         pas encore) dans Staff, sans devoir aller vérifier côté écran RH. -->
    <div v-if="relevantRules.length" class="sfi-rules">
      <div class="sfi-rules__title">{{ t('b2StaffingRulesTitle') }}</div>
      <div v-for="rule in relevantRules" :key="rule.id" class="sfi-rule">
        <v-icon
          :icon="rule.met ? 'mdi-check-circle' : 'mdi-circle-outline'"
          size="15"
          :class="rule.met ? 'sfi-rule__icon--met' : 'sfi-rule__icon'"
        />
        <span class="sfi-rule__text">
          <strong>{{ rule.roleName }}</strong> × {{ rule.mandatoryQty }}
          <template v-if="rule.conditionAttribute">
            — {{ conditionLabel(rule.conditionAttribute) }} ≥ {{ rule.conditionMinValue }}
            <span class="sfi-rule__current">({{ t('b2StaffingRuleCurrent') }} {{ currentValue(rule) }})</span>
          </template>
          <template v-else>— {{ t('b2StaffingRuleAlwaysActive') }}</template>
        </span>
      </div>
    </div>
  </SectionCard>
</template>

<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'
import { fetchHrRolesCached, fetchHrSinkingRulesCached } from '@/utils/hrRolesCache'
import { relevantSinkingRules } from '@/utils/sinkingRules'

// CFG-2 (2026-08-01) : jusqu'ici, aucun champ nulle part ne permettait de saisir ces attributs
// (BUG-260-02) — StaffingCalculatorService les lit depuis SpaceElement.attributes mais rien ne
// les écrivait. Décision utilisateur : tout dans le Builder (pas de split avec Event Predict),
// même mécanisme de PATCH que StorageShopsSection.vue (attributes fusionné, jamais remplacé).
const NUMBER_FIELDS = [
  { key: 'nbTireuses', labelKey: 'b2NbTireuses' },
  { key: 'nbFriteuses', labelKey: 'b2NbFriteuses' },
  { key: 'nbBurgersPrevus', labelKey: 'b2NbBurgersPrevus' },
  { key: 'nbDinettes', labelKey: 'b2NbDinettes' },
  { key: 'nbHotdogsPrevus', labelKey: 'b2NbHotdogsPrevus' },
]
// Mêmes libellés que HrRoleFormDrawer.vue::CONDITION_ATTRIBUTES (clés déjà i18n, réutilisées
// telles quelles — pas de raison d'avoir deux formulations pour le même attribut).
const CONDITION_LABEL_KEYS = {
  nbFriteuses: 'hrCondAttrNbFriteuses',
  nbTireuses: 'hrCondAttrNbTireuses',
  nbBurgersPrevus: 'hrCondAttrNbBurgersPrevus',
  nbDinettes: 'hrCondAttrNbDinettes',
  nbHotdogsPrevus: 'hrCondAttrNbHotdogsPrevus',
}

const { t } = useI18n()
const store = inject('builderStore')
const element = computed(() => store.selectedElement.value)
const attrs = computed(() => element.value?.attributes || {})

// Règles Sinking + rôles du tenant, chargés une fois (best effort — n'affecte jamais l'édition
// des champs ci-dessus si l'appel échoue). Pas de filtre roleId : on veut TOUTES les règles pour
// les recouper avec les sous-types de CET élément, quel que soit le rôle qui les porte. Cache
// partagé avec StaffSection.vue (fetchHrRolesCached) — évite le double appel getHrRoles() pour
// le même écran (les deux sections en avaient chacune besoin indépendamment).
const allRules = ref([])
const allRoles = ref([])
onMounted(async () => {
  try {
    const [rules, roles] = await Promise.all([fetchHrSinkingRulesCached(), fetchHrRolesCached()])
    allRules.value = rules
    allRoles.value = roles
  } catch (_) {
    allRules.value = []
    allRoles.value = []
  }
})

// Le backend ne valide `conditionAttribute` contre aucune liste figée (seul le <select> de
// HrRoleFormDrawer restreint la saisie) — replie sur la clé brute si jamais une valeur hors des
// 5 connues existe en base, plutôt qu'un libellé vide.
function conditionLabel(attribute) {
  const key = CONDITION_LABEL_KEYS[attribute]
  return key ? t(key) : attribute
}
function currentValue(rule) {
  const v = Number(attrs.value[rule.conditionAttribute])
  return Number.isFinite(v) ? v : 0
}
// Logique de matching extraite dans utils/sinkingRules.js (testée, sinkingRules.spec.js) —
// miroir de StaffingCalculatorService.applySinkingRules() (backend).
const relevantRules = computed(() =>
  relevantSinkingRules(allRules.value, allRoles.value, element.value?.subtypes, attrs.value),
)

// PATCH attributes = remplacement INTÉGRAL côté backend → toujours renvoyer l'objet attributes
// fusionné, jamais { [key]: value } seul (même garde-fou que StorageShopsSection.vue).
function commit(key, value) {
  const el = element.value
  if (!el) return
  const prevAttrs = el.attributes || {}
  store.commitElementPatch(
    el.id,
    { attributes: { ...prevAttrs, [key]: value } },
    { attributes: prevAttrs },
    t('b2StaffingInputsTitle'),
  )
}
</script>

<style scoped>
.sfi-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 10px;
  margin-bottom: 14px;
}
.sfi-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.sfi-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.sfi-label .v-icon { color: rgba(var(--v-theme-on-surface), 0.4); cursor: help; }
.sfi-input {
  width: 100%;
  padding: 9px 11px;
  font-size: var(--fs-base);
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid transparent;
  border-radius: 9px;
  outline: none;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.sfi-input::placeholder { color: rgba(var(--v-theme-on-surface), 0.4); }
.sfi-input:hover { background: rgba(var(--v-theme-on-surface), 0.07); }
.sfi-input:focus {
  background: rgb(var(--v-theme-surface));
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}
.sfi-select { appearance: none; cursor: pointer; }
.sfi-toggles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 2px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.sfi-toggle {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 2px;
  cursor: pointer;
  font-size: var(--fs-sm);
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
}
.sfi-toggle input {
  width: 16px;
  height: 16px;
  accent-color: #ff3131;
  cursor: pointer;
  flex-shrink: 0;
}
.sfi-rules {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sfi-rules__title {
  font-size: var(--fs-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.9px;
  color: rgba(var(--v-theme-on-surface), 0.45);
}
.sfi-rule {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: var(--fs-sm);
  color: rgb(var(--v-theme-on-surface));
}
.sfi-rule__icon { color: rgba(var(--v-theme-on-surface), 0.3); flex-shrink: 0; margin-top: 1px; }
.sfi-rule__icon--met { color: #16a34a; flex-shrink: 0; margin-top: 1px; }
.sfi-rule__text { line-height: 1.5; }
.sfi-rule__current { color: rgba(var(--v-theme-on-surface), 0.45); }
</style>
