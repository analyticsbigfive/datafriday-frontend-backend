<template>
  <v-navigation-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    location="right"
    temporary
    width="580"
    class="mi-import-drawer"
    :class="{ 'mi-import--dark': isDark }"
  >
    <!-- ── Header ─────────────────────────────────────────── -->
    <div class="mi-header">
      <div class="mi-header__icon"><FileSpreadsheet :size="20" color="white" /></div>
      <div class="mi-header__text">
        <div class="mi-header__title">{{ t('menuItemImportTitle') }}</div>
        <div class="mi-header__sub">{{ stepDesc }}</div>
      </div>
      <button class="mi-header__close" @click="close"><X :size="16" /></button>
    </div>

    <!-- ── Step bar ───────────────────────────────────────── -->
    <div class="mi-stepbar px-5 pb-4">
      <div class="d-flex align-center" style="gap: 0;">
        <template v-for="(s, i) in stepLabels" :key="i">
          <div class="d-flex align-center" style="gap: 8px; flex-shrink: 0;">
            <div class="mi-dot" :class="dotClass(i)">
              <CheckCircle2 v-if="step > i + 1" :size="13" />
              <span v-else>{{ i + 1 }}</span>
            </div>
            <span class="mi-step-label" :class="step >= i + 1 ? 'mi-step-label--active' : 'mi-step-label--inactive'">
              {{ s }}
            </span>
          </div>
          <div v-if="i < stepLabels.length - 1" class="mi-step-line" :class="{ 'mi-step-line--done': step > i + 1 }" />
        </template>
      </div>
    </div>

    <v-divider class="mi-divider" />

    <!-- ── Body ──────────────────────────────────────────── -->
    <div class="mi-body pa-5">

      <!-- Step 1 : Upload ── -->
      <div v-if="step === 1">
        <input ref="fileInput" type="file" accept=".csv,.tsv,text/csv" style="display:none" @change="onFileChange" />

        <div
          class="mi-dropzone d-flex flex-column align-center justify-center"
          :class="{ 'mi-dropzone--hover': dropping }"
          @click="$refs.fileInput.click()"
          @dragover.prevent="dropping = true"
          @dragleave.prevent="dropping = false"
          @drop.prevent="onDrop"
        >
          <div class="mi-dropzone-icon mb-4">
            <FileSpreadsheet :size="44" />
          </div>
          <div class="text-subtitle-1 font-weight-semibold mb-1 mi-title">
            {{ t('menuItemImportDropzone') }}
          </div>
          <div class="text-body-2 mi-subtitle mb-5">{{ t('menuItemImportDropzoneOr') }}</div>
          <v-btn
            variant="outlined"
            rounded="lg"
            size="small"
            class="text-none mi-outline-btn"
            @click.stop="$refs.fileInput.click()"
          >
            <Upload :size="15" class="mr-2" />
            {{ t('menuItemImportChooseFile') }}
          </v-btn>
        </div>

        <!-- Format hint -->
        <v-card class="mi-hint-card mt-4 pa-4" rounded="lg" elevation="0">
          <div class="d-flex align-center mb-2" style="gap: 8px;">
            <Info :size="15" class="mi-hint-icon" />
            <span class="text-body-2 font-weight-medium mi-title">{{ t('menuItemImportKnownCols') }}</span>
          </div>
          <div class="d-flex flex-wrap mb-3" style="gap: 6px;">
            <v-chip
              v-for="col in knownColumns"
              :key="col.key"
              size="x-small"
              :color="col.required ? '#ff3131' : 'default'"
              :variant="col.required ? 'flat' : 'tonal'"
              rounded="lg"
            >
              {{ col.label }}
              <span v-if="col.required" class="ml-1 font-weight-bold">*</span>
            </v-chip>
          </div>
          <div class="text-caption mi-subtitle">{{ t('menuItemImportFormatDesc') }}</div>
        </v-card>
      </div>

      <!-- Step 2 : Preview ── -->
      <div v-if="step === 2">
        <!-- File info bar -->
        <div class="mi-file-bar d-flex align-center mb-4 pa-3 rounded-lg" style="gap: 10px;">
          <FileSpreadsheet :size="16" class="mi-hint-icon" style="flex-shrink:0" />
          <span class="text-body-2 font-weight-medium mi-title" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ fileName }}</span>
          <v-chip size="x-small" color="#ff3131" variant="flat" class="text-white">
            {{ validRows.length }} {{ t('menuItemImportValid') }}
          </v-chip>
          <v-chip v-if="invalidRows.length" size="x-small" color="error" variant="tonal">
            {{ invalidRows.length }} {{ t('menuItemImportErrors') }}
          </v-chip>
        </div>

        <!-- Skipped warning -->
        <v-alert
          v-if="invalidRows.length"
          type="warning"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mb-4"
          :text="`${invalidRows.length} ${t('menuItemImportSkipped')}`"
        />

        <!-- Preview table -->
        <div class="mi-table-wrap rounded-lg" style="overflow:hidden;">
          <v-table density="compact" class="mi-preview-table">
            <thead>
              <tr>
                <th
                  v-for="col in visibleColumns"
                  :key="col.key"
                  class="text-caption font-weight-bold"
                  style="text-transform:uppercase; font-size:0.62rem; letter-spacing:0.05em; white-space:nowrap;"
                >
                  {{ col.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in previewRows" :key="i">
                <td
                  v-for="col in visibleColumns"
                  :key="col.key"
                  class="text-caption"
                  style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
                >
                  {{ row[col.key] || '—' }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
        <div v-if="validRows.length > 5" class="text-caption mi-subtitle mt-2 text-center">
          … {{ t('menuItemImportMoreRows') }} ({{ validRows.length - 5 }})
        </div>
      </div>

      <!-- Step 3 : Result ── -->
      <div v-if="step === 3">
        <!-- Loading -->
        <div v-if="importing" class="d-flex flex-column align-center justify-center py-14" style="gap: 18px;">
          <v-progress-circular indeterminate color="#ff3131" size="52" width="4" />
          <div class="text-body-2 mi-subtitle">{{ t('menuItemImportInProgress') }}</div>
        </div>

        <!-- Error -->
        <div v-else-if="importError" class="d-flex flex-column align-center justify-center py-12" style="gap: 12px;">
          <div class="mi-result-icon mi-result-icon--error">
            <AlertCircle :size="32" />
          </div>
          <div class="text-h6 font-weight-bold mi-title">{{ t('menuItemImportError') }}</div>
          <div class="text-body-2 mi-subtitle text-center" style="max-width:360px;">{{ importError }}</div>
        </div>

        <!-- Success -->
        <div v-else class="d-flex flex-column align-center justify-center py-12" style="gap: 12px;">
          <div class="mi-result-icon mi-result-icon--success">
            <CheckCircle2 :size="32" />
          </div>
          <div class="text-h6 font-weight-bold mi-title">{{ t('menuItemImportSuccess') }}</div>
          <div class="text-body-2 mi-subtitle">{{ importedCount }} {{ t('menuItemImportItems') }}</div>
        </div>
      </div>

    </div>

    <!-- ── Footer ─────────────────────────────────────────── -->
    <template #append>
      <v-divider class="mi-divider" />
      <div class="d-flex align-center pa-4" style="gap: 8px;">
        <v-btn
          v-if="step === 1"
          variant="text"
          rounded="lg"
          class="text-none mi-text-btn"
          @click="close"
        >
          {{ t('menuItemImportCancel') }}
        </v-btn>
        <v-btn
          v-if="step === 2"
          variant="outlined"
          rounded="lg"
          class="text-none mi-outline-btn"
          @click="step--"
        >
          {{ t('menuItemImportBack') }}
        </v-btn>

        <div class="flex-grow-1" />

        <v-btn
          v-if="step === 2"
          color="#ff3131"
          variant="flat"
          rounded="lg"
          class="text-white text-none"
          :disabled="!validRows.length"
          elevation="0"
          @click="runImport"
        >
          {{ t('menuItemImportRun') }} {{ validRows.length }} {{ t('menuItemImportValid') }}
        </v-btn>

        <v-btn
          v-if="step === 3 && !importing"
          color="#ff3131"
          variant="flat"
          rounded="lg"
          class="text-white text-none"
          elevation="0"
          @click="close"
        >
          {{ t('menuItemImportClose') }}
        </v-btn>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'
import { bulkCreateMenuItems, createMenuItem } from '@/api/endpoints/menu-item.api'
import { X, FileSpreadsheet, Upload, CheckCircle2, AlertCircle, Info } from 'lucide-vue-next'

const KNOWN_COLUMNS = [
  { key: 'name',         label: 'Name',          required: true  },
  { key: 'type',         label: 'Type',           required: false },
  { key: 'category',     label: 'Category',       required: false },
  { key: 'basePrice',    label: 'Base Price',     required: false },
  { key: 'readyForSale', label: 'Ready for Sale', required: false },
  { key: 'comboItem',    label: 'Combo Item',     required: false },
  { key: 'description',  label: 'Description',    required: false },
  { key: 'recipe',       label: 'Recipe',         required: false },
]

// Maps CSV column headers (lowercase, trimmed) → internal key names
const HEADER_MAP = {
  'name':           'name',
  'display name':   'name',
  'type':           'type',
  'category':       'category',
  'baseprice':      'basePrice',
  'base price':     'basePrice',
  'price':          'basePrice',
  'readyforsale':   'readyForSale',
  'ready for sale': 'readyForSale',
  'comboitem':      'comboItem',
  'combo item':     'comboItem',
  'description':    'description',
  'recipe':         'recipe',
  'recette':        'recipe',
}

function parseCsvLine(line) {
  const values = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { values.push(cur); cur = '' }
    else cur += ch
  }
  values.push(cur)
  return values
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const rawHeaders = parseCsvLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
  // Normalize each header to an internal key (or keep raw if not mapped)
  const headers = rawHeaders.map(h => HEADER_MAP[h.toLowerCase()] ?? h.toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] || '').replace(/^"|"$/g, '').trim()]))
  })
}

