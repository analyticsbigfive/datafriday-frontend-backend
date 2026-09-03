<template>
  <v-dialog :model-value="modelValue" max-width="640" @update:model-value="$emit('update:modelValue', $event)">
    <v-card class="lshd-card">
      <v-card-title class="lshd-title">
        <v-icon size="20" class="mr-2">mdi-history</v-icon>
        {{ t('anLiveHistoryTitle') }}
      </v-card-title>

      <v-card-text>
        <div class="lshd-section-label">{{ t('anLiveHistorySalesTitle') }}</div>
        <div v-if="salesLoading" class="lshd-loading">{{ t('anLiveHistoryLoading') }}</div>
        <div v-else-if="!sales.length" class="lshd-empty">{{ t('anLiveHistoryEmpty') }}</div>
        <template v-else>
          <div class="lshd-sales-actions">
            <button type="button" class="lshd-purge-btn" :disabled="!selectedIds.length || purging" @click="purgeSelected">
              <v-icon size="14" class="mr-1">mdi-delete-sweep-outline</v-icon>
              {{ t('anLiveHistoryPurgeSelected') }} ({{ selectedIds.length }})
            </button>
          </div>
          <table class="lshd-table">
            <thead>
              <tr>
                <th class="lshd-col-check"></th>
                <th>{{ t('anLiveHistoryColElement') }}</th>
                <th>{{ t('anLiveHistoryColItems') }}</th>
                <th>{{ t('anLiveHistoryColAmount') }}</th>
                <th>{{ t('anLiveHistoryColDate') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sale in sales" :key="sale.id">
                <td class="lshd-col-check">
                  <input type="checkbox" :value="sale.id" v-model="selectedIds" />
                </td>
                <td>{{ sale.elementName || sale.elementId || '—' }}</td>
                <td>{{ itemsSummary(sale.items) }}</td>
                <td>{{ formatAmount(sale.amount) }}</td>
                <td>{{ formatDate(sale.transactionDate) }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <div class="lshd-section-label lshd-section-label--runs">{{ t('anLiveHistoryRunsTitle') }}</div>
        <div v-if="runsLoading" class="lshd-loading">{{ t('anLiveHistoryLoading') }}</div>
        <div v-else-if="!runs.length" class="lshd-empty">{{ t('anLiveHistoryRunsEmpty') }}</div>
        <table v-else class="lshd-table">
          <thead>
            <tr>
              <th>{{ t('anLiveHistoryColStatus') }}</th>
              <th>{{ t('anLiveHistoryColInterval') }}</th>
              <th>{{ t('anLiveHistoryColTicks') }}</th>
              <th>{{ t('anLiveHistoryColStarted') }}</th>
              <th>{{ t('anLiveHistoryColStopped') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="run in runs" :key="run.id">
              <td><span class="lshd-status-pill" :class="`lshd-status-pill--${run.status}`">{{ run.status }}</span></td>
              <td>{{ Math.round((run.intervalMs || 0) / 1000) }}s</td>
              <td>{{ run.tickCount }}</td>
              <td>{{ formatDate(run.startedAt) }}</td>
              <td>{{ formatDate(run.stoppedAt) }}</td>
            </tr>
          </tbody>
        </table>

        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">{{ t('anLiveHistoryClose') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
// Historique + purge sélective des ventes simulées QA, et historique des runs
// d'auto-simulation — 11_LIVE.md, ouvert depuis LiveSaleSimulatorWidget.vue (icône
// mdi-history). Deux sections simples, pas d'onglet : la liste des ventes ne se veut
// pas exhaustive (limit=50), juste assez pour purger sélectivement après un test.
import { ref, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import store from '@/store'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  spaceId: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const sales = ref([])
const runs = ref([])
const salesLoading = ref(false)
const runsLoading = ref(false)
const selectedIds = ref([])
const purging = ref(false)
const error = ref(null)

async function loadAll() {
  error.value = null
  selectedIds.value = []
  salesLoading.value = true
  runsLoading.value = true
  try {
    const res = await store.dispatch('logistics/loadSimulatedSalesHistory', { spaceId: props.spaceId, limit: 50 })
    sales.value = res?.items || []
  } catch (e) {
    error.value = e?.userMessage || t('anLiveHistoryLoadError')
  } finally {
    salesLoading.value = false
  }
  try {
    runs.value = await store.dispatch('logistics/loadSimulationRuns', { spaceId: props.spaceId, limit: 20 })
  } catch (e) {
    // Best-effort — la section runs reste juste vide si l'appel échoue, la section
    // ventes (plus utile pour purger) n'est pas bloquée par ça.
  } finally {
    runsLoading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => { if (open) loadAll() },
)

async function purgeSelected() {
  if (!selectedIds.value.length) return
  purging.value = true
  error.value = null
  try {
    await store.dispatch('logistics/purgeSimulatedSalesByIds', { spaceId: props.spaceId, transactionIds: [...selectedIds.value] })
    await loadAll()
  } catch (e) {
    error.value = e?.userMessage || t('anLiveHistoryPurgeError')
  } finally {
    purging.value = false
  }
}

function itemsSummary(items) {
  if (!items?.length) return '—'
  return items.map((i) => `${i.productName || i.productId || '?'} ×${i.quantity}`).join(', ')
}
function formatAmount(amount) {
  const n = Number(amount)
  return Number.isFinite(n) ? `${n.toFixed(2)} €` : '—'
}
function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}
</script>

<style scoped>
.lshd-card {
  padding: 4px 0;
}
.lshd-title {
  display: flex;
  align-items: center;
  font-size: 1.05rem;
}
.lshd-section-label {
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  opacity: 0.7;
  margin-bottom: 6px;
}
.lshd-section-label--runs {
  margin-top: 18px;
}
.lshd-loading,
.lshd-empty {
  font-size: 0.82rem;
  opacity: 0.65;
  padding: 8px 0;
}
.lshd-sales-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 6px;
}
.lshd-purge-btn {
  border: 1px solid rgba(255, 49, 49, 0.5);
  background: transparent;
  color: #ff3131;
  border-radius: 6px;
  font-size: 0.75rem;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.lshd-purge-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.lshd-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}
.lshd-table th {
  text-align: left;
  opacity: 0.65;
  font-weight: 500;
  padding: 4px 6px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}
.lshd-table td {
  padding: 4px 6px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.12);
}
.lshd-col-check {
  width: 28px;
}
.lshd-status-pill {
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.25);
}
.lshd-status-pill--active {
  background: rgba(76, 175, 80, 0.25);
  color: #4caf50;
}
.lshd-status-pill--failed {
  background: rgba(255, 49, 49, 0.25);
  color: #ff3131;
}
</style>
