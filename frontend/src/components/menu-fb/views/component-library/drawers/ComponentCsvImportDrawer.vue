<template>
  <Teleport to="body">
  <Transition name="ccid">
  <div v-if="modelValue" class="ccid-overlay" @mousedown.self="$emit('update:modelValue', false)">
    <div class="ccid-panel" :class="{ 'ccid--dark': isDark }">
    <!-- Header -->
    <div class="ccid__grad-header">
      <div class="ccid__header-icon"><FileSpreadsheet :size="22" color="white" /></div>
      <div class="ccid__header-titles">
        <div class="ccid__header-title">{{ t('compCsvImportTitle') }}</div>
        <div class="ccid__header-subtitle">{{ stepLabel }}</div>
      </div>
      <button class="ccid__close-btn" @click="$emit('update:modelValue', false)"><X :size="18" /></button>
    </div>

    <!-- Step indicator -->
    <div class="px-6 py-3 ccid-step-bar">
      <div class="d-flex align-center" style="gap: 4px;">
        <template v-for="(s, i) in steps" :key="i">
          <div class="d-flex align-center" style="gap: 4px; flex-shrink: 0;">
            <div
              class="ccid-step-dot"
              :class="{ 'ccid-step-dot--active': step === i + 1, 'ccid-step-dot--done': step > i + 1 }"
            >
              <CheckCircle2 v-if="step > i + 1" :size="12" />
              <span v-else style="font-size: 10px; font-weight: 700;">{{ i + 1 }}</span>
            </div>
            <span
              class="text-caption"
              :class="step >= i + 1 ? 'font-weight-medium' : 'text-disabled'"
              style="white-space: nowrap; font-size: 11px;"
            >{{ s }}</span>
          </div>
          <div v-if="i < steps.length - 1" class="ccid-step-line" style="flex: 1; height: 1px; min-width: 8px;" />
        </template>
      </div>
    </div>

    <!-- Body -->
    <div class="ccid-body">

      <!-- ── Step 1 : Upload ── -->
      <div v-if="step === 1">
        <input ref="fileInput" type="file" accept=".csv,text/csv" style="display: none;" @change="onFileChange" />
        <div
          class="ccid-dropzone d-flex flex-column align-center justify-center pa-8"
          :class="{ 'ccid-dropzone--hover': dropping }"
          @click="$refs.fileInput.click()"
          @dragover.prevent="dropping = true"
          @dragleave.prevent="dropping = false"
          @drop.prevent="onDrop"
        >
          <FileSpreadsheet :size="44" class="mb-3" style="color: #9ca3af;" />
          <div class="text-body-1 font-weight-medium mb-1">{{ fileName || t('dropTitle') }}</div>
          <div class="text-body-2 text-medium-emphasis mb-4">{{ t('dropSub') }}</div>
          <v-btn variant="outlined" rounded="lg" size="small" class="text-none" @click.stop="$refs.fileInput.click()">
            <Upload :size="16" class="mr-2" />
            {{ t('chooseFile') }}
          </v-btn>
        </div>
        <v-card variant="tonal" rounded="lg" class="mt-3 pa-4" elevation="0">
          <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 8px;">
            <div>
              <div class="text-body-2 font-weight-medium mb-1">{{ t('expectedFormat') }}</div>
              <div class="text-caption text-medium-emphasis">{{ t('formatDesc') }}</div>
            </div>
            <v-btn variant="text" size="small" class="text-none" @click="downloadTemplate">
              <Download :size="14" class="mr-1" />
              {{ t('downloadTemplate') }}
            </v-btn>
          </div>
        </v-card>

        <v-divider class="my-5" />

        <div class="text-body-2 font-weight-medium mb-1">{{ t('companionTitle') }}</div>
        <div class="text-caption text-medium-emphasis mb-3">{{ t('companionDesc') }}</div>
        <input ref="companionInput" type="file" accept=".csv,text/csv" style="display: none;" @change="onCompanionFileChange" />
        <div
          class="ccid-dropzone ccid-dropzone--small d-flex align-center justify-center pa-4"
          @click="$refs.companionInput.click()"
        >
          <FileSpreadsheet :size="20" class="mr-2" style="color: #9ca3af;" />
          <span class="text-body-2">{{ companionFileName || t('companionChoose') }}</span>
          <button v-if="companionFileName" class="ccid-companion-clear" @click.stop="clearCompanion"><X :size="14" /></button>
        </div>
        <div v-if="companionMap && companionMap.size > 0" class="text-caption text-medium-emphasis mt-2">
          {{ companionMap.size }} {{ t('companionIdsLoaded') }}
        </div>
      </div>

      <!-- ── Step 2 : Mapping colonnes ── -->
      <div v-if="step === 2">
        <div class="d-flex align-center mb-4" style="gap: 8px;">
          <FileSpreadsheet :size="16" style="color: #6b7280; flex-shrink: 0;" />
          <span class="text-body-2 font-weight-medium">{{ fileName }}</span>
          <v-chip size="x-small" variant="tonal" color="primary">{{ csvRows.length }} {{ t('rowsLabel') }}</v-chip>
        </div>
        <div class="text-body-2 font-weight-medium mb-3">{{ t('mapColumns') }}</div>
        <v-alert v-if="!canImport && csvRows.length > 0" type="warning" variant="tonal" density="compact" rounded="lg" class="mb-3">
          {{ t('missingRequiredMapping') }}
        </v-alert>
        <div>
          <div v-for="field in localizedFields" :key="field.key" class="d-flex align-center mb-2" style="gap: 12px;">
            <div style="min-width: 200px; flex-shrink: 0;">
              <span class="text-body-2">{{ field.label }}</span>
              <v-chip v-if="field.required" size="x-small" color="error" variant="flat" class="ml-1">{{ t('required') }}</v-chip>
            </div>
            <select
              class="form-select form-select-sm ccid-map-select"
              :value="mapping[field.key] ?? ''"
              @change="setMapping(field.key, $event.target.value || null)"
              style="flex: 1;"
            >
              <option v-for="opt in columnOptions" :key="`col-${opt.value ?? 'ignore'}`" :value="opt.value ?? ''">{{ opt.title }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- ── Step 3 : Résultats ── -->
      <div v-if="step === 3">
        <div v-if="importLoading" class="d-flex flex-column align-center justify-center py-12" style="gap:10px; width:100%;">
          <div class="ccid-progress">
            <div class="ccid-progress__bar" :style="{ width: importPct + '%' }"></div>
          </div>
          <div class="ccid-progress__label">{{ importPct }}% · {{ importProgress }}/{{ csvRows.length }} {{ t('importing') }}</div>
        </div>
        <template v-else-if="importResults">
          <v-alert v-if="autoCreatedSummary" type="info" variant="tonal" rounded="lg" class="mb-4">
            {{ autoCreatedSummary }}
          </v-alert>
          <v-alert v-if="importResults.success > 0" type="success" variant="tonal" rounded="lg" class="mb-4">
            <strong>{{ importResults.success }}</strong> {{ t('createdOk') }}
          </v-alert>
          <v-alert v-if="importResults.updated > 0" type="info" variant="tonal" rounded="lg" class="mb-4">
            <strong>{{ importResults.updated }}</strong> {{ t('updatedOk') }}
          </v-alert>
          <v-alert v-if="importResults.errors.length > 0" type="error" variant="tonal" rounded="lg" class="mb-4">
            <div class="font-weight-medium mb-2">{{ importResults.errors.length }} {{ t('errors') }}</div>
            <ul style="padding-left: 16px; margin: 0;">
              <li v-for="(err, idx) in importResults.errors" :key="`err-${idx}`" class="text-body-2">
                {{ t('row') }} {{ err.row }} : {{ err.message }}
              </li>
            </ul>
          </v-alert>
          <v-alert v-if="importResults.unresolved.length > 0" type="warning" variant="tonal" rounded="lg" class="mb-4">
            <div class="font-weight-medium mb-2">{{ importResults.unresolved.length }} {{ t('unresolvedTitle') }}</div>
            <ul style="padding-left: 16px; margin: 0;">
              <li v-for="(u, idx) in importResults.unresolved" :key="`unres-${idx}`" class="text-body-2">
                {{ t('row') }} {{ u.row }} — {{ u.type === 'ingredient' ? t('unresolvedIngredient') : t('unresolvedComponent') }} "{{ u.refId }}"
              </li>
            </ul>
          </v-alert>
          <v-alert
            v-if="importResults.success === 0 && importResults.updated === 0 && importResults.errors.length === 0"
            type="info" variant="tonal" rounded="lg"
          >{{ t('noRows') }}</v-alert>
        </template>
      </div>

    </div>

    <!-- Footer -->
    <div v-if="step > 1" class="ccid__footer">
      <template v-if="step === 2">
        <button class="ccid-btn ccid-btn--back" @click="step = 1">{{ t('back') }}</button>
        <button class="ccid-btn ccid-btn--primary" :disabled="!canImport || importLoading" @click="doImport">
          <Upload :size="15" class="me-1" />
          {{ t('importBtn') }} {{ csvRows.length }} {{ t('rowsLabel') }}
        </button>
      </template>
      <template v-if="step === 3 && !importLoading">
        <button class="ccid-btn ccid-btn--back" @click="reset">{{ t('importAnother') }}</button>
        <button class="ccid-btn ccid-btn--primary" @click="$emit('update:modelValue', false)">{{ t('close') }}</button>
      </template>
    </div>
    </div>
  </div>
  </Transition>
  </Teleport>
</template>

<script>
import { X, Upload, Download, FileSpreadsheet, CheckCircle2 } from 'lucide-vue-next';
import { setAccessToken } from '@/api/client';
import { supabase } from '@/lib/supabase';
import {
  createMenuComponent,
  updateMenuComponent,
  replaceComponentIngredients,
  replaceComponentChildren,
  createComponentType,
  createComponentCategory,
} from '@/api/endpoints/menu.api';

function detectSeparator(firstLine) {
  const counts = { '\t': 0, ';': 0, ',': 0 };
  let inQuote = false;
  for (const ch of firstLine) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (!inQuote && ch in counts) counts[ch]++;
  }
  if (counts['\t'] > 0) return '\t';
  if (counts[';'] > 0) return ';';
  return ',';
}

