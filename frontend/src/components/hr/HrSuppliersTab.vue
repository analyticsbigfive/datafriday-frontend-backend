<template>
  <div class="hrt-root">
    <!-- Bandeau rouge (pattern Settings) -->
    <div class="hr-banner">
      <div class="hr-banner__icon"><Building2 :size="24" color="white" /></div>
      <div class="hr-banner__titles">
        <HrTabSwitcher active="suppliers" @switch="$emit('switch-tab', $event)" />
        <p class="hr-banner__subtitle">{{ t('hrSuppliersSubtitle') }}</p>
      </div>
      <div class="hr-banner__actions">
        <button class="hr-banner__btn" @click="exportCsv"><Download :size="15" /> {{ t('hrCsvExport') }}</button>
        <button class="hr-banner__btn" @click="fileInput?.click()"><Upload :size="15" /> {{ t('hrCsvImport') }}</button>
        <input ref="fileInput" type="file" accept=".csv" class="d-none" @change="importCsv" />
        <button class="hr-banner__btn hr-banner__btn--primary" @click="openAdd"><Plus :size="15" /> {{ t('hrSuppliersAdd') }}</button>
      </div>
    </div>

    <!-- Recherche (pleine largeur, collée sous le bandeau) -->
    <div class="hr-searchbar">
      <Search :size="18" class="hr-searchbar__icon" />
      <input v-model="search" class="hr-searchbar__input" type="search" :placeholder="t('hrSuppliersSearch')" />
      <span class="hr-searchbar__count">{{ filtered.length }} {{ t('hrSuppliersCount') }}</span>
      <button v-if="search" class="hr-searchbar__clear" :aria-label="t('hrCancel')" @click="search = ''"><X :size="16" /></button>
    </div>

    <!-- Table -->
    <div class="hrt-content">
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
    </div>

    <!-- Drawer création / édition -->
    <HrSupplierFormDrawer
      v-model="drawer"
      :mode="drawerMode"
      :initial="drawerInitial"
      :spaces="spaces"
      :is-dark="isDark"
      @submit="onSubmit"
    />

    <!-- Suppression -->
    <HrDeleteDialog
      :model-value="!!deleteTarget"
      :item-name="deleteTarget?.name || ''"
      :is-dark="isDark"
      @update:model-value="(v) => { if (!v) deleteTarget = null }"
      @confirm="remove"
    />

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Building2, Download, Plus, Search, Upload, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import * as hrApi from '@/utils/hrApi'
import { getSpacesLight } from '@/api/endpoints/space.api'
import { HR_SECTORS as SECTORS, csvEscape, downloadCsv, newId, parseCsv } from './hrShared'
import HrSupplierFormDrawer from './HrSupplierFormDrawer.vue'
import HrDeleteDialog from './HrDeleteDialog.vue'
import HrTabSwitcher from './HrTabSwitcher.vue'
import './hrForms.css'

defineProps({ isDark: { type: Boolean, default: false } })
defineEmits(['switch-tab'])

const suppliers = ref([])
const spaces = ref([])
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

function openAdd() {
  drawerMode.value = 'create'
  drawerInitial.value = null
  drawer.value = true
}
function openEdit(s) {
  drawerMode.value = 'edit'
  drawerInitial.value = s
  drawer.value = true
}

async function onSubmit(payload) {
  try {
    if (drawerMode.value === 'edit') await hrApi.updateHRSupplier(payload)
    else await hrApi.createHRSupplier(payload)
    await load()
    drawer.value = false
    notify(t('hrSaved'))
  } catch (e) {
    notify(t('hrSaveError'), 'error')
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
        id: newId(),
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
.hrt-root { padding: 0; }
.hrt-content { padding: 24px; }
.hrt-card :deep(th) { font-size: var(--fs-sm); text-transform: uppercase; letter-spacing: 0.3px; color: #64748b; white-space: nowrap; }
</style>
