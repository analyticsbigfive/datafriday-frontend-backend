<template>
  <div class="hrt-root">
    <!-- Barre outils -->
    <div class="hrt-toolbar">
      <v-text-field
        v-model="search"
        :placeholder="t('hrPositionsSearch')"
        prepend-inner-icon="mdi-magnify"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        class="hrt-search"
      />
      <span class="hrt-count">{{ filtered.length }} {{ t('hrPositionsCount') }}</span>
      <v-spacer />
      <v-btn variant="outlined" size="small" prepend-icon="mdi-download" @click="exportCsv">
        {{ t('hrCsvExport') }}
      </v-btn>
      <v-btn variant="outlined" size="small" prepend-icon="mdi-upload" @click="fileInput?.click()">
        {{ t('hrCsvImport') }}
      </v-btn>
      <input ref="fileInput" type="file" accept=".csv" class="d-none" @change="importCsv" />
      <v-btn color="#ff3131" size="small" prepend-icon="mdi-plus" @click="openAdd">
        {{ t('hrPositionsAdd') }}
      </v-btn>
    </div>

    <!-- Table -->
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

    <!-- Dialog créer / éditer -->
    <v-dialog v-model="dialog" max-width="480" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          {{ editing && editing._isNew ? t('hrPositionsAdd') : t('hrPositionsEdit') }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="dialog = false" />
        </v-card-title>
        <v-card-text v-if="editing">
          <v-select
            v-model="editing.supplierId"
            :items="suppliers"
            item-title="name"
            item-value="id"
            :label="t('hrColSupplier') + ' *'"
            variant="outlined"
            density="compact"
            :error-messages="errors.supplierId"
            class="mb-2"
          />
          <v-select
            v-model="editing.sector"
            :items="sectorOptions"
            :label="t('hrColSector') + ' *'"
            variant="outlined"
            density="compact"
            :error-messages="errors.sector"
            class="mb-2"
          />
          <v-combobox
            v-model="editing.positionName"
            :items="positionNameOptions"
            :label="t('hrColPosition') + ' *'"
            variant="outlined"
            density="compact"
            :error-messages="errors.positionName"
            class="mb-2"
          />
          <v-text-field
            v-model.number="editing.ratePerHour"
            :label="t('hrColRate') + ' *'"
            type="number"
            min="0"
            step="0.5"
            suffix="€"
            variant="outlined"
            density="compact"
            :error-messages="errors.ratePerHour"
          />
        </v-card-text>
        <v-card-actions class="px-6 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">{{ t('hrCancel') }}</v-btn>
          <v-btn color="#ff3131" variant="flat" :loading="saving" @click="save">{{ t('hrSave') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Confirmation suppression -->
    <v-dialog :model-value="!!deleteTarget" max-width="420" @update:model-value="deleteTarget = null">
      <v-card v-if="deleteTarget">
        <v-card-title>{{ t('hrDeleteTitle') }}</v-card-title>
        <v-card-text>{{ t('hrDeleteConfirm') }} « {{ deleteTarget.positionName }} » ?</v-card-text>
        <v-card-actions class="px-6 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="deleteTarget = null">{{ t('hrCancel') }}</v-btn>
          <v-btn color="#ff3131" variant="flat" @click="remove">{{ t('hrDelete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { t } from '@/i18n'
import * as hrApi from '@/utils/hrApi'
import { HR_SECTORS, csvEscape, downloadCsv, parseCsv } from './hrShared'

const positions = ref([])
const suppliers = ref([])
const positionNames = ref([])
const search = ref('')
const dialog = ref(false)
const editing = ref(null)
const deleteTarget = ref(null)
const saving = ref(false)
const errors = reactive({ supplierId: '', sector: '', positionName: '', ratePerHour: '' })
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

// Secteurs proposés : ceux du supplier choisi s'il en déclare, sinon la liste complète.
const sectorOptions = computed(() => {
  const declared = supplierById.value[editing.value?.supplierId]?.sectors
  return declared?.length ? declared : HR_SECTORS
})
// Noms de poste connus pour le secteur choisi (libres via combobox sinon).
const positionNameOptions = computed(() => {
  const rows = positionNames.value.filter((n) => !editing.value?.sector || n.sector === editing.value.sector)
  return [...new Set(rows.map((n) => n.name))]
})

function blank() {
  return { id: crypto.randomUUID(), supplierId: null, sector: '', positionName: '', ratePerHour: 0, _isNew: true }
}
function openAdd() {
  Object.keys(errors).forEach((k) => { errors[k] = '' })
  editing.value = blank()
  dialog.value = true
}
function openEdit(p) {
  Object.keys(errors).forEach((k) => { errors[k] = '' })
  editing.value = { ...p, _isNew: false }
  dialog.value = true
}

function validate() {
  errors.supplierId = editing.value.supplierId ? '' : t('hrRequired')
  errors.sector = editing.value.sector ? '' : t('hrRequired')
  errors.positionName = editing.value.positionName?.trim() ? '' : t('hrRequired')
  errors.ratePerHour = editing.value.ratePerHour >= 0 ? '' : t('hrRequired')
  return !errors.supplierId && !errors.sector && !errors.positionName && !errors.ratePerHour
}

async function save() {
  if (!validate()) return
  saving.value = true
  try {
    const { _isNew, ...row } = editing.value
    row.positionName = row.positionName.trim()
    if (_isNew) await hrApi.createStaffPosition(row)
    else await hrApi.updateStaffPosition(row)
    // Mémorise le nom de poste s'il est nouveau pour ce secteur (alimente le combobox).
    const known = positionNames.value.some((n) => n.name === row.positionName && n.sector === row.sector)
    if (!known) {
      await hrApi.createPositionName({ id: crypto.randomUUID(), name: row.positionName, sector: row.sector })
    }
    await load()
    dialog.value = false
    notify(t('hrSaved'))
  } catch (e) {
    notify(t('hrSaveError'), 'error')
  } finally {
    saving.value = false
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
        id: crypto.randomUUID(),
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
.hrt-root { padding: 16px; }
.hrt-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.hrt-search { max-width: 320px; }
.hrt-count { color: #64748b; font-size: 0.8125rem; white-space: nowrap; }
.hrt-card :deep(th) { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.3px; color: #64748b; white-space: nowrap; }
</style>
