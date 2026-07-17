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

        <!-- Format hint — même structure que MarketPriceCsvImportDrawer.vue (bouton "Download
             template" dans le bloc "Expected format") -->
        <v-card class="mi-hint-card mt-4 pa-4" rounded="lg" elevation="0">
          <div class="d-flex align-center justify-space-between mb-2" style="gap: 8px;">
            <div class="d-flex align-center" style="gap: 8px;">
              <Info :size="15" class="mi-hint-icon" />
              <span class="text-body-2 font-weight-medium mi-title">{{ t('menuItemImportKnownCols') }}</span>
            </div>
            <v-btn variant="text" size="small" class="text-none" @click="downloadTemplate">
              <Download :size="14" class="mr-1" />
              {{ t('menuItemImportDownloadTemplate') }}
            </v-btn>
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
          <v-chip v-if="duplicateRows.length" size="x-small" color="warning" variant="tonal">
            {{ duplicateRows.length }} déjà existants
          </v-chip>
        </div>

        <!-- BUG-88 : fichier vide ou en-têtes non reconnus -->
        <v-alert
          v-if="emptyParseWarning"
          type="warning"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mb-4"
          :text="emptyParseWarning"
        />

        <!-- Skipped warning (BUG-87 : nom/type/catégorie non résolus) -->
        <v-alert
          v-if="invalidRows.length"
          type="warning"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mb-2"
          :text="`${invalidRows.length} ${t('menuItemImportSkipped')}`"
        />
        <div v-if="invalidRows.length" class="mi-skip-list mb-4 pa-3 rounded-lg text-caption mi-subtitle">
          <div v-for="(r, i) in invalidRows.slice(0, 10)" :key="i">
            • {{ r.row.name || '(sans nom)' }} : {{ r.reason }}
          </div>
          <div v-if="invalidRows.length > 10">… +{{ invalidRows.length - 10 }}</div>
        </div>

        <!-- BUG-86 : lignes ignorées car un menu item du même nom existe déjà -->
        <v-alert
          v-if="duplicateRows.length"
          type="info"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mb-2"
          :text="`${duplicateRows.length} ligne(s) ignorée(s) — déjà existantes dans le catalogue`"
        />
        <div v-if="duplicateRows.length" class="mi-skip-list mb-4 pa-3 rounded-lg text-caption mi-subtitle">
          <div v-for="(row, i) in duplicateRows.slice(0, 10)" :key="i">
            • {{ row.name }}
          </div>
          <div v-if="duplicateRows.length > 10">… +{{ duplicateRows.length - 10 }}</div>
        </div>

        <!-- BUG-107 : lignes de recette (Ingredient/Component/Packaging) dont le nom ne
             correspond à rien dans ce compte — l'article sera quand même créé, juste sans
             cette ligne précise. -->
        <v-alert
          v-if="unresolvedRecipeLines.length"
          type="warning"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mb-2"
          :text="`${unresolvedRecipeLines.length} ligne(s) de recette introuvable(s) dans ce compte — l'article sera créé sans elles`"
        />
        <div v-if="unresolvedRecipeLines.length" class="mi-skip-list mb-4 pa-3 rounded-lg text-caption mi-subtitle">
          <div v-for="(l, i) in unresolvedRecipeLines.slice(0, 10)" :key="i">
            • {{ l.item }} — {{ l.type }} "{{ l.name }}"
          </div>
          <div v-if="unresolvedRecipeLines.length > 10">… +{{ unresolvedRecipeLines.length - 10 }}</div>
        </div>

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

        <!-- Success (BUG-85 : succès total OU partiel, détail des échecs affiché) -->
        <div v-else class="d-flex flex-column align-center justify-center py-12" style="gap: 12px;">
          <div class="mi-result-icon" :class="importFailed.length ? 'mi-result-icon--error' : 'mi-result-icon--success'">
            <CheckCircle2 v-if="!importFailed.length" :size="32" />
            <AlertCircle v-else :size="32" />
          </div>
          <div class="text-h6 font-weight-bold mi-title">
            {{ importFailed.length ? 'Import partiellement réussi' : t('menuItemImportSuccess') }}
          </div>
          <div class="text-body-2 mi-subtitle">{{ importedCount }} {{ t('menuItemImportItems') }}</div>

          <v-alert
            v-if="importBulkCountUnknown"
            type="warning"
            variant="tonal"
            density="compact"
            rounded="lg"
            style="max-width:420px;"
            text="Le nombre de lignes réellement créées par le lot n'a pas pu être confirmé par le serveur (réponse sans compteur) — vérifiez le catalogue avant de réimporter."
          />

          <div v-if="importFailed.length" class="mi-skip-list pa-3 rounded-lg text-caption mi-subtitle" style="max-width:420px; width:100%;">
            <div class="font-weight-bold mb-1">{{ importFailed.length }} ligne(s) en échec :</div>
            <div v-for="(f, i) in importFailed.slice(0, 10)" :key="i">
              • {{ f.name }} : {{ f.message }}
            </div>
            <div v-if="importFailed.length > 10">… +{{ importFailed.length - 10 }}</div>
          </div>
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
import { X, FileSpreadsheet, Upload, CheckCircle2, AlertCircle, Info, Download } from 'lucide-vue-next'

const KNOWN_COLUMNS = [
  { key: 'name',           label: 'Name',                       required: true  },
  { key: 'type',           label: 'Type',                       required: false },
  { key: 'category',       label: 'Category',                   required: false },
  { key: 'basePrice',      label: 'Price TTC',                  required: false },
  { key: 'vatRate',        label: 'VAT %',                      required: false },
  { key: 'readyForSale',   label: 'Ready for Sale',             required: false },
  { key: 'comboItem',      label: 'Combo Item',                 required: false },
  { key: 'brand',          label: 'Brand',                      required: false },
  { key: 'kitchenType',    label: 'Kitchen Type',                required: false },
  { key: 'numberOfPiecesRecipe', label: 'Number of Pieces (Recipe)', required: false },
  { key: 'storageType',    label: 'Storage Type',               required: false },
  { key: 'diet',           label: 'Diet',                       required: false },
  { key: 'description',    label: 'Description',                required: false },
  { key: 'recipe',         label: 'Recipe (legacy)',            required: false },
  { key: 'lineItemName',   label: 'Line Type / Line Item Name / Line Quantity', required: false },
]

// Maps CSV column headers (lowercase, trimmed) → internal key names
// BUG-88 : alias FR ajoutés (nom, catégorie, prix de base, prêt à la vente, …) sur le
// modèle de l'alias 'recette' déjà présent, pour les exports CSV en français.
// BUG-107 : colonnes du nouvel export "une ligne par ligne de recette" (MenuItemView.onExportCsv)
// ajoutées, pour permettre un aller-retour export→import complet.
const HEADER_MAP = {
  'name':             'name',
  'display name':     'name', // alias historique : "Display Name" = nom de l'article lui-même
  'nom':              'name',
  "nom de l'article": 'name',
  'type':             'type',
  'category':         'category',
  'catégorie':        'category',
  'categorie':        'category',
  'baseprice':        'basePrice',
  'base price':       'basePrice',
  'price':            'basePrice',
  'price ttc':        'basePrice',
  'prix':             'basePrice',
  'prix ttc':         'basePrice',
  'prix de base':     'basePrice',
  'vat %':            'vatRate',
  'vat':              'vatRate',
  'tva %':            'vatRate',
  'tva':              'vatRate',
  'readyforsale':     'readyForSale',
  'ready for sale':   'readyForSale',
  'prêt à la vente':  'readyForSale',
  'pret à la vente':  'readyForSale',
  'prêt a la vente':  'readyForSale',
  'pret a la vente':  'readyForSale',
  'comboitem':        'comboItem',
  'combo item':       'comboItem',
  'article combo':    'comboItem',
  'brand':            'brand',
  'brand name':       'brand',
  'marque':           'brand',
  // "Display Name Ref" (nouvel export, BUG-107) — DIFFÉRENT de l'alias historique
  // "display name" ci-dessus, qui lui désigne le nom de l'article.
  'display name ref': 'displayNameRef',
  'kitchen type':     'kitchenType',
  'cuisine':          'kitchenType',
  'number of pieces (recipe)': 'numberOfPiecesRecipe',
  'nombre de pièces (recette)': 'numberOfPiecesRecipe',
  'discount type':    'discountType',
  'discount value':   'discountValue',
  'storage type':     'storageType',
  'stockage':         'storageType',
  'diet':             'diet',
  'régime':           'diet',
  'regime':           'diet',
  'space':            'space',
  'spaces':           'space',
  'espace':           'space',
  'description':      'description',
  'recipe':           'recipe',
  'recette':          'recipe',
  // Nouvel export "une ligne par ligne de recette" (BUG-107) — résolues par NOM, pas par id.
  'line type':        'lineType',
  'line item name':   'lineItemName',
  'line quantity':    'lineQuantity',
  'line unit cost':   'lineUnitCost',
  'line total cost':  'lineTotalCost',
}

// BUG-107 : le nouvel export produit PLUSIEURS lignes CSV pour un même article (une par
// ingrédient/composant/packaging de sa recette, colonnes "Line Type"/"Line Item Name"/
// "Line Quantity"). Regroupe ces lignes par nom d'article avant la résolution habituelle
// (une ligne CSV = un article) — sans ce regroupement, chaque ligne de recette créerait un
// article en double. N'affecte pas l'ancien format (une ligne = un article, éventuellement
// avec une colonne "Recipe" packée) : si aucune colonne `lineItemName` n'est présente, les
// lignes sont retournées telles quelles.
function groupCsvRows(rawRows) {
  if (!rawRows.length || !Object.prototype.hasOwnProperty.call(rawRows[0], 'lineItemName')) {
    return rawRows
  }
  const groups = []
  const byName = new Map()
  for (const row of rawRows) {
    const key = String(row.name || '').trim().toLowerCase()
    if (!key) continue
    let group = byName.get(key)
    if (!group) {
      group = { ...row, recipeLines: [] }
      delete group.lineType
      delete group.lineItemName
      delete group.lineQuantity
      delete group.lineUnitCost
      delete group.lineTotalCost
      byName.set(key, group)
      groups.push(group)
    }
    const lineType = String(row.lineType || '').trim()
    const lineName = String(row.lineItemName || '').trim()
    if (lineType && lineName) {
      group.recipeLines.push({ type: lineType, name: lineName, qty: row.lineQuantity })
    }
  }
  return groups
}

// BUG-84 : tokenizer caractère par caractère sur le texte BRUT complet (pas de split par
// ligne avant parsing) — un champ entre guillemets peut contenir un vrai saut de ligne
// (cas fréquent en export Excel/Google Sheets), ce qu'un split(/\r?\n/) préalable casse.
// Gère aussi l'échappement `""` à l'intérieur d'un champ entre guillemets. Même approche
// que le tokenizer de RecipeImportDrawer.vue (parseCsv/split).
function tokenizeCsv(text) {
  const raw = String(text || '').replace(/^﻿/, '') // BOM éventuel
  const rows = []
  let row = []
  let cur = ''
  let inQuotes = false
  let rowHasContent = false

  const pushCell = () => { row.push(cur); cur = '' }
  const pushRow = () => {
    pushCell()
    if (rowHasContent || row.some(c => c !== '')) rows.push(row)
    row = []
    rowHasContent = false
  }

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (inQuotes) {
      if (ch === '"' && raw[i + 1] === '"') { cur += '"'; i++ } // "" échappé
      else if (ch === '"') { inQuotes = false }
      else { cur += ch }
      rowHasContent = true
      continue
    }
    if (ch === '"') { inQuotes = true; rowHasContent = true }
    else if (ch === ',') { pushCell(); rowHasContent = true }
    else if (ch === '\r') { if (raw[i + 1] === '\n') i++; pushRow() }
    else if (ch === '\n') { pushRow() }
    else { cur += ch; rowHasContent = true }
  }
  if (cur !== '' || row.length || rowHasContent) pushRow()

  return rows
}