function toBool(v) {
  return ['yes', 'oui', 'true', '1'].includes(String(v || '').toLowerCase())
}

// Recipe column format: segments separated by "|"
// Each segment: localId>TypeLabel>refId[>refId2]>quantity
// TypeLabel: Ingredient | Packaging | Component | Combo Item
function parseRecipe(recipeStr) {
  if (!recipeStr || !recipeStr.trim()) return {}
  const ingredients = [], components = [], packagings = []
  for (const seg of recipeStr.split('|')) {
    if (!seg.trim()) continue
    const parts = seg.split('>')
    if (parts.length < 4) continue
    const typeLabel = (parts[1] || '').trim().toLowerCase()
    const qty = parseFloat(parts[parts.length - 1]) || 0
    if (!qty) continue
    // prefer 4th field as entity ID (index 3); fall back to 3rd (index 2)
    const entityId = (parts.length >= 5 && parts[3]?.trim()) ? parts[3].trim() : (parts[2] || '').trim()
    if (!entityId) continue
    if (typeLabel === 'ingredient') {
      ingredients.push({ ingredientId: entityId, numberOfUnits: qty })
    } else if (typeLabel === 'component' || typeLabel === 'combo item') {
      components.push({ componentId: entityId, numberOfUnits: qty })
    } else if (typeLabel === 'packaging') {
      packagings.push({ packagingId: entityId, numberOfUnits: qty })
    }
  }
  const result = {}
  if (ingredients.length) result.ingredients = ingredients
  if (components.length)  result.components  = components
  if (packagings.length)  result.packagings  = packagings
  return result
}