function parseCSV(text) {
  const clean = String(text || '').replace(/^﻿/, '');
  if (!clean.trim()) return [];
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const sep = detectSeparator(firstLine);
  const result = [];
  let row = [];
  let cur = '';
  let inQuote = false;
  const pushCell = () => { row.push(cur.trim()); cur = ''; };
  const pushRow = () => { pushCell(); if (row.some((c) => c !== '')) result.push(row); row = []; };
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '"') {
      if (inQuote && clean[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === sep && !inQuote) {
      pushCell();
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      pushRow();
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || row.length > 0) pushRow();
  return result;
}

// Format packé de la colonne "Recipe" (confirmé sur le fichier réel components-2026-07-30.csv) :
// segments séparés par "|", chaque segment séparé par ">".
//   Ingredient (5 parties, slot 3 vide) : localId>Ingredient>>refId>quantity
//   Component  (4 parties, pas de slot vide) : localId>Component>refId>quantity
// `localId` (1ère partie) est toujours ignoré — bruit de génération de l'ancien système.
function parseRecipeSegments(recipeStr) {
  if (!recipeStr || !String(recipeStr).trim()) return [];
  const out = [];
  for (const seg of String(recipeStr).split('|')) {
    if (!seg.trim()) continue;
    const parts = seg.split('>');
    let type;
    let refId;
    let qtyRaw;
    if (parts.length >= 5) {
      type = (parts[1] || '').trim().toLowerCase();
      refId = (parts[3] || '').trim();
      qtyRaw = parts[4];
    } else if (parts.length === 4) {
      type = (parts[1] || '').trim().toLowerCase();
      refId = (parts[2] || '').trim();
      qtyRaw = parts[3];
    } else {
      continue;
    }
    const quantity = parseFloat(String(qtyRaw || '').replace(',', '.'));
    if (!refId || !Number.isFinite(quantity) || quantity <= 0) continue;
    if (type === 'ingredient') out.push({ type: 'ingredient', refId, quantity });
    else if (type === 'component' || type === 'combo item') out.push({ type: 'component', refId, quantity });
  }
  return out;
}

// Fichier compagnon Market Prices (le CSV d'origine, packé ou plat) : construit une Map
// ancien Market Price ID -> Item Name, pour résoudre les vieux ids d'Ingredient référencés
// dans la colonne "Recipe" (cf. BUG confirmé : ces ids sont d'anciens Market Price ID, pas
// des noms — le mapping ancien-id → nouveau-id n'est conservé nulle part côté Market Prices).
function parseCompanionMarketPrices(text) {
  const rows = parseCSV(text);
  const map = new Map();
  if (rows.length < 2) return map;
  const headers = rows[0];
  const norm = (s) => String(s || '').toLowerCase().replace(/[\s_\-()]+/g, '');
  const headerNorm = headers.map(norm);
  const idxItemName = headerNorm.findIndex((h) => ['itemname', 'name', 'nom', 'article'].includes(h));
  const idxMarketPrices = headerNorm.findIndex((h) => ['marketprices', 'prixmarche', 'prixdumarche', 'prixfournisseurs'].includes(h));
  const idxMarketPriceId = headerNorm.findIndex((h) => ['marketpriceid', 'id'].includes(h));
  const dataRows = rows.slice(1);
  if (idxMarketPrices !== -1 && idxItemName !== -1) {
    for (const row of dataRows) {
      const itemName = (row[idxItemName] || '').trim();
      const packed = (row[idxMarketPrices] || '').trim();
      if (!itemName || !packed) continue;
      for (const seg of packed.split('|')) {
        const id = (seg.split('>')[0] || '').trim();
        if (id) map.set(id, itemName);
      }
    }
  } else if (idxMarketPriceId !== -1 && idxItemName !== -1) {
    for (const row of dataRows) {
      const id = (row[idxMarketPriceId] || '').trim();
      const itemName = (row[idxItemName] || '').trim();
      if (id && itemName) map.set(id, itemName);
    }
  }
  return map;
}

const STORAGE_TYPE_ALIASES = { cold: 'Cold', dry: 'Dry', frozen: 'Frozen', freezer: 'Frozen' };

export default {
  name: 'ComponentCsvImportDrawer',
  components: { X, Upload, Download, FileSpreadsheet, CheckCircle2 },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'imported'],

  data() {
    return {
      // Traductions auto-contenues au composant (pattern MarketPriceCsvImportDrawer.vue) : le
      // fichier global translations.js est un namespace PLAT (pas scopé par composant) — des
      // clés génériques comme "back"/"close"/"row"/"stepFile" y sont déjà utilisées par d'autres
      // écrans (confirmé en clair : "close" existe déjà 2 fois ailleurs) et entreraient en
      // collision silencieuse (dernière définition gagne). Un drawer d'import CSV a besoin de
      // trop de libellés génériques pour rester sûr dans ce namespace global.
      locale: localStorage.getItem('appLocale') || 'en',
      step: 1,
      dropping: false,
      fileName: '',
      csvHeaders: [],
      csvRows: [],
      mapping: {},

      companionFileName: '',
      companionMap: null,

      importLoading: false,
      importProgress: 0,
      importResults: null,

      fields: [
        { key: 'id', required: false },
        { key: 'name', required: true },
        { key: 'category', required: true },
        { key: 'componentType', required: false },
        { key: 'unit', required: true },
        { key: 'numberOfUnitsRecipe', required: false },
        { key: 'packagingType', required: false },
        { key: 'numberOfUnits', required: false },
        { key: 'storageType', required: false },
        { key: 'description', required: false },
        { key: 'recipe', required: false },
      ],

      translations: {
        en: {
          compCsvImportTitle: 'Import Components',
          stepFile: 'File', stepMapping: 'Mapping', stepResults: 'Results',
          stepLabelFile: 'Choose a CSV file',
          stepLabelMapping: 'Map columns to fields',
          stepLabelResults: 'Import results',
          dropTitle: 'Drop a CSV file here',
          dropSub: 'or click to browse',
          chooseFile: 'Choose a file',
          expectedFormat: 'Expected format',
          formatDesc: 'First row = headers · Comma or semicolon separator · UTF-8 encoding',
          downloadTemplate: 'Download template',
          companionTitle: 'Companion Market Prices file (optional)',
          companionDesc: 'Some Recipe references in the Components file are old Market Price IDs from a previous system. Providing the original Market Prices CSV lets us resolve them by ingredient name.',
          companionChoose: 'Choose a companion file',
          companionIdsLoaded: 'old id(s) loaded for resolution',
          mapColumns: 'Map CSV columns to component fields',
          required: 'required',
          back: 'Back',
          importBtn: 'Import',
          rowsLabel: 'row(s)',
          importing: 'Importing',
          createdOk: 'component(s) created.',
          updatedOk: 'component(s) updated.',
          errors: 'error(s)',
          row: 'Row',
          unresolvedTitle: 'unresolved recipe reference(s) — the component was still created/updated without that line.',
          unresolvedIngredient: 'Ingredient',
          unresolvedComponent: 'Sub-component',
          noRows: 'Nothing to import (empty file?)',
          importAnother: 'Import another file',
          close: 'Close',
          missingRequiredMapping: 'Map all required fields (name, category, unit) before importing.',
          f_id: 'Component ID',
          f_name: 'Component Name',
          f_category: 'Category',
          f_componentType: 'Component Type',
          f_unit: 'Unit',
          f_numberOfUnitsRecipe: 'Number of Units per Recipe',
          f_packagingType: 'Packaging Type',
          f_numberOfUnits: 'Number of units',
          f_storageType: 'Storage Type',
          f_description: 'Description',
          f_recipe: 'Recipe',
          err_missingName: 'Missing component name',
          err_missingCategory: 'Missing category (required)',
          err_missingUnit: 'Missing unit (required)',
        },
        fr: {
          compCsvImportTitle: 'Importer des composants',
          stepFile: 'Fichier', stepMapping: 'Colonnes', stepResults: 'Résultats',
          stepLabelFile: 'Choisissez un fichier CSV',
          stepLabelMapping: 'Associez les colonnes aux champs',
          stepLabelResults: "Résultats de l'importation",
          dropTitle: 'Glissez un fichier CSV ici',
          dropSub: 'ou cliquez pour parcourir',
          chooseFile: 'Choisir un fichier',
          expectedFormat: 'Format attendu',
          formatDesc: 'Première ligne = en-têtes · Séparateur virgule ou point-virgule · Encodage UTF-8',
          downloadTemplate: 'Télécharger le modèle',
          companionTitle: 'Fichier compagnon Market Prices (optionnel)',
          companionDesc: "Certaines références de la colonne Recipe du fichier Components sont d'anciens Market Price ID d'un système précédent. Fournir le CSV Market Prices d'origine permet de les résoudre par nom d'ingrédient.",
          companionChoose: 'Choisir un fichier compagnon',
          companionIdsLoaded: 'ancien(s) id chargé(s) pour la résolution',
          mapColumns: 'Associez les colonnes CSV aux champs du composant',
          required: 'requis',
          back: 'Retour',
          importBtn: 'Importer',
          rowsLabel: 'ligne(s)',
          importing: 'Importation',
          createdOk: 'composant(s) créé(s).',
          updatedOk: 'composant(s) mis à jour.',
          errors: 'erreur(s)',
          row: 'Ligne',
          unresolvedTitle: "référence(s) de recette non résolue(s) — le composant a quand même été créé/mis à jour sans cette ligne.",
          unresolvedIngredient: 'Ingrédient',
          unresolvedComponent: 'Sous-composant',
          noRows: 'Rien à importer (fichier vide ?)',
          importAnother: 'Importer un autre fichier',
          close: 'Fermer',
          missingRequiredMapping: "Associez tous les champs obligatoires (nom, catégorie, unité) avant d'importer.",
          f_id: 'Component ID',
          f_name: 'Nom du composant',
          f_category: 'Catégorie',
          f_componentType: 'Type de composant',
          f_unit: 'Unité',
          f_numberOfUnitsRecipe: 'Nombre d\'unités par recette',
          f_packagingType: "Type d'emballage",
          f_numberOfUnits: "Nombre d'unités",
          f_storageType: 'Type de stockage',
          f_description: 'Description',
          f_recipe: 'Recipe',
          err_missingName: 'Nom du composant manquant',
          err_missingCategory: 'Catégorie manquante (obligatoire)',
          err_missingUnit: 'Unité manquante (obligatoire)',
        },
      },
    };
  },

  computed: {
    steps() {
      return [this.t('stepFile'), this.t('stepMapping'), this.t('stepResults')];
    },
    stepLabel() {
      const labels = [this.t('stepLabelFile'), this.t('stepLabelMapping'), this.t('stepLabelResults')];
      return labels[this.step - 1] || '';
    },
    columnOptions() {
      const ignore = this.locale === 'fr' ? '— Ignorer —' : '— Ignore —';
      return [{ title: ignore, value: null }, ...this.csvHeaders.map((h) => ({ title: h, value: h }))];
    },
    canImport() {
      return !!(this.mapping.name && this.mapping.category && this.mapping.unit && this.csvRows.length > 0);
    },
    importPct() {
      const total = this.csvRows.length || 0;
      return total ? Math.round((this.importProgress / total) * 100) : 0;
    },
    localizedFields() {
      return this.fields.map((f) => ({ ...f, label: this.t('f_' + f.key) }));
    },
    autoCreatedSummary() {
      const c = this.importResults?.autoCreated;
      if (!c) return '';
      const fr = this.locale === 'fr';
      const parts = [];
      if (c.types?.length) parts.push(`${c.types.length} ${fr ? 'type(s) de composant' : 'component type(s)'}`);
      if (c.categories?.length) parts.push(`${c.categories.length} ${fr ? 'catégorie(s) de composant' : 'component categor(y/ies)'}`);
      if (!parts.length) return '';
      return (fr ? 'Créé(s) automatiquement : ' : 'Automatically created: ') + parts.join(', ') + '.';
    },
  },

  watch: {
    modelValue(val) {
      if (!val) this.reset();
    },
  },

  mounted() {
    window.addEventListener('locale-changed', this._onLocale);
  },
  beforeUnmount() {
    window.removeEventListener('locale-changed', this._onLocale);
  },

  methods: {
    t(key) {
      return this.translations[this.locale]?.[key] ?? key;
    },
    _onLocale(e) {
      this.locale = e.detail?.locale || 'en';
    },

    reset() {
      this.step = 1;
      this.dropping = false;
      this.fileName = '';
      this.csvHeaders = [];
      this.csvRows = [];
      this.mapping = {};
      this.companionFileName = '';
      this.companionMap = null;
      this.importLoading = false;
      this.importProgress = 0;
      this.importResults = null;
    },

    setMapping(key, val) {
      this.mapping = { ...this.mapping, [key]: val };
    },

    onFileChange(e) {
      const file = e.target.files?.[0];
      if (file) this.loadFile(file);
      e.target.value = '';
    },
    onDrop(e) {
      this.dropping = false;
      const file = e.dataTransfer?.files?.[0];
      if (file) this.loadFile(file);
    },
    loadFile(file) {
      this.fileName = file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        const parsed = parseCSV(e.target.result || '');
        if (parsed.length < 2) return;
        this.csvHeaders = parsed[0];
        this.csvRows = parsed.slice(1).filter((r) => r.some((c) => c !== ''));
        this.autoMap();
        this.step = 2;
      };
      reader.readAsText(file, 'UTF-8');
    },

    onCompanionFileChange(e) {
      const file = e.target.files?.[0];
      if (file) this.loadCompanionFile(file);
      e.target.value = '';
    },
    loadCompanionFile(file) {
      this.companionFileName = file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.companionMap = parseCompanionMarketPrices(e.target.result || '');
      };
      reader.readAsText(file, 'UTF-8');
    },
    clearCompanion() {
      this.companionFileName = '';
      this.companionMap = null;
    },

    autoMap() {
      const normalize = (s) => String(s || '').toLowerCase().replace(/[\s_\-()]+/g, '');
      const headerNorm = this.csvHeaders.map(normalize);
      const aliases = {
        id: ['componentid', 'id'],
        name: ['componentname', 'name', 'nom'],
        category: ['category', 'categorie', 'catégorie'],
        componentType: ['componenttype', 'type'],
        unit: ['unit', 'unite', 'unité'],
        numberOfUnitsRecipe: ['numberofunitsperrecipe', 'numberofunitsrecipe', 'unitsperrecipe'],
        packagingType: ['packagingtype', 'typeemballage'],
        numberOfUnits: ['numberofunits', 'nombredunites'],
        storageType: ['storagetype', 'typestockage'],
        description: ['description'],
        recipe: ['recipe', 'recette'],
      };
      const newMapping = {};
      for (const field of this.fields) newMapping[field.key] = null;
      for (const [field, aliasList] of Object.entries(aliases)) {
        const idx = headerNorm.findIndex((h) => aliasList.includes(h));
        if (idx !== -1) newMapping[field] = this.csvHeaders[idx];
      }
      this.mapping = newMapping;
    },

    downloadTemplate() {
      const headers = [
        'Component ID', 'Component Name', 'Category', 'Component Type', 'Unit',
        'Number of Units per Recipe', 'Packaging Type', 'Number of units', 'Storage Type',
        'Description', 'Recipe',
      ];
      const example = [
        '', 'Coleslaw', 'Food', 'Veg', 'kg', '1.000', '', '', 'Cold', '',
        '1>Ingredient>>ingredient-id-1>1.000|2>Ingredient>>ingredient-id-2>0.500',
      ];
      const csv = [headers.join(','), example.join(',')].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'components_template.csv';
      a.click();
      URL.revokeObjectURL(url);
    },

    buildColumnIndex() {
      const colIdx = (colName) => (colName != null ? this.csvHeaders.indexOf(colName) : -1);
      const idxOf = {};
      for (const field of this.fields) idxOf[field.key] = colIdx(this.mapping[field.key]);
      return idxOf;
    },
    getCell(row, idxOf, key) {
      const idx = idxOf[key];
      return idx >= 0 ? (row[idx] || '').trim() : '';
    },

    async ensureAuth() {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) setAccessToken(token);
      } catch { /* ignore */ }
    },

    // Lookups nom→id des Ingredient existants (même mécanisme que MenuItemCsvImportDrawer.vue
    // `ingredientNameToId`, réutilisé tel quel) — construit aussi le Set des ids valides pour la
    // résolution directe (priorité (a) : le refId de Recipe est déjà un vrai id de ce tenant,
    // cas d'un réimport après export packé de cette base).
    buildIngredientLookups() {
      const nameToId = new Map();
      const validIds = new Set();
      const rawList = this.$store.getters['marketPriceIngredients/rows'] || [];
      for (const mp of rawList) {
        const ingredients = mp?.ingredients || mp?.ingredientList || mp?.items || mp?.data?.ingredients || [];
        for (const ing of (Array.isArray(ingredients) ? ingredients : [])) {
          const id = String(
            ing?.id ?? ing?._id ?? ing?.ingredientId ?? ing?.ingredient_id ??
            ing?.ingredient?.id ?? ing?.ingredient?._id ?? ''
          ).trim();
          const name = String(ing?.name ?? ing?.itemName ?? ing?.ingredientName ?? ing?.label ?? '').trim().toLowerCase();
          if (id) validIds.add(id);
          if (id && name && !nameToId.has(name)) nameToId.set(name, id);
        }
      }
      return { nameToId, validIds };
    },

    resolveStorageType(raw) {
      const key = String(raw || '').trim().toLowerCase();
      return STORAGE_TYPE_ALIASES[key] || undefined;
    },

    async doImport() {
      this.importLoading = true;
      this.importProgress = 0;
      this.step = 3;
      await this.ensureAuth();

      await Promise.all([
        this.$store.dispatch('menuComponents/fetchComponents', { forceRefresh: true }),
        this.$store.dispatch('componentTypes/fetchComponentTypes', { forceRefresh: true }),
        this.$store.dispatch('componentCategories/fetchComponentCategories', { forceRefresh: true }),
        this.$store.dispatch('marketPriceIngredients/fetchRows', { forceRefresh: true }),
      ]);

      const results = {
        success: 0,
        updated: 0,
        errors: [],
        unresolved: [],
        autoCreated: { types: [], categories: [] },
      };

      const idxOf = this.buildColumnIndex();
      const { nameToId: ingredientNameToId, validIds: ingredientValidIds } = this.buildIngredientLookups();

      // Map "Component ID" (colonne CSV, id legacy ou vrai cuid si réexport) -> Component Name,
      // construite depuis TOUTES les lignes du fichier — permet de résoudre les segments
      // "Component" de Recipe qui référencent une AUTRE ligne du même CSV, quel que soit l'ordre
      // (ex. fichier réel : la ligne 8 référence la ligne 25, définie plus loin dans le fichier).
      const csvIdToName = new Map();
      for (const row of this.csvRows) {
        const csvId = this.getCell(row, idxOf, 'id');
        const name = this.getCell(row, idxOf, 'name');
        if (csvId && name) csvIdToName.set(csvId, name);
      }

      // Référentiels existants (rafraîchis ci-dessus)
      const existingComponents = this.$store.getters['menuComponents/rows'] || [];
      const componentByName = new Map();
      const componentById = new Map();
      for (const c of existingComponents) {
        const id = String(c?.id || '');
        const name = String(c?.name || '').trim().toLowerCase();
        if (id) componentById.set(id, c);
        if (name && !componentByName.has(name)) componentByName.set(name, c);
      }
      const existingTypes = this.$store.getters['componentTypes/componentTypes'] || [];
      const typeByName = new Map(existingTypes.map((t) => [String(t?.name || '').trim().toLowerCase(), t]));
      const existingCategories = this.$store.getters['componentCategories/componentCategories'] || [];
      const categoryByKey = new Map(
        existingCategories.map((c) => [`${c?.typeId}::${String(c?.name || '').trim().toLowerCase()}`, c])
      );

      // Cache des types/catégories créés PENDANT ce run (évite un doublon si plusieurs lignes
      // partagent la même Category/Component Type).
      const typeCache = new Map();
      const categoryCache = new Map();

      const resolveComponentType = async (rawCategory) => {
        const key = String(rawCategory || '').trim();
        if (!key) return undefined;
        const lower = key.toLowerCase();
        if (typeCache.has(lower)) return typeCache.get(lower);
        const existing = typeByName.get(lower);
        if (existing) { typeCache.set(lower, existing); return existing; }
        try {
          const res = await createComponentType({ name: key });
          const created = { id: res?.id, name: key };
          typeCache.set(lower, created);
          typeByName.set(lower, created);
          results.autoCreated.types.push(key);
          return created;
        } catch {
          return undefined;
        }
      };

      const resolveComponentCategory = async (rawComponentType, type) => {
        const key = String(rawComponentType || '').trim();
        if (!key || !type?.id) return undefined;
        const lower = key.toLowerCase();
        const cacheKey = `${type.id}::${lower}`;
        if (categoryCache.has(cacheKey)) return categoryCache.get(cacheKey);
        const existing = categoryByKey.get(cacheKey);
        if (existing) { categoryCache.set(cacheKey, existing); return existing; }
        try {
          const res = await createComponentCategory({ name: key, typeId: type.id });
          const created = { id: res?.id, name: key, typeId: type.id };
          categoryCache.set(cacheKey, created);
          categoryByKey.set(cacheKey, created);
          results.autoCreated.categories.push(key);
          return created;
        } catch {
          return undefined;
        }
      };

      // csvId (colonne "Component ID" de CETTE ligne) -> id réel après création/mise à jour,
      // pour la passe 2 (résolution des sous-composants "Component" dans Recipe).
      const csvIdToRealId = new Map();
      const nameToRealId = new Map();
      const rowsWithComponentSegments = [];

      for (let i = 0; i < this.csvRows.length; i++) {
        const row = this.csvRows[i];
        const rowNum = i + 2;
        try {
          const name = this.getCell(row, idxOf, 'name');
          if (!name) {
            results.errors.push({ row: rowNum, message: this.t('err_missingName') });
            this.importProgress++;
            continue;
          }
          const categoryRaw = this.getCell(row, idxOf, 'category');
          if (!categoryRaw) {
            results.errors.push({ row: rowNum, message: this.t('err_missingCategory') });
            this.importProgress++;
            continue;
          }
          const componentTypeRaw = this.getCell(row, idxOf, 'componentType');
          const unit = this.getCell(row, idxOf, 'unit');
          if (!unit) {
            results.errors.push({ row: rowNum, message: this.t('err_missingUnit') });
            this.importProgress++;
            continue;
          }
          const numberOfUnitsRecipeRaw = this.getCell(row, idxOf, 'numberOfUnitsRecipe');
          const numberOfUnitsRecipe = numberOfUnitsRecipeRaw
            ? parseFloat(numberOfUnitsRecipeRaw.replace(',', '.'))
            : 1;
          const packagingType = this.getCell(row, idxOf, 'packagingType') || undefined;
          const numberOfUnitsRaw = this.getCell(row, idxOf, 'numberOfUnits');
          const packedUnits = numberOfUnitsRaw ? parseFloat(numberOfUnitsRaw.replace(',', '.')) : undefined;
          const storageType = this.resolveStorageType(this.getCell(row, idxOf, 'storageType'));
          const description = this.getCell(row, idxOf, 'description') || undefined;
          const csvId = this.getCell(row, idxOf, 'id');
          const recipeRaw = this.getCell(row, idxOf, 'recipe');

          const segments = parseRecipeSegments(recipeRaw);
          const ingredientSegments = segments.filter((s) => s.type === 'ingredient');
          const componentSegments = segments.filter((s) => s.type === 'component');

          const ingredientLines = [];
          for (const seg of ingredientSegments) {
            let resolvedId;
            if (ingredientValidIds.has(seg.refId)) {
              resolvedId = seg.refId;
            } else if (this.companionMap && this.companionMap.has(seg.refId)) {
              const itemName = this.companionMap.get(seg.refId);
              resolvedId = ingredientNameToId.get(String(itemName || '').trim().toLowerCase());
            }
            if (resolvedId) {
              ingredientLines.push({ ingredientId: resolvedId, quantity: seg.quantity });
            } else {
              results.unresolved.push({ row: rowNum, type: 'ingredient', refId: seg.refId });
            }
          }

          const type = await resolveComponentType(categoryRaw);
          const category = await resolveComponentCategory(componentTypeRaw, type);

          const payload = {
            name,
            unit: unit || undefined,
            category: categoryRaw || undefined,
            componentCategory: componentTypeRaw || undefined,
            componentTypeId: type?.id,
            componentCategoryId: category?.id,
            numberOfUnitsRecipe: Number.isFinite(numberOfUnitsRecipe) ? numberOfUnitsRecipe : undefined,
            packedUnits,
            inventoryPackaging: packagingType,
            storageType,
            description,
          };
          Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

          // Cible d'upsert : "Component ID" CSV correspond à un cuid réel de ce tenant (réimport
          // après export packé) -> update ; sinon un composant de même nom existe déjà -> update
          // (évite les doublons sur réimport du même fichier legacy) ; sinon -> création.
          let realId;
          const existingById = csvId ? componentById.get(csvId) : undefined;
          const existingByName = componentByName.get(name.trim().toLowerCase());
          const target = existingById || existingByName;

          if (target) {
            await updateMenuComponent(target.id, payload);
            realId = target.id;
            results.updated++;
          } else {
            const created = await createMenuComponent(payload);
            realId = created?.id;
            results.success++;
          }

          if (realId) {
            await replaceComponentIngredients(realId, ingredientLines);
            componentById.set(realId, { id: realId, name });
            componentByName.set(name.trim().toLowerCase(), { id: realId, name });
            nameToRealId.set(name.trim().toLowerCase(), realId);
            if (csvId) csvIdToRealId.set(csvId, realId);
            if (componentSegments.length > 0) {
              rowsWithComponentSegments.push({ rowNum, realId, componentSegments });
            }
          }
        } catch (e) {
          const msg = e?.response?.data?.message || e?.message || 'Import failed';
          results.errors.push({ row: rowNum, message: Array.isArray(msg) ? msg.join(', ') : msg });
        }
        this.importProgress++;
      }

      // Passe 2 : résolution des sous-composants ("Component" dans Recipe), après que toutes
      // les lignes du fichier ont un id réel — nécessaire car une ligne peut référencer une
      // AUTRE ligne définie plus loin dans le même fichier (auto-référence interne au CSV).
      for (const { rowNum, realId, componentSegments } of rowsWithComponentSegments) {
        const childLines = [];
        for (const seg of componentSegments) {
          const refName = csvIdToName.get(seg.refId);
          const resolvedId = (refName && nameToRealId.get(refName.trim().toLowerCase()))
            || csvIdToRealId.get(seg.refId);
          if (resolvedId) {
            childLines.push({ childId: resolvedId, quantity: seg.quantity });
          } else {
            results.unresolved.push({ row: rowNum, type: 'component', refId: seg.refId });
          }
        }
        try {
          await replaceComponentChildren(realId, childLines);
        } catch (e) {
          const msg = e?.response?.data?.message || e?.message || 'Import failed';
          results.errors.push({ row: rowNum, message: Array.isArray(msg) ? msg.join(', ') : msg });
        }
      }

      this.importResults = results;
      this.importLoading = false;
      if (results.success > 0 || results.updated > 0) this.$emit('imported');
    },
  },
};
</script>