function parseCsv(text) {
  const rows = tokenizeCsv(text)
  if (rows.length < 2) return []
  const rawHeaders = rows[0].map(h => String(h || '').trim())
  // Normalize each header to an internal key (or keep raw if not mapped)
  const headers = rawHeaders.map(h => HEADER_MAP[h.toLowerCase()] ?? h.toLowerCase().replace(/\s+/g, '_'))
  return rows.slice(1).map(values =>
    Object.fromEntries(headers.map((h, i) => [h, String(values[i] ?? '').trim()]))
  )
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
  components: { X, FileSpreadsheet, Upload, CheckCircle2, AlertCircle, Info, Download },

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
      emptyParseWarning: '', // BUG-88 : message explicite quand le parsing produit 0 ligne
      importing: false,
      importError: '',
      importedCount: 0,
      importFailed: [],         // BUG-85 : [{ name, message }] des lignes withRecipe en échec
      importBulkCountUnknown: false, // BUG-85 : la réponse bulk n'a pas renvoyé de count exploitable
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
    // BUG-86 : noms (normalisés) des menu items déjà présents dans le store, pour détecter
    // les doublons au réimport sans renvoyer silencieusement les mêmes lignes au backend.
    existingMenuItemNames() {
      const rows = this.$store?.getters?.['menuItems/rows'] || []
      return new Set(rows.map(r => this.normalizeName(r?.name)))
    },
    // BUG-87 : chaque ligne nommée est résolue (type puis catégorie scopée par ce type) ;
    // une ligne dont le nom, le type OU la catégorie ne se résout pas devient invalide avec
    // un motif explicite, au lieu de produire un item incomplet sans FK.
    rowResolutions() {
      return this.csvRows.map(row => {
        if (!row.name) return { row, valid: false, reason: 'Nom manquant' }
        const tc = this.resolveTypeCategory(row)
        if (!tc.valid) return { row, valid: false, reason: tc.reason }
        return { row, valid: true, typeObj: tc.typeObj, catObj: tc.catObj }
      })
    },
    validRows() {
      return this.rowResolutions
        .filter(r => r.valid)
        .map(r => r.row)
        .filter(row => !this.existingMenuItemNames.has(this.normalizeName(row.name)))
    },
    invalidRows() { return this.rowResolutions.filter(r => !r.valid) },
    // BUG-86 : lignes par ailleurs valides mais dont le nom correspond déjà à un menu item
    // existant — exclues de l'import et listées séparément comme "déjà existantes".
    duplicateRows() {
      return this.rowResolutions
        .filter(r => r.valid)
        .map(r => r.row)
        .filter(row => this.existingMenuItemNames.has(this.normalizeName(row.name)))
    },
    visibleColumns() {
      if (!this.csvRows.length) return []
      const keys = new Set(this.csvRows.flatMap(r => Object.keys(r)))
      return KNOWN_COLUMNS.filter(c => keys.has(c.key))
    },
    previewRows() { return this.validRows.slice(0, 5) },
    // BUG-107 : lookups nom→id pour résoudre les lignes de recette et les référentiels
    // Brand/DisplayName/Space PAR NOM (portable d'un compte à l'autre), au lieu des ids
    // internes du compte source (jamais valides dans le compte cible).
    ingredientNameToId() {
      const map = new Map()
      const rawList = this.$store.getters['marketPriceIngredients/rows'] || []
      for (const mp of rawList) {
        const ingredients = mp?.ingredients || mp?.ingredientList || mp?.items || mp?.data?.ingredients || []
        for (const ing of (Array.isArray(ingredients) ? ingredients : [])) {
          const id = String(
            ing?.id ?? ing?._id ?? ing?.ingredientId ?? ing?.ingredient_id ??
            ing?.ingredient?.id ?? ing?.ingredient?._id ?? ''
          ).trim()
          const name = String(ing?.name ?? ing?.itemName ?? ing?.ingredientName ?? ing?.label ?? '').trim().toLowerCase()
          if (id && name && !map.has(name)) map.set(name, id)
        }
      }
      return map
    },
    componentNameToId() {
      const map = new Map()
      for (const c of (this.$store.getters['menuComponents/rows'] || [])) {
        const id = String(c?.id ?? '').trim()
        const name = String(c?.name ?? '').trim().toLowerCase()
        if (id && name && !map.has(name)) map.set(name, id)
      }
      return map
    },
    packagingNameToId() {
      const map = new Map()
      for (const p of (this.$store.getters['packaging/rows'] || [])) {
        const id = String(p?.id ?? '').trim()
        const name = String(p?.name ?? p?.marketPrice?.itemName ?? '').trim().toLowerCase()
        if (id && name && !map.has(name)) map.set(name, id)
      }
      return map
    },
    brandNameToId() {
      const map = new Map()
      for (const b of (this.$store.getters['brandNames/brandNames'] || [])) {
        const id = String(b?.id ?? '').trim()
        const name = String(b?.name ?? '').trim().toLowerCase()
        if (id && name) map.set(name, id)
      }
      return map
    },
    displayNameToId() {
      const map = new Map()
      for (const d of (this.$store.getters['displayNames/displayNames'] || [])) {
        const id = String(d?.id ?? '').trim()
        const name = String(d?.name ?? '').trim().toLowerCase()
        if (id && name) map.set(name, id)
      }
      return map
    },
    spaceNameToId() {
      const map = new Map()
      for (const s of (this.$store.getters['spaces/spaces'] || [])) {
        const id = String(s?.id ?? s?._id ?? '').trim()
        const name = String(s?.name ?? s?.title ?? s?.label ?? '').trim().toLowerCase()
        if (id && name) map.set(name, id)
      }
      return map
    },
    // Lignes de recette (Ingredient/Component/Packaging) dont le nom ne correspond à rien
    // dans le compte cible — l'article est quand même créé, juste sans cette ligne précise.
    // Affiché à l'utilisateur pour qu'il sache quoi créer/renommer avant de réessayer.
    unresolvedRecipeLines() {
      const out = []
      for (const row of this.validRows) {
        if (!row.recipeLines?.length) continue
        out.push(...this.resolveRecipeLines(row).unresolved)
      }
      return out
    },
  },

  watch: {
    modelValue(v) {
      if (v) {
        this.reset()
        // La déduplication (existingMenuItemNames) lit menuItems/rows : s'assurer que le
        // catalogue complet est chargé même si l'écran liste a démarré en mode paginé rapide
        // (qui ne charge plus tout le catalogue par défaut).
        this.$store.dispatch('menuItems/fetchMenuItems', {})
        // BUG-107 : résolution des lignes de recette (Ingredient/Component/Packaging) et des
        // référentiels Brand/DisplayName par NOM — nécessite ces listes en mémoire.
        this.$store.dispatch('marketPriceIngredients/fetchRows', {})
        this.$store.dispatch('packaging/fetchPackaging', {})
        this.$store.dispatch('menuComponents/fetchComponents', {})
        this.$store.dispatch('brandNames/fetchBrandNames', {})
        this.$store.dispatch('displayNames/fetchDisplayNames', {})
        this.$store.dispatch('spaces/fetchSpaces', {})
      }
    },
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
      this.emptyParseWarning = ''
      this.importing = false
      this.importError = ''
      this.importedCount = 0
      this.importFailed = []
      this.importBulkCountUnknown = false
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
        this.csvRows = groupCsvRows(parseCsv(e.target.result))
        // BUG-88 : fichier vide, mal délimité, ou en-têtes non reconnus (pas de colonne
        // name/nom) → 0 ligne après parsing. On l'indique explicitement plutôt que de
        // laisser un aperçu vide sans explication.
        this.emptyParseWarning = this.csvRows.length === 0
          ? 'Fichier vide ou en-têtes non reconnus (colonne "name"/"nom" introuvable).'
          : ''
        this.step = 2
      }
      reader.readAsText(file, 'UTF-8')
    },
    // Modèle CSV téléchargeable — même pattern que MarketPriceCsvImportDrawer.vue
    // (downloadTemplate). Exemple avec 2 lignes de recette pour illustrer le format
    // multi-lignes (BUG-107/108) : ces 2 lignes CSV représentent UN SEUL article.
    downloadTemplate() {
      const headers = [
        'Name', 'Type', 'Category', 'Price TTC', 'VAT %', 'Ready for Sale', 'Combo Item',
        'Brand', 'Kitchen Type', 'Number of Pieces (Recipe)', 'Storage Type', 'Diet', 'Description',
        'Line Type', 'Line Item Name', 'Line Quantity',
      ]
      const rows = [
        ['Classic Burger', 'Food', 'Burgers', '12.50', '10', 'Yes', 'No', '', 'Central', '1', 'Cold', '', 'Beef burger with cheese', 'Ingredient', 'Beef Patty', '1'],
        ['Classic Burger', 'Food', 'Burgers', '12.50', '10', 'Yes', 'No', '', 'Central', '1', 'Cold', '', 'Beef burger with cheese', 'Ingredient', 'Burger Bun', '1'],
      ]
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'menu_items_template.csv'
      a.click()
      URL.revokeObjectURL(url)
    },
    // BUG-86 : normalisation nom (casse/espaces) pour comparer une ligne CSV à un menu item
    // déjà en base.
    normalizeName(name) {
      return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
    },
    // BUG-87 : résout le type par nom, PUIS la catégorie filtrée par le typeId résolu (comme
    // MenuItemCreateView.filteredCategoryNames) — jamais un match de catégorie sur le nom
    // seul, qui pourrait associer la catégorie d'un autre type portant le même nom.
    resolveTypeCategory(row) {
      const typeName = String(row.type || '').trim()
      const categoryName = String(row.category || '').trim()
      if (!typeName) return { valid: false, reason: 'Type manquant' }
      const typeObj = (this.productTypes || []).find(
        t => String(t.name || '').toLowerCase() === typeName.toLowerCase()
      )
      const typeKey = typeObj && (typeObj.id || typeObj._id)
      if (!typeKey) return { valid: false, reason: `Type "${typeName}" introuvable` }
      if (!categoryName) return { valid: false, reason: 'Catégorie manquante' }
      const catObj = (this.productCategories || []).find(
        c => c.typeId === typeKey && String(c.name || '').toLowerCase() === categoryName.toLowerCase()
      )
      if (!catObj?.id && !catObj?._id) {
        return { valid: false, reason: `Catégorie "${categoryName}" introuvable pour le type "${typeName}"` }
      }
      return { valid: true, typeObj, catObj }
    },
    // BUG-107 : résout chaque ligne de recette (Ingredient/Component/Packaging) PAR NOM contre
    // le référentiel du compte cible. Une ligne non résolue est simplement omise (l'article
    // est quand même créé) et remontée dans `unresolved` pour affichage — pas de rejet de
    // l'article entier pour une seule ligne de recette introuvable.
    resolveRecipeLines(row) {
      const ingredients = [], components = [], packagings = [], unresolved = []
      for (const line of (row.recipeLines || [])) {
        const qty = Number(line.qty) || 0
        if (!qty) continue
        const key = String(line.name || '').trim().toLowerCase()
        const type = String(line.type || '').trim().toLowerCase()
        if (type === 'ingredient') {
          const id = this.ingredientNameToId.get(key)
          if (id) ingredients.push({ ingredientId: id, numberOfUnits: qty })
          else unresolved.push({ item: row.name, type: 'Ingredient', name: line.name })
        } else if (type === 'component') {
          const id = this.componentNameToId.get(key)
          if (id) components.push({ componentId: id, numberOfUnits: qty })
          else unresolved.push({ item: row.name, type: 'Component', name: line.name })
        } else if (type === 'packaging') {
          const id = this.packagingNameToId.get(key)
          if (id) packagings.push({ packagingId: id, numberOfUnits: qty })
          else unresolved.push({ item: row.name, type: 'Packaging', name: line.name })
        }
      }
      return { ingredients, components, packagings, unresolved }
    },
    buildPayload(row) {
      const { typeObj, catObj } = this.resolveTypeCategory(row)
      const payload = {
        name: row.name,
        basePrice: Number(row.basePrice) || 0,
        typeId: typeObj.id || typeObj._id,
        categoryId: catObj.id || catObj._id,
      }
      if (row.readyForSale) payload.readyForSale = toBool(row.readyForSale) ? 'Yes' : 'No'
      if (row.comboItem)    payload.comboItem    = toBool(row.comboItem) ? 'Yes' : 'No'
      if (row.description)  payload.description  = row.description
      if (row.kitchenType)  payload.kitchenType  = row.kitchenType
      if (row.numberOfPiecesRecipe) {
        payload.numberOfPiecesRecipe = Math.max(1, Math.round(Number(row.numberOfPiecesRecipe) || 1))
      }
      if (row.discountType)  payload.discountType  = row.discountType
      if (row.discountValue) payload.discountValue = Number(row.discountValue) || 0
      if (row.vatRate)       payload.vatRate       = Number(row.vatRate) || undefined
      if (row.storageType) {
        payload.storageType = String(row.storageType).split(';').map(s => s.trim()).filter(Boolean)
      }
      if (row.diet) {
        payload.diet = String(row.diet).split(';').map(s => s.trim()).filter(Boolean)
      }
      if (row.brand) {
        const brandId = this.brandNameToId.get(String(row.brand).trim().toLowerCase())
        if (brandId) payload.brandId = brandId
      }
      if (row.displayNameRef) {
        const displayNameId = this.displayNameToId.get(String(row.displayNameRef).trim().toLowerCase())
        if (displayNameId) payload.displayNameId = displayNameId
      }
      if (row.space) {
        const spaceIds = String(row.space).split(';').map(s => s.trim()).filter(Boolean)
          .map(n => this.spaceNameToId.get(n.toLowerCase()))
          .filter(Boolean)
        if (spaceIds.length) payload.spaceIds = spaceIds
      }
      // Ancien format "Recipe" packé (IDs bruts, rétro-compatibilité) — utilisé seulement si
      // le nouveau format multi-lignes (Line Type/Line Item Name) n'est pas présent.
      if (row.recipe) Object.assign(payload, parseRecipe(row.recipe))
      if (row.recipeLines?.length) {
        const { ingredients, components, packagings } = this.resolveRecipeLines(row)
        if (ingredients.length) payload.ingredients = ingredients
        if (components.length)  payload.components  = components
        if (packagings.length)  payload.packagings  = packagings
      }
      return payload
    },
    async runImport() {
      this.step = 3
      this.importing = true
      this.importError = ''
      this.importFailed = []
      this.importBulkCountUnknown = false
      try {
        // validRows exclut déjà les lignes invalides (BUG-87) et les doublons déjà en
        // base (BUG-86) — ce qui suit n'envoie que des lignes importables.
        const allItems = this.validRows.map(r => this.buildPayload(r))

        const hasRecipe = item =>
          item.ingredients?.length || item.components?.length || item.packagings?.length

        const withRecipe    = allItems.filter(hasRecipe)
        const withoutRecipe = allItems.filter(item => !hasRecipe(item))

        let totalCreated = 0

        // Bulk pour les items sans recipe (efficace)
        if (withoutRecipe.length) {
          const res = await bulkCreateMenuItems(withoutRecipe)
          const count = res?.data?.count ?? res?.count
          // BUG-85 : si l'endpoint bulk ne renvoie pas de count exploitable, on ne suppose
          // plus un succès total (ancien repli `?? withoutRecipe.length`) — on le signale
          // explicitement à l'utilisateur à l'étape Résultat à la place.
          if (typeof count === 'number') {
            totalCreated += count
          } else {
            this.importBulkCountUnknown = true
          }
        }

        // Individuel pour les items avec recipe — le endpoint single traite les
        // ingrédients/composants/packagings. BUG-85 : try/catch PAR item pour qu'un échec
        // isolé n'efface pas les succès déjà obtenus (avant : une exception ici remontait
        // au catch global et affichait "Import error" alors que des items avaient bien été
        // créés en base).
        for (const item of withRecipe) {
          try {
            await createMenuItem(item)
            totalCreated++
          } catch (e) {
            this.importFailed.push({ name: item.name || '(sans nom)', message: e?.message || 'Erreur inconnue' })
          }
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

/* ── Skip / dedup / failure lists (BUG-85/86/87 récapitulatifs) ──────── */
.mi-skip-list {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  max-height: 160px;
  overflow-y: auto;
}
.mi-import--dark .mi-skip-list {
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
