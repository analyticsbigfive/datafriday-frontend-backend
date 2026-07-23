<template>
  <div class="hrt-root">
    <!-- Barre outils -->
    <div class="hrt-toolbar">
      <v-text-field
        v-model="search"
        :placeholder="t('hrSuppliersSearch')"
        prepend-inner-icon="mdi-magnify"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        class="hrt-search"
      />
      <span class="hrt-count">{{ filtered.length }} {{ t('hrSuppliersCount') }}</span>
      <v-spacer />
      <v-btn variant="outlined" size="small" prepend-icon="mdi-download" @click="exportCsv">
        {{ t('hrCsvExport') }}
      </v-btn>
      <v-btn variant="outlined" size="small" prepend-icon="mdi-upload" @click="fileInput?.click()">
        {{ t('hrCsvImport') }}
      </v-btn>
      <input ref="fileInput" type="file" accept=".csv" class="d-none" @change="importCsv" />
      <v-btn color="#ff3131" size="small" prepend-icon="mdi-plus" @click="openAdd">
        {{ t('hrSuppliersAdd') }}
      </v-btn>
    </div>

    <!-- Table -->
    <v-card flat border class="hrt-card">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>{{ t('hrColName') }}</th>
            <th>{{ t('hrColEmail') }}</th>
            <th>{{ t('hrColPhone') }}</th>
            <th>{{ t('hrColContact') }}</th>
            <th>{{ t('hrColSpaces') }}</th>
            <th>{{ t('hrColSectors') }}</th>
            <th class="text-right">{{ t('hrColActions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!filtered.length">
            <td colspan="7" class="text-center text-medium-emphasis py-8">
              {{ t('hrSuppliersEmpty') }}
            </td>
          </tr>
          <tr v-for="s in filtered" :key="s.id">
            <td class="font-weight-medium">{{ s.name }}</td>
            <td>{{ s.email || '—' }}</td>
            <td>{{ s.phone || '—' }}</td>
            <td>{{ s.contactName || '—' }}</td>
            <td>{{ spacesLabel(s.spaceIds) }}</td>
            <td>{{ sectorsLabel(s.sectors) }}</td>
            <td class="text-right text-no-wrap">
              <v-btn icon="mdi-pencil" size="x-small" variant="text" :aria-label="t('hrEdit')" @click="openEdit(s)" />
              <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="#ff3131" :aria-label="t('hrDelete')" @click="deleteTarget = s" />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Dialog créer / éditer -->
    <v-dialog v-model="dialog" max-width="560" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          {{ editing && editing._isNew ? t('hrSuppliersAdd') : t('hrSuppliersEdit') }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="dialog = false" />
        </v-card-title>
        <v-card-text v-if="editing">
          <v-text-field
            v-model="editing.name"
            :label="t('hrColName') + ' *'"
            variant="outlined"
            density="compact"
            :error-messages="nameError"
            class="mb-2"
          />
          <v-text-field v-model="editing.email" :label="t('hrColEmail')" type="email" variant="outlined" density="compact" class="mb-2" />
          <v-text-field v-model="editing.phone" :label="t('hrColPhone')" type="tel" variant="outlined" density="compact" class="mb-2" />
          <v-text-field v-model="editing.contactName" :label="t('hrColContact')" variant="outlined" density="compact" class="mb-2" />
          <v-select
            v-model="editing.spaceIds"
            :items="spaces"
            item-title="name"
            item-value="id"
            :label="t('hrColSpaces')"
            variant="outlined"
            density="compact"
            multiple
            chips
            closable-chips
            class="mb-2"
          />
          <v-select
            v-model="editing.sectors"
            :items="SECTORS"
            :label="t('hrColSectors')"
            variant="outlined"
            density="compact"
            multiple
            chips
            closable-chips
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
        <v-card-text>{{ t('hrDeleteConfirm') }} « {{ deleteTarget.name }} » ?</v-card-text>
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
import { getSpacesLight } from '@/api/endpoints/space.api'
import { HR_SECTORS as SECTORS, csvEscape, downloadCsv, parseCsv } from './hrShared'

const suppliers = ref([])
const spaces = ref([])
const search = ref('')
const dialog = ref(false)
const editing = ref(null)
const deleteTarget = ref(null)
const saving = ref(false)
const nameError = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })
const fileInput = ref(null)

function notify(text, color = 'success') {
  snack.text = text
  snack.color = color
  snack.show = true
}

async function load() {
  const [supplierRows, spaceRows] = await Promise.all([
    hrApi.getAllHRSuppliers(),
    getSpacesLight().catch(() => []),
  ])
  suppliers.value = Array.isArray(supplierRows) ? supplierRows : []
  spaces.value = Array.isArray(spaceRows) ? spaceRows : []
}
onMounted(load)

const filtered = computed(() => {
  const q = search.value?.trim().toLowerCase()
  if (!q) return suppliers.value
  return suppliers.value.filter((s) =>
    [s.name, s.email, s.phone, s.contactName].some((v) => (v || '').toLowerCase().includes(q))
  )
})

const spaceNameById = computed(() => Object.fromEntries(spaces.value.map((s) => [s.id, s.name])))

function spacesLabel(ids = []) {
  if (!ids.length) return '—'
  if (spaces.value.length && ids.length === spaces.value.length) return t('hrAll')
  const names = ids.map((id) => spaceNameById.value[id] || id)
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')
}
function sectorsLabel(sectors = []) {
  if (!sectors.length) return '—'
  if (sectors.length === SECTORS.length) return t('hrAll')
  return sectors.join(', ')
}

function blank() {
  return { id: crypto.randomUUID(), name: '', email: '', phone: '', contactName: '', spaceIds: [], sectors: [], _isNew: true }
}
function openAdd() {
  nameError.value = ''
  editing.value = blank()
  dialog.value = true
}
function openEdit(s) {
  nameError.value = ''
  // Copie de travail ; les tableaux peuvent manquer sur d'anciennes entrées localStorage.
  editing.value = { ...s, spaceIds: [...(s.spaceIds || [])], sectors: [...(s.sectors || [])], _isNew: false }
  dialog.value = true
}

async function save() {
  if (!editing.value.name?.trim()) {
    nameError.value = t('hrNameRequired')
    return
  }
  saving.value = true
  try {
    const { _isNew, ...row } = editing.value
    if (_isNew) await hrApi.createHRSupplier(row)
    else await hrApi.updateHRSupplier(row)
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
    await hrApi.deleteHRSupplier(deleteTarget.value.id)
    deleteTarget.value = null
    await load()
    notify(t('hrDeleted'))
  } catch (e) {
    notify(t('hrSaveError'), 'error')
  }
}

// ---- CSV ----
const CSV_HEADERS = ['name', 'email', 'phone', 'contactName', 'spaces', 'sectors']

function exportCsv() {
  if (!suppliers.value.length) return notify(t('hrCsvNothing'), 'error')
  const lines = [CSV_HEADERS.join(',')]
  for (const s of suppliers.value) {
    lines.push([
      csvEscape(s.name),
      csvEscape(s.email),
      csvEscape(s.phone),
      csvEscape(s.contactName),
      csvEscape((s.spaceIds || []).map((id) => spaceNameById.value[id] || id).join('; ')),
      csvEscape((s.sectors || []).join('; ')),
    ].join(','))
  }
  downloadCsv('hr-suppliers.csv', lines.join('\n'))
  notify(t('hrCsvExported'))
}

async function importCsv(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const { headers, rows } = parseCsv(await file.text())
    const idx = (k) => headers.indexOf(k)
    if (idx('name') === -1) return notify(t('hrCsvBadFile'), 'error')
    const nameBySpace = Object.fromEntries(spaces.value.map((s) => [s.name.toLowerCase(), s.id]))
    let created = 0
    for (const row of rows) {
      const name = row[idx('name')]?.trim()
      if (!name || suppliers.value.some((s) => s.name === name)) continue
      await hrApi.createHRSupplier({
        id: crypto.randomUUID(),
        name,
        email: row[idx('email')] || '',
        phone: row[idx('phone')] || '',
        contactName: row[idx('contactName')] || '',
        spaceIds: (row[idx('spaces')] || '').split(';').map((v) => nameBySpace[v.trim().toLowerCase()]).filter(Boolean),
        sectors: (row[idx('sectors')] || '').split(';').map((v) => v.trim()).filter((v) => SECTORS.includes(v)),
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
