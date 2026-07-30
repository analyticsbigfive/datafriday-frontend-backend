<template>
  <SectionCard :title="t('b2StaffTitle')" icon="mdi-account-hard-hat" default-open>
    <template #meta>
      <v-chip size="x-small" variant="tonal">{{ totalCount }}</v-chip>
    </template>

    <!-- Une seule liste — l'icône (survol = pourquoi) distingue un poste auto d'un
         poste ajouté à la main, sans texte de groupe. -->
    <div v-if="staff.length" class="stf-list">
      <div v-for="(row, index) in staff" :key="index" class="stf-card" :class="{ 'stf-card--custom': row.source !== 'AUTO' }">
        <div class="stf-card__row">
          <v-icon v-if="row.source === 'AUTO'" icon="mdi-auto-fix" size="13" class="stf-card__auto-icon" :title="t('b2StaffAutoHint')" />
          <span class="stf-card__name">{{ row.position }}</span>
          <span class="stf-card__spacer" />
          <div class="stf-qty">
            <input
              class="stf-qty__input"
              type="number"
              min="0"
              :value="row.count"
              @change="(e) => updateCount(index, e.target.value)"
            />
          </div>
          <button class="stf-card__remove" :title="t('b2Remove')" @click="removeRow(index)">
            <v-icon icon="mdi-close" size="13" />
          </button>
        </div>
      </div>
    </div>

    <!-- État vide -->
    <div v-if="!staff.length" class="stf-empty">{{ t('b2NoStaffYet') }}</div>

    <!-- Ajout manuel : sélection d'un rôle RH existant (plus de saisie libre,
         2026-07-30 — retour utilisateur : lister/sélectionner, jamais taper un nom). -->
    <div class="stf-add">
      <select v-model="newRoleId" class="stf-add__select" :disabled="!selectableRoles.length">
        <option value="" disabled>{{ selectableRoles.length ? t('b2PositionPlaceholder') : t('b2NoRoleAvailable') }}</option>
        <option v-for="role in selectableRoles" :key="role.id" :value="role.id">{{ role.name }}</option>
      </select>
      <input v-model.number="newCount" type="number" min="1" class="stf-add__count" />
      <button type="button" class="stf-add__btn" :disabled="!newRoleId" :title="t('b2Add')" @click="addRow">
        <v-icon icon="mdi-plus" size="16" />
      </button>
    </div>
  </SectionCard>
</template>

<script setup>
import { ref, computed, inject, watch, onMounted } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'
import { putElementStaff, getElementStaffSuggestions } from '@/api/endpoints/builder-v2.api'
import { getHrRoles } from '@/api/endpoints/hr.api'

const { t } = useI18n()
const store = inject('builderStore')
const element = computed(() => store.selectedElement.value)
// Tranche de la CONFIG ACTIVE (staffing par config depuis le scoping backend) ;
// clé '' = lignes legacy d'un élément sans config adhérente.
const configKey = computed(() => store.state.activeConfigId || '')
const staff = computed(() => {
  const byConfig = element.value?.staffByConfig || {}
  return byConfig[configKey.value] || byConfig[''] || []
})
const totalCount = computed(() => staff.value.reduce((sum, r) => sum + (Number(r.count) || 0), 0))

// Ajout manuel = choisir un rôle RH existant, jamais taper un nom libre
// (2026-07-30, retour utilisateur).
const availableRoles = ref([])
onMounted(async () => {
  try {
    availableRoles.value = await getHrRoles()
  } catch (_) {
    availableRoles.value = []
  }
})
function hourlyRateFromRole(role) {
  if (role.rate == null) return null
  if (role.rateType === 'HOURLY') return role.rate
  if (role.rateType === 'DAILY') return role.rate / 8
  if (role.rateType === 'MONTHLY') return role.rate / 151.67
  return null
}

const newRoleId = ref('')
const newCount = ref(1)

// Un rôle déjà présent dans la liste (auto ou manuel) ne doit plus pouvoir être
// re-choisi — retiré du menu, pas de doublon possible (retour utilisateur).
const usedRoleIds = computed(() => new Set(staff.value.map((r) => r.roleId).filter(Boolean)))
const selectableRoles = computed(() => availableRoles.value.filter((r) => !usedRoleIds.value.has(r.id)))
watch(selectableRoles, (roles) => {
  if (newRoleId.value && !roles.some((r) => r.id === newRoleId.value)) newRoleId.value = ''
})

// Le state builder renvoie les lignes AVEC leur id serveur ; le PUT (whitelist +
// forbidNonWhitelisted) le refuse → ne renvoyer QUE les champs du contrat (même
// bug/correctif que InventorySection.vue::cleanRow).
function cleanRow(r) {
  const row = { position: r.position, count: Number(r.count) || 0 }
  if (r.hourlyRate != null) row.hourlyRate = r.hourlyRate
  if (r.roleId != null) row.roleId = r.roleId
  if (r.source != null) row.source = r.source
  return row
}

function save(next) {
  const el = element.value
  if (!el) return
  const cfgId = store.state.activeConfigId || undefined
  const clean = next.map(cleanRow)
  store.patchElementLocal(el.id, {
    staffByConfig: { ...(el.staffByConfig || {}), [cfgId || '']: clean },
  })
  store.queue.push(() => putElementStaff(el.id, clean, cfgId), {
    key: `staff:${el.id}:${cfgId || ''}`,
    onError: (err) => store.notify(err?.response?.data?.message || t('b2ToastSaveStaffFailed')),
  })
}