<style scoped>
.ccid-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
}

.ccid-panel {
  width: 520px;
  height: 100%;
  background: #ffffff;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ccid-enter-active,
.ccid-leave-active { transition: opacity 0.25s ease; }
.ccid-enter-active .ccid-panel,
.ccid-leave-active .ccid-panel { transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.ccid-enter-from,
.ccid-leave-to { opacity: 0; }
.ccid-enter-from .ccid-panel,
.ccid-leave-to .ccid-panel { transform: translateX(100%); }

.ccid__grad-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  background: #ff3131;
  flex-shrink: 0;
}
.ccid__header-icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ccid__header-titles { flex: 1; min-width: 0; }
.ccid__header-title { font-size: 15px; font-weight: 700; color: #fff; line-height: 1.2; }
.ccid__header-subtitle { font-size: 12px; color: rgba(255,255,255,.72); margin-top: 3px; }
.ccid__close-btn {
  width: 32px; height: 32px; border: none; border-radius: 8px;
  background: rgba(255,255,255,.18); color: rgba(255,255,255,.85);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .18s; flex-shrink: 0; margin-left: auto;
}
.ccid__close-btn:hover { background: rgba(255,255,255,.3); }

.ccid-step-bar { border-bottom: 1px solid rgba(0, 0, 0, 0.06); flex-shrink: 0; }
.ccid-body { flex: 1; overflow-y: auto; padding: 24px; }

.ccid__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
  flex-shrink: 0;
}
.ccid-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 22px; border-radius: 100px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all .2s; border: none; line-height: 1.4;
}
.ccid-btn:disabled { opacity: .45; cursor: not-allowed; }
.ccid-btn--back { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.ccid-btn--back:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; color: #374151; }
.ccid-btn--primary { background: #ff3131; color: #fff; box-shadow: 0 4px 14px rgba(255, 49, 49,.3); }
.ccid-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }

.ccid-step-dot {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #e5e7eb; color: #6b7280;
}
.ccid-step-dot--active { background: #ff3131; color: white; }
.ccid-step-dot--done { background: #16a34a; color: white; }
.ccid-step-line { background: #e5e7eb; }

.ccid-dropzone {
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
.ccid-dropzone:hover,
.ccid-dropzone--hover { border-color: #ff3131; background: rgba(255, 49, 49, 0.04); }
.ccid-dropzone--small { border-radius: 10px; position: relative; }

.ccid-companion-clear {
  margin-left: 8px;
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  display: flex;
  align-items: center;
}
.ccid-companion-clear:hover { color: #ff3131; }

/* ── Dark mode ── */
.ccid--dark.ccid-panel { background: #1f2937; }
.ccid--dark .ccid__footer { background: #1f2937; border-color: #2d3f55; }
.ccid--dark .ccid-step-bar { border-color: #2d3f55; }
.ccid--dark .ccid-step-line { background: #2d3f55; }
.ccid--dark .ccid-step-dot { background: #2d3f55; color: #9ca3af; }
.ccid--dark .ccid-step-dot--active { background: #ff3131; color: white; }
.ccid--dark .ccid-step-dot--done { background: #16a34a; color: white; }
.ccid--dark .ccid-dropzone { border-color: #2d3f55; }
.ccid--dark .ccid-dropzone:hover,
.ccid--dark .ccid-dropzone--hover { border-color: #ff3131; background: rgba(255, 49, 49, 0.08); }
.ccid--dark :deep(.v-navigation-drawer__content) { background-color: #1f2937; }
.ccid--dark :deep(.v-field) { background-color: #263548 !important; }
.ccid--dark :deep(.v-field__input),
.ccid--dark :deep(input) { color: #e5e7eb !important; }
.ccid--dark :deep(.v-select__selection-text) { color: #e5e7eb !important; }
.ccid--dark :deep(.v-field__outline) { --v-field-border-color: #2d3f55; }
.ccid--dark :deep(.v-list-item-title) { color: #e5e7eb; }

.ccid-map-select { border-radius: 10px; border: 1.5px solid #e5e7eb; font-size: var(--fs-base); }
.ccid-map-select:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255,49,49,.12); }
.ccid--dark .ccid-map-select {
  background-color: #1e293b; border-color: rgba(255,255,255,.14); color: #e5e7eb;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3E%3C/svg%3E");
}
.ccid-progress { width: 280px; max-width: 100%; height: 10px; background: #f1f5f9; border-radius: 100px; overflow: hidden; }
.ccid-progress__bar { height: 100%; background: #ff3131; border-radius: 100px; transition: width .25s ease; }
.ccid-progress__label { font-size: var(--fs-sm); color: #6b7280; }
.ccid--dark .ccid-progress { background: rgba(255,255,255,.08); }
.ccid--dark .ccid-progress__label { color: #94a3b8; }
</style>
