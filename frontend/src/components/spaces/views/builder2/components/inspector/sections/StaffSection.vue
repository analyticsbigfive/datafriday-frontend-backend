<template>
  <SectionCard :title="t('b2StaffTitle')" icon="mdi-account-hard-hat" default-open>
    <template #meta>
      <v-chip size="x-small" variant="tonal">{{ totalCount }}</v-chip>
    </template>

    <!-- Ajout d'un poste : intitulé + effectif + bouton + -->
    <div class="stf-add">
      <input
        v-model="newPosition"
        type="text"
        class="stf-input stf-input--pos"
        :placeholder="t('b2PositionPlaceholder')"
        @keyup.enter="addRow"
      />
      <input
        v-model.number="newCount"
        type="number"
        min="1"
        class="stf-input stf-input--count"
      />
      <button
        type="button"
        class="stf-add-btn"
        :disabled="!newPosition.trim()"
        :title="t('b2Add')"
        @click="addRow"
      >
        <v-icon icon="mdi-plus" size="18" />
      </button>
    </div>

    <!-- Liste des postes -->
    <div v-if="staff.length" class="stf-list">
      <div v-for="(row, index) in staff" :key="index" class="stf-row">
        <span class="stf-row__name">{{ row.position }}</span>
        <input
          :value="row.count"
          type="number"
          min="0"
          class="stf-input stf-input--count"
          @change="(e) => updateCount(index, e.target.value)"
        />
        <button
          type="button"
          class="stf-row__remove"
          :title="t('b2Remove')"
          @click="removeRow(index)"
        >
          <v-icon icon="mdi-close" size="14" />
        </button>
      </div>
    </div>

    <!-- État vide -->
    <div v-else class="stf-empty">{{ t('b2NoStaffYet') }}</div>
  </SectionCard>
</template>

<script setup>
import { ref, computed, inject } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'
import { putElementStaff } from '@/api/endpoints/builder-v2.api'

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

const newPosition = ref('')
const newCount = ref(1)

function save(next) {
  const el = element.value
  if (!el) return
  const cfgId = store.state.activeConfigId || undefined
  store.patchElementLocal(el.id, {
    staffByConfig: { ...(el.staffByConfig || {}), [cfgId || '']: next },
  })
  store.queue.push(() => putElementStaff(el.id, next, cfgId), {
    key: `staff:${el.id}:${cfgId || ''}`,
    onError: (err) => store.notify(err?.response?.data?.message || t('b2ToastSaveStaffFailed')),
  })
}

function addRow() {
  if (!newPosition.value.trim()) return
  const count = Math.max(1, parseInt(newCount.value, 10) || 1)
  save([...staff.value, { position: newPosition.value.trim(), count }])
  newPosition.value = ''
  newCount.value = 1
}

function removeRow(index) {
  save(staff.value.filter((_, i) => i !== index))
}

function updateCount(index, raw) {
  const count = Math.max(0, parseInt(raw, 10) || 0)
  save(staff.value.map((row, i) => (i === index ? { ...row, count } : row)))
}
</script>

<style scoped>
.stf-add {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Champs stylisés (fond clair, arrondi, focus rouge). */
.stf-input {
  padding: 10px 12px;
  font-size: 13.5px;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid transparent;
  border-radius: 10px;
  outline: none;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.stf-input::placeholder { color: rgba(var(--v-theme-on-surface), 0.4); }
.stf-input:hover { background: rgba(var(--v-theme-on-surface), 0.07); }
.stf-input:focus {
  background: rgb(var(--v-theme-surface));
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}
.stf-input--pos { flex: 1; min-width: 0; }
.stf-input--count {
  width: 64px;
  text-align: center;
  -moz-appearance: textfield;
}
.stf-input--count::-webkit-outer-spin-button,
.stf-input--count::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

/* Bouton + (façon capture). */
.stf-add-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: #6b7280;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.stf-add-btn:hover:not(:disabled) { background: #4b5563; }
.stf-add-btn:disabled { opacity: 0.45; cursor: default; }

/* État vide. */
.stf-empty {
  margin-top: 18px;
  text-align: center;
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

/* Liste des postes. */
.stf-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}
.stf-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 2px;
}
.stf-row__name {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stf-row__remove {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.5);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.stf-row__remove:hover { background: rgba(255, 49, 49, 0.08); color: #ff3131; }
</style>