export default {
  name: 'MenuItemCsvImportDrawer',
  components: { X, FileSpreadsheet, Upload, CheckCircle2, AlertCircle, Info },

  props: {
    modelValue:        { type: Boolean, default: false },
    productTypes:      { type: Array,   default: () => [] },
    productCategories: { type: Array,   default: () => [] },
  },
  emits: ['update:modelValue', 'imported'],

  setup() {
    const theme = useTheme()
    const { t } = useI18n()
    const isDark = computed(() => !!theme.global.current.value.dark)
    return { t, isDark }
  },

  data() {
    return {
      step: 1,
      dropping: false,
      fileName: '',
      csvRows: [],
      importing: false,
      importError: '',
      importedCount: 0,
      knownColumns: KNOWN_COLUMNS,
    }
  },

  computed: {
    stepLabels() {
      return [
        this.t('menuItemImportStep1'),
        this.t('menuItemImportStep2'),
        this.t('menuItemImportStep3'),
      ]
    },
    stepDesc() {
      return [
        this.t('menuItemImportStep1Desc'),
        this.t('menuItemImportStep2Desc'),
        this.t('menuItemImportStep3Desc'),
      ][this.step - 1]
    },
    validRows()   { return this.csvRows.filter(r => !!r.name) },
    invalidRows() { return this.csvRows.filter(r => !r.name)  },
    visibleColumns() {
      if (!this.csvRows.length) return []
      const keys = new Set(this.csvRows.flatMap(r => Object.keys(r)))
      return KNOWN_COLUMNS.filter(c => keys.has(c.key))
    },
    previewRows() { return this.validRows.slice(0, 5) },
  },

  watch: {
    modelValue(v) { if (v) this.reset() },
  },

  methods: {
    dotClass(i) {
      if (this.step > i + 1) return 'mi-dot--done'
      if (this.step === i + 1) return 'mi-dot--active'
      return ''
    },
    reset() {
      this.step = 1
      this.dropping = false
      this.fileName = ''
      this.csvRows = []
      this.importing = false
      this.importError = ''
      this.importedCount = 0
    },
    close() { this.$emit('update:modelValue', false) },
    onDrop(e) {
      this.dropping = false
      const file = e.dataTransfer?.files?.[0]
      if (file) this.loadFile(file)
    },
    onFileChange(e) {
      const file = e.target?.files?.[0]
      if (file) this.loadFile(file)
      e.target.value = ''
    },
    loadFile(file) {
      this.fileName = file.name
      const reader = new FileReader()
      reader.onload = e => {
        this.csvRows = parseCsv(e.target.result)
        this.step = 2
      }
      reader.readAsText(file, 'UTF-8')
    },
    buildPayload(row) {
      const typeObj = this.productTypes.find(
        t => String(t.name || '').toLowerCase() === String(row.type || '').toLowerCase()
      )
      const catObj = this.productCategories.find(
        c => String(c.name || '').toLowerCase() === String(row.category || '').toLowerCase()
      )
      const payload = {
        name: row.name,
        basePrice: Number(row.basePrice) || 0,
      }
      if (typeObj?.id)    payload.typeId     = typeObj.id
      if (catObj?.id)     payload.categoryId = catObj.id
      if (row.readyForSale) payload.readyForSale = toBool(row.readyForSale) ? 'Yes' : 'No'
      if (row.comboItem)    payload.comboItem    = toBool(row.comboItem) ? 'Yes' : 'No'
      if (row.description)  payload.description  = row.description
      if (row.recipe)       Object.assign(payload, parseRecipe(row.recipe))
      return payload
    },
    async runImport() {
      this.step = 3
      this.importing = true
      this.importError = ''
      try {
        const allItems = this.validRows.map(r => this.buildPayload(r))

        const hasRecipe = item =>
          item.ingredients?.length || item.components?.length || item.packagings?.length

        const withRecipe    = allItems.filter(hasRecipe)
        const withoutRecipe = allItems.filter(item => !hasRecipe(item))

        let totalCreated = 0

        // Bulk pour les items sans recipe (efficace)
        if (withoutRecipe.length) {
          const res = await bulkCreateMenuItems(withoutRecipe)
          totalCreated += res?.data?.count ?? res?.count ?? withoutRecipe.length
        }

        // Individuel pour les items avec recipe — le endpoint single traite les ingrédients/composants/packagings
        for (const item of withRecipe) {
          await createMenuItem(item)
          totalCreated++
        }

        this.importedCount = totalCreated
        this.$emit('imported')
      } catch (e) {
        this.importError = e?.message || 'Une erreur est survenue lors de l\'import.'
      } finally {
        this.importing = false
      }
    },
  },
}
</script>

