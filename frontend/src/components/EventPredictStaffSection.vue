<template>
  <div class="eps-root">
    <!-- État vide : pas encore de lignes → CTA générer -->
    <div v-if="!fetching && !elements.length" class="eps-empty">
      <p class="eps-empty-text">{{ t('epsEmptyHint') }}</p>
      <button class="eps-generate-btn" :disabled="saving" @click="onGenerate">
        <v-icon size="16" class="mr-1">mdi-account-multiple-plus-outline</v-icon>
        {{ t('epsGenerate') }}
      </button>
      <p v-if="generateError" class="eps-error">{{ generateError }}</p>
      <!-- Génération résolue mais 0 ligne créée : sans ce bandeau, le clic est
           indiscernable d'un no-op (BUG-258-01). Les warnings backend expliquent la cause. -->
      <v-alert
        v-if="!generateError && hasGeneratedOnce"
        type="warning"
        variant="tonal"
        density="comfortable"
        class="eps-empty-alert"
      >
        <strong>{{ t('epsGenerateEmptyTitle') }}</strong>
        <template v-if="warnings.length">
          <div v-for="w in warnings" :key="w.code">{{ w.message || w.code }}</div>
        </template>
        <template v-else>{{ t('epsGenerateEmptyText') }}</template>
      </v-alert>
    </div>

    <div v-else-if="fetching && !elements.length" class="eps-empty">
      <p class="eps-empty-text">{{ t('epsLoading') }}</p>
    </div>

    <template v-else>
      <div class="eps-toolbar">
        <button class="eps-generate-btn eps-generate-btn--ghost" :disabled="saving" @click="onGenerate">
          <v-icon size="15" class="mr-1">mdi-refresh</v-icon>
          {{ t('epsRegenerate') }}
        </button>
        <span v-if="warnings.length" class="eps-warning-chip" :title="warningTitle">
          <v-icon size="13">mdi-alert</v-icon> {{ warnings.length }}
        </span>
      </div>
      <!-- Miroir de l'état vide : une erreur de (re)génération doit aussi être
           visible quand des lignes existent déjà (BUG-258-01). -->
      <p v-if="generateError" class="eps-error">{{ generateError }}</p>

      <!-- Une carte par PDV, calquée sur ep-shop-card (EventPredictMenusSection) -->
      <div v-for="el in elements" :key="el.elementId" class="ep-shop-card">
        <div class="ep-shop-card-header">
          <div class="ep-shop-card-grid">
            <div class="ep-shop-card-main">
              <div class="ep-shop-card-image">{{ initials(el.elementName) }}</div>
              <div class="ep-shop-card-content">
                <div class="ep-shop-card-title-row">
                  <div class="min-w-0">
                    <span class="ep-shop-card-title">{{ el.elementName }}</span>
                    <div class="ep-shop-card-subtitle">
                      {{ t('epsPeakTx') }} : <strong>{{ el.peakTxParMin ?? 0 }}</strong>
                    </div>
                  </div>
                  <div class="ep-shop-card-revenue">
                    <span class="ep-revenue-pill">
                      <span class="ep-revenue-label">{{ t('epsPredicted') }}</span>
                      <strong>{{ eur(el.predictedCost) }}</strong>
                    </span>
                    <span class="ep-revenue-pill ep-revenue-pill-adjusted">
                      <span class="ep-revenue-label">{{ t('epsAdjusted') }}</span>
                      <strong>{{ eur(el.adjustedCost) }}</strong>
                    </span>
                  </div>
                </div>
                <div class="ep-shop-adjustment">
                  <div class="ep-shop-adjustment-row">
                    <span class="ep-shop-slider-label">
                      {{ t('epsShopWindow') }} : {{ fmtTime(bounds.min) }} – {{ fmtTime(bounds.max) }}
                    </span>
                    <button class="eps-add-btn" :disabled="saving" @click="onAddLine(el.elementId)">
                      <v-icon size="15" class="mr-1">mdi-plus</v-icon>
                      {{ t('epsAddStaff') }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Lignes staff (§3.3) : checkbox / rôle / fournisseur / nom / taux / slider / total -->
        <div class="ep-staff-lines">
          <div
            v-for="line in el.lines"
            :key="line.id"
            class="ep-menu-item-row"
            :class="{ 'is-disabled': !draft(line.id).enabled }"
          >
            <input
              type="checkbox"
              class="ep-line-check"
              :checked="draft(line.id).enabled"
              :aria-label="t('epsToggleLine')"
              @change="setField(line, 'enabled', $event.target.checked)"
            />

            <span class="ep-role-badge" :class="{ 'role-warn': !line.roleId }">
              {{ line.roleName || line.algoKey || t('epsRoleMissing') }}
            </span>
            <span v-if="line.source === 'MANUAL'" class="eps-manual-tag">{{ t('epsManual') }}</span>

            <div class="ep-line-field">
              <label>{{ t('epsSupplier') }}</label>
              <select
                class="ep-line-select"
                :value="draft(line.id).supplierType || 'AGENCY'"
                @change="onSupplierTypeChange(line, $event.target.value)"
              >
                <option value="CDI">{{ t('epsInternalCdi') }}</option>
                <option value="CDD">{{ t('epsInternalCdd') }}</option>
                <option value="AGENCY">{{ t('epsAgency') }}</option>
              </select>
            </div>

            <div class="ep-line-field">
              <label>{{ t('epsName') }}</label>
              <select
                v-if="isInternal(line) && personsFor(line).length"
                class="ep-line-select ep-line-name"
                :value="draft(line.id).personId || ''"
                @change="onPersonChange(line, $event.target.value)"
              >
                <option value="" disabled>—</option>
                <option v-for="p in personsFor(line)" :key="p.id" :value="p.id">
                  {{ p.firstName }} {{ p.lastName }}
                </option>
              </select>
              <input
                v-else
                type="text"
                class="ep-line-input ep-line-name"
                :value="draft(line.id).personLabel || ''"
                @input="setField(line, 'personLabel', $event.target.value)"
              />
            </div>

            <div class="ep-line-field">
              <label>{{ t('epsRate') }}</label>
              <NumberField
                :decimals="2" :min="0" pad grouping :empty-value="0"
                class="ep-line-input ep-line-rate"
                :model-value="draft(line.id).hourlyRate"
                @change="setField(line, 'hourlyRate', $event)"
              />
            </div>

            <div class="ep-line-field ep-line-slider">
              <label>{{ t('epsSchedule') }}</label>
              <div class="dr">
                <div class="dr-track"></div>
                <div
                  class="dr-range"
                  :style="rangeStyle(draft(line.id).startMin, draft(line.id).endMin)"
                ></div>
                <input
                  type="range" :min="bounds.min" :max="bounds.max" :step="STEP"
                  :value="draft(line.id).startMin"
                  :aria-label="t('epsStart')"
                  @input="onSlider(line, 'startMin', Number($event.target.value))"
                />
                <input
                  type="range" :min="bounds.min" :max="bounds.max" :step="STEP"
                  :value="draft(line.id).endMin"
                  :aria-label="t('epsEnd')"
                  @input="onSlider(line, 'endMin', Number($event.target.value))"
                />
              </div>
              <div class="ep-line-times">
                <span>{{ fmtTime(draft(line.id).startMin) }}</span>
                <span>{{ durationLabel(line) }}</span>
                <span>{{ fmtTime(draft(line.id).endMin) }}</span>
              </div>
            </div>

            <span class="ep-line-total">{{ eur(lineTotal(line)) }}</span>

            <button
              v-if="line.source === 'MANUAL'"
              class="eps-del-btn"
              :aria-label="t('epsDeleteLine')"
              :disabled="saving"
              @click="onRemoveLine(line)"
            >
              <v-icon size="14">mdi-trash-can-outline</v-icon>
            </button>
          </div>
        </div>
      </div>

      <!-- Totaux event + RZ (§5 : coûtEvent = Σ pdv + coût RZ) -->
      <div v-if="totals" class="eps-totals">
        <span class="ep-revenue-pill">
          <span class="ep-revenue-label">{{ t('epsEventPredicted') }}</span>
          <strong>{{ eur(totals.predictedCost) }}</strong>
        </span>
        <span class="ep-revenue-pill ep-revenue-pill-adjusted">
          <span class="ep-revenue-label">{{ t('epsEventAdjusted') }}</span>
          <strong>{{ eur(totals.adjustedCost) }}</strong>
        </span>
        <span class="ep-revenue-pill">
          <span class="ep-revenue-label">RZ</span>
          <strong>{{ totals.zoneManagers }} × {{ eur(totals.zoneManagerRate) }}/h</strong>
        </span>
        <!-- RH-2 : lecture seule des réglages RH résolus pour cet espace (déjà
             renvoyés par GET /events/:id/staffing, aucun nouvel appel). Édition
             sur la page RH Settings. -->
        <span v-if="settings" class="ep-revenue-pill eps-settings-pill">
          <span class="ep-revenue-label">{{ t('epsGoalTpe') }}</span>
          <strong>{{ settings.goalTpe != null ? eur(settings.goalTpe) : '—' }}</strong>
          <span class="ep-revenue-label eps-settings-sep">{{ t('epsStaffPerZone') }}</span>
          <strong>{{ settings.staffPerZoneManager ?? '—' }}</strong>
        </span>
        <router-link :to="{ name: 'hr-settings' }" class="eps-settings-link" :title="t('epsEditSettings')">
          <v-icon size="15">mdi-cog-outline</v-icon>
        </router-link>
      </div>
    </template>
  </div>
</template>

<script setup>
/**
 * Onglet « Staff » d'EventPredict (spec RH §3) — une carte par PDV calquée sur
 * `ep-shop-card`, une ligne par personne planifiée. Toute modification PATCH la
 * ligne (debounce 500 ms) puis rafraîchit pills + totaux via le store staffing.
 * Le coût PRÉDIT ne bouge jamais (figé à la génération) ; seul l'AJUSTÉ vit.
 */
import { computed, onMounted, reactive, ref, watch, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'
import { t } from '@/i18n'
import { getHrPersons } from '@/api/endpoints/hr.api'
import NumberField from '@/components/common/NumberField.vue'
import { formatCurrencyDetailed } from '@/composables/useFormatters'

const PATCH_DEBOUNCE_MS = 500
const STEP = 15 // minutes

const props = defineProps({
  eventId: { type: String, required: true },
})

const store = useStore()
const fetching = computed(() => store.getters['staffing/fetching'])
const saving = computed(() => store.getters['staffing/saving'])
const elements = computed(() => store.getters['staffing/elements'])
const totals = computed(() => store.getters['staffing/totals'])
const settings = computed(() => store.getters['staffing/settings'])
const warnings = computed(() => store.getters['staffing/warnings'])
const schedule = computed(() => store.getters['staffing/schedule'])
const warningTitle = computed(() => warnings.value.map((w) => w.code).join(' · '))
const generateError = ref('')
// Vrai après un generate résolu : distingue « jamais généré » d'une génération vide.
const hasGeneratedOnce = ref(false)

// ── Temps : minutes depuis minuit du jour de début de fenêtre ────────────────
const dayStart = computed(() => {
  const s = schedule.value?.startTime ? new Date(schedule.value.startTime) : new Date()
  const d = new Date(s)
  d.setHours(0, 0, 0, 0)
  return d
})
const toMin = (iso) => Math.round((new Date(iso).getTime() - dayStart.value.getTime()) / 60_000)
const toIso = (min) => new Date(dayStart.value.getTime() + min * 60_000).toISOString()
const bounds = computed(() => ({
  min: schedule.value ? toMin(schedule.value.startTime) : 0,
  max: schedule.value ? toMin(schedule.value.endTime) : 24 * 60,
}))
function fmtTime(min) {
  const h = Math.floor(min / 60) % 24
  const m = ((min % 60) + 60) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function eur(v) {
  return formatCurrencyDetailed(Number(v) || 0)
}
function initials(name) {
  return String(name || '?').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

// ── Brouillons locaux (une entrée par ligne) + PATCH debouncé 500 ms ─────────
const drafts = reactive({})
const timers = {}

function syncDrafts() {
  for (const el of elements.value) {
    for (const line of el.lines) {
      // Ne pas écraser un brouillon avec un PATCH encore en vol.
      if (timers[line.id]) continue
      drafts[line.id] = {
        enabled: line.enabled,
        supplierType: line.supplierType,
        supplierId: line.supplierId,
        personId: line.personId,
        personLabel: line.personLabel,
        hourlyRate: line.hourlyRate,
        startMin: toMin(line.startTime),
        endMin: toMin(line.endTime),
      }
    }
  }
}
watch(elements, syncDrafts, { immediate: true })

function draft(lineId) {
  return drafts[lineId] || { enabled: true, hourlyRate: 0, startMin: bounds.value.min, endMin: bounds.value.max }
}

function schedulePatch(line) {
  clearTimeout(timers[line.id])
  timers[line.id] = setTimeout(async () => {
    const d = drafts[line.id]
    try {
      await store.dispatch('staffing/patchLine', {
        lineId: line.id,
        enabled: d.enabled,
        supplierType: d.supplierType,
        supplierId: d.supplierId,
        personId: d.personId,
        personLabel: d.personLabel,
        hourlyRate: d.hourlyRate,
        startTime: toIso(d.startMin),
        endTime: toIso(d.endMin),
      })
    } finally {
      delete timers[line.id]
    }
  }, PATCH_DEBOUNCE_MS)
}
onBeforeUnmount(() => Object.values(timers).forEach(clearTimeout))

function setField(line, field, value) {
  const d = drafts[line.id]
  if (!d) return
  d[field] = value
  schedulePatch(line)
}
function onSlider(line, field, value) {
  const d = drafts[line.id]
  if (!d) return
  if (field === 'startMin') d.startMin = Math.min(value, d.endMin - STEP)
  else d.endMin = Math.max(value, d.startMin + STEP)
  schedulePatch(line)
}
function rangeStyle(startMin, endMin) {
  const { min, max } = bounds.value
  const span = Math.max(max - min, 1)
  const lo = ((startMin - min) / span) * 100
  const hi = ((endMin - min) / span) * 100
  return { left: `${lo}%`, width: `${hi - lo}%` }
}
function lineTotal(line) {
  const d = draft(line.id)
  if (!d.enabled) return 0
  return (d.hourlyRate || 0) * Math.max(d.endMin - d.startMin, 0) / 60
}
function durationLabel(line) {
  const d = draft(line.id)
  return `${((d.endMin - d.startMin) / 60).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`
}

// ── Personnes internes (dropdown « Nom » si CDI/CDD) ─────────────────────────
const persons = ref([])
function isInternal(line) {
  const type = draft(line.id).supplierType
  return type === 'CDI' || type === 'CDD'
}
function personsFor(line) {
  const d = draft(line.id)
  return persons.value.filter(
    (p) => p.active && p.contractType === d.supplierType && (!line.roleId || p.roleId === line.roleId),
  )
}
function onSupplierTypeChange(line, value) {
  const d = drafts[line.id]
  d.supplierType = value
  if (value === 'AGENCY') {
    d.personId = null
  } else {
    const first = personsFor(line)[0]
    d.personId = first?.id ?? null
    d.personLabel = first ? `${first.firstName} ${first.lastName}` : d.personLabel
  }
  schedulePatch(line)
}
function onPersonChange(line, personId) {
  const d = drafts[line.id]
  const p = persons.value.find((x) => x.id === personId)
  d.personId = personId || null
  if (p) {
    d.personLabel = `${p.firstName} ${p.lastName}`
    if (p.hourlyRate != null) d.hourlyRate = p.hourlyRate
  }
  schedulePatch(line)
}

// ── Actions carte / section ──────────────────────────────────────────────────
async function onGenerate() {
  generateError.value = ''
  try {
    await store.dispatch('staffing/generate', props.eventId)
    // Succès mais potentiellement 0 ligne créée → arme le bandeau explicatif
    // de l'état vide (BUG-258-01) ; sans effet si des cartes s'affichent.
    hasGeneratedOnce.value = true
  } catch (e) {
    generateError.value = e?.response?.data?.message || t('epsGenerateError')
  }
}
async function onAddLine(elementId) {
  await store.dispatch('staffing/addLine', { eventId: props.eventId, elementId })
}
async function onRemoveLine(line) {
  await store.dispatch('staffing/removeLine', line.id)
}

onMounted(async () => {
  store.dispatch('staffing/fetchStaffing', { eventId: props.eventId }).catch(() => {})
  try {
    persons.value = await getHrPersons()
  } catch (_) {
    persons.value = []
  }
})
</script>

<style scoped>
/* Chrome fidèle aux cartes ep-shop-card d'EventPredictMenusSection (styles
   scoped là-bas → répliqués ici avec les mêmes valeurs / tokens --fb-*). */
.eps-root { min-width: 0; }

.eps-empty {
  padding: 40px 16px;
  text-align: center;
  border: 1px dashed var(--fb-border-strong, #d1d5db);
  border-radius: var(--fb-radius-card, 16px);
  background: var(--fb-subtle, #fafafa);
}
.eps-empty-text { margin: 0 0 14px; color: var(--fb-muted, #6b7280); font-size: 0.875rem; }
.eps-error { margin: 10px 0 0; color: var(--fb-danger, #dc2626); font-size: 0.75rem; }
.eps-empty-alert { margin-top: 14px; max-width: 560px; text-align: left; font-size: 0.8125rem; }

.eps-generate-btn {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 16px;
  border: 1.5px solid rgba(255, 49, 49, 0.32);
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-primary-soft, #fff5f5);
  color: #ff3131;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.eps-generate-btn:hover:not(:disabled) { border-color: #ff3131; background: #ff3131; color: #fff; }
.eps-generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.eps-generate-btn--ghost { min-height: 30px; }

.eps-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.eps-warning-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--fb-warning-soft, #fffbeb);
  border: 1px solid rgba(217, 119, 6, 0.35);
  color: var(--fb-warning, #d97706);
  font-size: 0.6875rem;
  font-weight: 700;
}

/* ── Carte PDV (valeurs ep-shop-card) ── */
.ep-shop-card {
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-card, 16px);
  background: var(--fb-surface, #ffffff);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
  margin-bottom: 12px;
  overflow: hidden;
}
.ep-shop-card-header { padding: 18px 20px; background: var(--fb-surface, #ffffff); }
.ep-shop-card-grid { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ep-shop-card-main { display: flex; align-items: flex-start; gap: 14px; flex: 1 1 auto; min-width: 0; }
.ep-shop-card-image {
  width: 56px; height: 56px; border-radius: 10px; flex-shrink: 0;
  border: 1px solid var(--fb-border, #e5e7eb);
  background: linear-gradient(135deg, #ff3131, #e84444);
  color: #fff; font-weight: 800; font-size: 1rem;
  display: flex; align-items: center; justify-content: center;
}
.ep-shop-card-content { flex: 1 1 auto; min-width: 0; }
.ep-shop-card-title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ep-shop-card-title {
  min-width: 0; font-size: 16px; font-weight: 700; line-height: 1.25;
  letter-spacing: -0.01em; color: var(--fb-text, #212121);
}
.ep-shop-card-subtitle { font-size: 0.75rem; color: var(--fb-muted, #6b7280); margin-top: 2px; }
.ep-shop-card-revenue { flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; flex-wrap: wrap; }

.ep-revenue-pill {
  display: inline-flex; align-items: baseline; gap: 5px; min-height: 28px;
  padding: 5px 11px; border: 1.5px solid var(--fb-border, #e5e7eb);
  border-radius: 999px; background: var(--fb-subtle, #fafafa);
  color: var(--fb-muted, #6b7280); font-size: 0.75rem; line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
.ep-revenue-pill strong { font-size: 0.875rem; font-weight: 800; color: var(--fb-text, #212121); }
.ep-revenue-label { color: var(--fb-muted, #64748b); font-weight: 650; }
.ep-revenue-pill-adjusted { border-color: rgba(255, 49, 49, 0.35); background: var(--fb-primary-soft, #fff5f5); }
.ep-revenue-pill-adjusted strong { color: #ff3131; }

.ep-shop-adjustment { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--fb-border, #e5e7eb); }
.ep-shop-adjustment-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ep-shop-slider-label { font-size: 0.8125rem; font-weight: 500; color: var(--fb-muted, #475569); font-variant-numeric: tabular-nums; }

.eps-add-btn {
  display: inline-flex; align-items: center; min-height: 30px; padding: 0 12px;
  border: 1.5px solid rgba(255, 49, 49, 0.32);
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-primary-soft, #fff5f5);
  color: #ff3131; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.15s;
}
.eps-add-btn:hover:not(:disabled) { border-color: #ff3131; background: #ff3131; color: #fff; }
.eps-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Lignes staff (valeurs ep-menu-item-row : padding 12, radius 8) ── */
.ep-staff-lines { border-top: 1px solid var(--fb-border, #e5e7eb); padding: 12px; }
.ep-menu-item-row {
  display: flex; align-items: center; gap: 12px; padding: 12px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-surface, #ffffff);
  margin-bottom: 12px; min-width: 0; flex-wrap: wrap;
}
.ep-menu-item-row:last-child { margin-bottom: 0; }
.ep-menu-item-row.is-disabled { opacity: 0.5; background: var(--fb-subtle, #fafafa); }
.ep-line-check { width: 16px; height: 16px; accent-color: #ff3131; cursor: pointer; flex-shrink: 0; }
.ep-role-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 96px; padding: 3px 10px; border-radius: 999px;
  background: var(--fb-subtle, #fafafa); border: 1px solid var(--fb-border, #e5e7eb);
  font-size: 0.75rem; font-weight: 700; color: var(--fb-text, #212121); white-space: nowrap;
}
.ep-role-badge.role-warn {
  border-color: rgba(217, 119, 6, 0.5);
  background: var(--fb-warning-soft, #fffbeb);
  color: var(--fb-warning, #d97706);
}
.eps-manual-tag { font-size: 0.6875rem; color: #ff3131; font-weight: 700; }

.ep-line-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ep-line-field label {
  font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--fb-faint, #9ca3af);
}
.ep-line-select, .ep-line-input {
  height: 30px; border: 1.5px solid var(--fb-border, #e5e7eb);
  border-radius: 8px; background: var(--fb-subtle, #fafafa);
  color: var(--fb-text, #212121); font-size: 0.8125rem; padding: 0 8px; min-width: 0;
}
.ep-line-select:focus, .ep-line-input:focus {
  border-color: #ff3131; outline: none; box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1);
}
.ep-line-rate { width: 76px; text-align: center; font-variant-numeric: tabular-nums; }
.ep-line-name { width: 150px; }
.ep-line-slider { flex: 1 1 190px; min-width: 170px; }
.ep-line-times {
  display: flex; justify-content: space-between; font-size: 0.6875rem;
  color: var(--fb-muted, #6b7280); font-variant-numeric: tabular-nums; margin-top: 3px;
}
.ep-line-total {
  margin-left: auto; font-size: 0.875rem; font-weight: 800;
  font-variant-numeric: tabular-nums; color: var(--fb-text, #212121);
  white-space: nowrap; min-width: 84px; text-align: right;
}
.ep-menu-item-row.is-disabled .ep-line-total { text-decoration: line-through; color: var(--fb-faint, #9ca3af); }

.eps-del-btn {
  width: 28px; height: 28px; border: 0; border-radius: 8px;
  background: var(--fb-subtle, #f3f4f6); color: var(--fb-muted, #6b7280);
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
}
.eps-del-btn:hover:not(:disabled) { background: var(--fb-danger-soft, #fef2f2); color: #ff3131; }

/* ── Dual-range slider (look du Slider EP : track 14px, range #ff3131, thumb 18px) ── */
.dr { position: relative; height: 22px; min-width: 0; }
.dr-track {
  position: absolute; top: 50%; transform: translateY(-50%); left: 0; right: 0;
  height: 14px; border-radius: 9999px; background: #e7e7eb;
}
.dr-range {
  position: absolute; top: 50%; transform: translateY(-50%);
  height: 14px; border-radius: 9999px; background: #ff3131;
}
.dr input[type='range'] {
  position: absolute; inset: 0; width: 100%; height: 22px; margin: 0;
  -webkit-appearance: none; appearance: none; background: none; pointer-events: none;
}
.dr input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; pointer-events: auto;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--fb-surface, #ffffff); border: 2px solid #ff3131;
  box-shadow: 0 1px 6px rgba(15, 23, 42, 0.2); cursor: pointer;
}
.dr input[type='range']::-moz-range-thumb {
  pointer-events: auto; width: 14px; height: 14px; border-radius: 50%;
  background: var(--fb-surface, #ffffff); border: 2px solid #ff3131;
  box-shadow: 0 1px 6px rgba(15, 23, 42, 0.2); cursor: pointer;
}

.eps-totals {
  display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
  margin-top: 4px; padding: 12px 14px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-panel, 12px);
  background: var(--fb-surface, #ffffff);
}
.eps-settings-pill { margin-left: auto; }
.eps-settings-sep { margin-left: 10px; }
.eps-settings-link {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 8px;
  border: 1.5px solid var(--fb-border, #e5e7eb);
  color: var(--fb-muted, #6b7280); flex-shrink: 0;
}
.eps-settings-link:hover { border-color: #ff3131; color: #ff3131; }

@media (max-width: 900px) {
  .ep-menu-item-row { gap: 8px; }
  .ep-line-total { width: 100%; text-align: left; margin-left: 0; }
}
</style>