function addRow() {
  if (!newRoleId.value) return
  const role = availableRoles.value.find((r) => r.id === newRoleId.value)
  if (!role) return
  const count = Math.max(1, parseInt(newCount.value, 10) || 1)
  save([
    ...staff.value,
    { position: role.name, count, hourlyRate: hourlyRateFromRole(role), roleId: role.id, source: 'MANUAL' },
  ])
  newRoleId.value = ''
  newCount.value = 1
}

function removeRow(index) {
  save(staff.value.filter((_, i) => i !== index))
}

function updateCount(index, raw) {
  const count = Math.max(0, parseInt(raw, 10) || 0)
  save(staff.value.map((row, i) => (i === index ? { ...row, count } : row)))
}

// ── Auto-remplissage depuis les Rôles RH + règles Sinking (2026-07-30) ──────
// Dès qu'un sous-type F&B coché matche un Rôle RH tagué pour cette catégorie,
// le poste apparaît directement (source='AUTO', quantité 1 par défaut) — le
// tag seul suffit, aucune règle Sinking n'est requise (retour utilisateur : le
// simple tag Beverage/Kitchen Food… doit suffire). Une règle Sinking SANS
// condition ajuste juste la quantité par défaut ; une règle AVEC condition
// rend le poste conditionnel (il disparaît du défaut, n'apparaît que si la
// condition est remplie — jamais le cas dans le Builder tant qu'aucun champ ne
// permet de saisir les attributs d'équipement, limite assumée cf. module doc).
// Les lignes tapées/choisies à la main (source='MANUAL') ne sont jamais
// touchées. Idempotent : décocher le sous-type fait disparaître la ligne AUTO
// correspondante au prochain cycle.
let syncTimer = null
function scheduleAutoSync() {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(runAutoSync, 400)
}
async function runAutoSync() {
  const el = element.value
  if (!el) return
  const elementId = el.id
  const cfgId = store.state.activeConfigId || undefined
  let suggestions = []
  try {
    suggestions = await getElementStaffSuggestions(elementId, cfgId)
  } catch (_) {
    return // best effort — ne bloque jamais l'édition manuelle
  }
  // La sélection (élément ou config active) a pu changer pendant l'appel réseau.
  if (element.value?.id !== elementId || (store.state.activeConfigId || undefined) !== cfgId) return

  const manualRows = staff.value.filter((r) => r.source !== 'AUTO')
  const autoRows = suggestions.map((s) => ({
    position: s.roleName,
    count: s.qty,
    hourlyRate: s.hourlyRate,
    roleId: s.roleId,
    source: 'AUTO',
  }))
  const currentAuto = staff.value.filter((r) => r.source === 'AUTO')
  const unchanged =
    currentAuto.length === autoRows.length &&
    currentAuto.every((r) => autoRows.some((a) => a.roleId === r.roleId && a.count === r.count))
  if (unchanged) return

  save([...manualRows, ...autoRows])
}

watch(
  () => [element.value?.id, element.value?.subtypes, configKey.value],
  () => scheduleAutoSync(),
  { immediate: true },
)
</script>

<style scoped>
/* Liste de cartes — même recette que InventorySection (.inv-list/.inv-card). */
.stf-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 -4px 4px;
  padding: 0 4px;
}
.stf-card {
  background: #fafafa;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  padding: 9px 10px;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.stf-card:hover {
  border-color: #e0e0e2;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
}
.stf-card--custom { background: #fff; }

.stf-card__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.stf-card__name {
  font-size: var(--fs-base);
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stf-card__auto-icon { flex-shrink: 0; color: #ff3131; }
.stf-card__spacer { flex: 1; }

/* Quantité — même recette que InventorySection (.inv-qty). */
.stf-qty { display: flex; align-items: baseline; gap: 4px; flex-shrink: 0; }
.stf-qty__input {
  width: 52px;
  text-align: right;
  font-size: var(--fs-sm);
  font-weight: 500;
  color: #374151;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 4px 8px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  -moz-appearance: textfield;
}
.stf-qty__input::-webkit-outer-spin-button,
.stf-qty__input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.stf-qty__input:focus { border-color: #ff3131; box-shadow: 0 0 0 2px rgba(255, 49, 49, 0.12); }

.stf-card__remove {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.stf-card__remove:hover { background: rgba(255, 49, 49, 0.08); color: #ff3131; }

/* État vide. */
.stf-empty {
  margin-top: 8px;
  padding: 10px 0 18px;
  text-align: center;
  font-size: var(--fs-base);
  color: rgba(var(--v-theme-on-surface), 0.5);
}

/* Ajout — même recette que InventorySection (.inv-add). */
.stf-add {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}
.stf-add__select {
  flex: 1;
  min-width: 0;
  background: #f4f4f5;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 7px 28px 7px 10px;
  font-size: var(--fs-sm);
  color: inherit;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
.stf-add__select:hover:not(:disabled) { background-color: #efeff1; }
.stf-add__select:focus { background-color: #fff; border-color: #ff3131; }
.stf-add__select:disabled { opacity: 0.55; cursor: not-allowed; }
.stf-add__count {
  flex-shrink: 0;
  width: 52px;
  text-align: center;
  background: #f4f4f5;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 7px 6px;
  font-size: var(--fs-sm);
  outline: none;
  -moz-appearance: textfield;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.stf-add__count::-webkit-outer-spin-button,
.stf-add__count::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.stf-add__count:focus { background: #fff; border-color: #ff3131; }
.stf-add__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 49, 49, 0.1);
  color: #ff3131;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;
}
.stf-add__btn:hover:not(:disabled) { background: rgba(255, 49, 49, 0.18); }
.stf-add__btn:disabled { opacity: 0.4; cursor: default; }
</style>