<style scoped>
/* ── Shell ───────────────────────────────────────────────── */
.mi-import-drawer {
  background: #ffffff !important;
}
.mi-import--dark.mi-import-drawer {
  background: #111827 !important;
}

/* ── Header ──────────────────────────────────────────────── */
.mi-header {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49,.2);
}
.mi-header__icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.mi-header__text { flex: 1; }
.mi-header__title { font-size: 15px; font-weight: 700; color: #fff; }
.mi-header__sub { font-size: 12px; color: rgba(255,255,255,.72); margin-top: 2px; }
.mi-header__close {
  background: rgba(255,255,255,.15); border: none; cursor: pointer;
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; transition: background .15s;
}
.mi-header__close:hover { background: rgba(255,255,255,.25); }

/* ── Typography ──────────────────────────────────────────── */
.mi-title   { color: #111827; }
.mi-subtitle { color: #6b7280; }
.mi-import--dark .mi-title    { color: #f1f5f9; }
.mi-import--dark .mi-subtitle { color: #94a3b8; }

/* ── Divider ─────────────────────────────────────────────── */
.mi-divider { border-color: #f1f5f9 !important; }
.mi-import--dark .mi-divider { border-color: #1e293b !important; }

/* ── Step bar ────────────────────────────────────────────── */
.mi-stepbar { background: #ffffff; }
.mi-import--dark .mi-stepbar { background: #111827; }

.mi-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  background: #e5e7eb;
  color: #9ca3af;
  transition: background 0.2s, color 0.2s;
}
.mi-import--dark .mi-dot {
  background: #374151;
  color: #6b7280;
}
.mi-dot--active {
  background: #ff3131 !important;
  color: #ffffff !important;
}
.mi-dot--done {
  background: #16a34a !important;
  color: #ffffff !important;
}

.mi-step-label {
  font-size: 12px;
  white-space: nowrap;
}
.mi-step-label--active { font-weight: 600; }
.mi-step-label--inactive { color: #9ca3af; }
.mi-import--dark .mi-step-label--inactive { color: #4b5563; }

.mi-step-line {
  flex: 1;
  height: 1.5px;
  background: #e5e7eb;
  margin: 0 8px;
  min-width: 16px;
  transition: background 0.2s;
}
.mi-import--dark .mi-step-line { background: #374151; }
.mi-step-line--done { background: #16a34a !important; }

/* ── Body ────────────────────────────────────────────────── */
.mi-body {
  overflow-y: auto;
  flex: 1;
}

/* ── Dropzone ────────────────────────────────────────────── */
.mi-dropzone {
  border: 2px dashed #d1d5db;
  border-radius: 16px;
  cursor: pointer;
  padding: 48px 24px;
  background: #f9fafb;
  transition: border-color 0.2s, background 0.2s;
}
.mi-import--dark .mi-dropzone {
  border-color: #374151;
  background: #1e293b;
}
.mi-dropzone--hover,
.mi-dropzone:hover {
  border-color: #ff3131;
  background: #fff5f5;
}
.mi-import--dark .mi-dropzone--hover,
.mi-import--dark .mi-dropzone:hover {
  border-color: #ff3131;
  background: rgba(255, 49, 49, 0.08);
}

.mi-dropzone-icon { color: #9ca3af; }
.mi-import--dark .mi-dropzone-icon { color: #4b5563; }
.mi-dropzone:hover .mi-dropzone-icon,
.mi-dropzone--hover .mi-dropzone-icon { color: #ff3131; }

/* ── Hint card ───────────────────────────────────────────── */
.mi-hint-card {
  background: #f9fafb !important;
  border: 1px solid #e5e7eb !important;
}
.mi-import--dark .mi-hint-card {
  background: #1e293b !important;
  border-color: #374151 !important;
}
.mi-hint-icon { color: #9ca3af; }
.mi-import--dark .mi-hint-icon { color: #6b7280; }

/* ── File bar ────────────────────────────────────────────── */
.mi-file-bar {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
}
.mi-import--dark .mi-file-bar {
  background: #1e293b;
  border-color: #374151;
}

/* ── Preview table ───────────────────────────────────────── */
.mi-table-wrap {
  border: 1px solid #e5e7eb;
}
.mi-import--dark .mi-table-wrap {
  border-color: #374151;
}
.mi-preview-table :deep(thead) {
  background: #f3f4f6;
}
.mi-import--dark .mi-preview-table :deep(thead) {
  background: #1f2937 !important;
}
.mi-preview-table :deep(thead th) {
  color: #374151 !important;
  border-bottom: 1px solid #e5e7eb !important;
  padding: 8px 12px !important;
}
.mi-import--dark .mi-preview-table :deep(thead th) {
  color: #94a3b8 !important;
  border-bottom-color: #374151 !important;
}
.mi-preview-table :deep(tbody td) {
  padding: 6px 12px !important;
  color: #374151;
  border-bottom: 1px solid #f3f4f6 !important;
}
.mi-import--dark .mi-preview-table :deep(tbody td) {
  color: #e2e8f0 !important;
  border-bottom-color: #1e293b !important;
  background: #111827 !important;
}
.mi-import--dark .mi-preview-table :deep(.v-table) {
  background: #111827 !important;
}

/* ── Result icons ────────────────────────────────────────── */
.mi-result-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mi-result-icon--success {
  background: rgba(22, 163, 74, 0.12);
  color: #16a34a;
}
.mi-result-icon--error {
  background: rgba(255, 49, 49, 0.12);
  color: #ff3131;
}

/* ── Footer ──────────────────────────────────────────────── */
.mi-import-drawer :deep(.v-navigation-drawer__append) {
  background: #ffffff;
  border-top: 1px solid #f1f5f9;
}
.mi-import--dark :deep(.v-navigation-drawer__append) {
  background: #111827 !important;
  border-top-color: #1e293b !important;
}

/* ── Buttons ─────────────────────────────────────────────── */
.mi-text-btn    { color: #6b7280 !important; }
.mi-outline-btn { border-color: #d1d5db !important; color: #374151 !important; }
.mi-import--dark .mi-text-btn    { color: #9ca3af !important; }
.mi-import--dark .mi-outline-btn { border-color: #374151 !important; color: #e2e8f0 !important; }
</style>
