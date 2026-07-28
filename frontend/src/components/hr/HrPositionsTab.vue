<template>
  <div class="hrt-root">
    <!-- Bandeau rouge (pattern Settings) -->
    <div class="hr-banner">
      <div class="hr-banner__icon"><BriefcaseBusiness :size="24" color="white" /></div>
      <div class="hr-banner__titles">
        <HrTabSwitcher active="positions" @switch="$emit('switch-tab', $event)" />
        <p class="hr-banner__subtitle">{{ t('hrPositionsSubtitle') }}</p>
      </div>
      <div class="hr-banner__actions">
        <button class="hr-banner__btn" @click="exportCsv"><Download :size="15" /> {{ t('hrCsvExport') }}</button>
        <button class="hr-banner__btn" @click="fileInput?.click()"><Upload :size="15" /> {{ t('hrCsvImport') }}</button>
        <input ref="fileInput" type="file" accept=".csv" class="d-none" @change="importCsv" />
        <button class="hr-banner__btn hr-banner__btn--primary" @click="openAdd"><Plus :size="15" /> {{ t('hrPositionsAdd') }}</button>
      </div>
    </div>

    <!-- Recherche (pleine largeur, collée sous le bandeau) -->
    <div class="hr-searchbar">
      <Search :size="18" class="hr-searchbar__icon" />
      <input v-model="search" class="hr-searchbar__input" type="search" :placeholder="t('hrPositionsSearch')" />
      <span class="hr-searchbar__count">{{ filtered.length }} {{ t('hrPositionsCount') }}</span>
      <button v-if="search" class="hr-searchbar__clear" :aria-label="t('hrCancel')" @click="search = ''"><X :size="16" /></button>
    </div>

    <!-- Table -->
    <div class="hrt-content">
    <v-card flat border class="hrt-card">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>{{ t('hrColSupplier') }}</th>
            <th>{{ t('hrColSector') }}</th>
            <th>{{ t('hrColPosition') }}</th>
            <th>{{ t('hrColRate') }}</th>
            <th class="text-right">{{ t('hrColActions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!filtered.length">
            <td colspan="5" class="text-center text-medium-emphasis py-8">
              {{ t('hrPositionsEmpty') }}
            </td>
          </tr>
          <tr v-for="p in filtered" :key="p.id">
            <td class="font-weight-medium">{{ supplierName(p.supplierId) }}</td>
            <td>{{ p.sector || '—' }}</td>
            <td>{{ p.positionName || '—' }}</td>
            <td>{{ formatRate(p.ratePerHour) }}</td>
            <td class="text-right text-no-wrap">
              <v-btn icon="mdi-pencil" size="x-small" variant="text" :aria-label="t('hrEdit')" @click="openEdit(p)" />
              <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="#ff3131" :aria-label="t('hrDelete')" @click="deleteTarget = p" />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
    </div>

    <!-- Drawer création / édition -->
    <HrPositionFormDrawer
      v-model="drawer"
      :mode="drawerMode"
      :initial="drawerInitial"
      :suppliers="suppliers"
      :position-names="positionNames"
      :is-dark="isDark"
      @submit="onSubmit"
    />

    <!-- Suppression -->
    <HrDeleteDialog
      :model-value="!!deleteTarget"
      :item-name="deleteTarget?.positionName || ''"
      :is-dark="isDark"
      @update:model-value="(v) => { if (!v) deleteTarget = null }"
      @confirm="remove"
    />

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { BriefcaseBusiness, Download, Plus, Search, Upload, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import * as hrApi from '@/utils/hrApi'
import { csvEscape, downloadCsv, newId, parseCsv } from './hrShared'
import HrPositionFormDrawer from './HrPositionFormDrawer.vue'
import HrDeleteDialog from './HrDeleteDialog.vue'
import HrTabSwitcher from './HrTabSwitcher.vue'
import './hrForms.css'

defineProps({ isDark: { type: Boolean, default: false } })
defineEmits(['switch-tab'])

const positions = ref([])
const suppliers = ref([])
const positionNames = ref([])
const search = ref('')
const drawer = ref(false)
const drawerMode = ref('create')
const drawerInitial = ref(null)
const deleteTarget = ref(null)
const snack = reactive({ show: false, text: '', color: 'success' })
const fileInput = ref(null)

function notify(text, color = 'success') {
  snack.text = text
  snack.color = color
  snack.show = true
}

async function load() {
  const [positionRows, supplierRows, nameRows] = await Promise.all([
    hrApi.getAllStaffPositions(),
    hrApi.getAllHRSuppliers(),
    hrApi.getAllPositionNames(),
  ])
  positions.value = Array.isArray(positionRows) ? positionRows : []
  suppliers.value = Array.isArray(supplierRows) ? supplierRows : []
  positionNames.value = Array.isArray(nameRows) ? nameRows : []
}
onMounted(load)

const supplierById = computed(() => Object.fromEntries(suppliers.value.map((s) => [s.id, s])))
function supplierName(id) {
  return supplierById.value[id]?.name || '—'
}
function formatRate(rate) {
  return typeof rate === 'number' && !Number.isNaN(rate) ? `€${rate.toFixed(2)}` : '—'
}

const filtered = computed(() => {
  const q = search.value?.trim().toLowerCase()
  if (!q) return positions.value
  return positions.value.filter((p) =>
    [supplierName(p.supplierId), p.sector, p.positionName].some((v) => (v || '').toLowerCase().includes(q))
  )
})

function openAdd() {
  drawerMode.value = 'create'
  drawerInitial.value = null
  drawer.value = true
}
function openEdit(p) {
  drawerMode.value = 'edit'
  drawerInitial.value = p
  drawer.value = true
}

async function onSubmit(payload) {
  try {
    if (drawerMode.value === 'edit') await hrApi.updateStaffPosition(payload)
    else await hrApi.createStaffPosition(payload)
    // Mémorise le nom de poste s'il est nouveau pour ce secteur (alimente le datalist).
    const known = positionNames.value.some((n) => n.name === payload.positionName && n.sector === payload.sector)
    if (!known) {
      await hrApi.createPositionName({ id: newId(), name: payload.positionName, sector: payload.sector })
    }
    await load()
    drawer.value = false
    notify(t('hrSaved'))
  } catch (e) {
    notify(t('hrSaveError'), 'error')
  }
}

async function remove() {
  try {
    await hrApi.deleteStaffPosition(deleteTarget.value.id)
    deleteTarget.value = null
    await load()
    notify(t('hrDeleted'))
  } catch (e) {
    notify(t('hrSaveError'), 'error')
  }
}

// ---- CSV ----
const CSV_HEADERS = ['supplier', 'sector', 'positionName', 'ratePerHour']

function exportCsv() {
  if (!positions.value.length) return notify(t('hrCsvNothing'), 'error')
  const lines = [CSV_HEADERS.join(',')]
  for (const p of positions.value) {
    lines.push([
      csvEscape(supplierName(p.supplierId)),
      csvEscape(p.sector),
      csvEscape(p.positionName),
      csvEscape(p.ratePerHour),
    ].join(','))
  }
  downloadCsv('hr-staff-positions.csv', lines.join('\n'))
  notify(t('hrCsvExported'))
}

async function importCsv(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const { headers, rows } = parseCsv(await file.text())
    const idx = (k) => headers.indexOf(k)
    if (idx('supplier') === -1 || idx('positionName') === -1) return notify(t('hrCsvBadFile'), 'error')
    const idByName = Object.fromEntries(suppliers.value.map((s) => [s.name.toLowerCase(), s.id]))
    let created = 0
    for (const row of rows) {
      const supplierId = idByName[row[idx('supplier')]?.trim().toLowerCase()]
      const positionName = row[idx('positionName')]?.trim()
      if (!supplierId || !positionName) continue
      const sector = row[idx('sector')]?.trim() || ''
      const duplicate = positions.value.some(
        (p) => p.supplierId === supplierId && p.sector === sector && p.positionName === positionName
      )
      if (duplicate) continue
      await hrApi.createStaffPosition({
        id: newId(),
        supplierId,
        sector,
        positionName,
        ratePerHour: Number(row[idx('ratePerHour')]) || 0,
      })
      created += 1
    }
    await load()
    notify(`${created} ${t('hrCsvImported')}`)
  } catch (e) {
    notify(t('hrCsvBadFile'), 'error')
  }
}
</script>

<style scoped>
.hrt-root { padding: 0; }
.hrt-content { padding: 24px; }
.hrt-card :deep(th) { font-size: var(--fs-sm); text-transform: uppercase; letter-spacing: 0.3px; color: #64748b; white-space: nowrap; }
</style>
