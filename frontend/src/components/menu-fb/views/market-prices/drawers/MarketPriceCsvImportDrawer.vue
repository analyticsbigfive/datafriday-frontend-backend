<template>
  <Teleport to="body">
  <Transition name="mpcid">
  <div v-if="modelValue" class="mpcid-overlay" @mousedown.self="$emit('update:modelValue', false)">
    <div class="mpcid-panel" :class="{ 'mpcid--dark': isDark }">
    <!-- Header -->
    <div class="mpcid__grad-header">
      <div class="mpcid__header-icon"><FileSpreadsheet :size="22" color="white" /></div>
      <div class="mpcid__header-titles">
        <div class="mpcid__header-title">{{ t('drawerTitle') }}</div>
        <div class="mpcid__header-subtitle">{{ stepLabel }}</div>
      </div>
      <button class="mpcid__close-btn" @click="$emit('update:modelValue', false)"><X :size="18" /></button>
    </div>

    <!-- Step indicator -->
    <div class="px-6 py-3 mpcid-step-bar">
      <div class="d-flex align-center" style="gap: 4px;">
        <template v-for="(s, i) in steps" :key="i">
          <div class="d-flex align-center" style="gap: 4px; flex-shrink: 0;">
            <div
              class="mpcid-step-dot"
              :class="{
                'mpcid-step-dot--active': step === i + 1,
                'mpcid-step-dot--done': step > i + 1,
              }"
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
          <div
            v-if="i < steps.length - 1"
            class="mpcid-step-line"
            style="flex: 1; height: 1px; min-width: 8px;"
          />
        </template>
      </div>
    </div>

    <!-- Body -->
    <div class="mpcid-body">

      <!-- ── Step 1 : Upload ── -->
      <div v-if="step === 1">
        <input ref="fileInput" type="file" accept=".csv,text/csv" style="display: none;" @change="onFileChange" />
        <div
          class="mpcid-dropzone d-flex flex-column align-center justify-center pa-10"
          :class="{ 'mpcid-dropzone--hover': dropping }"
          @click="$refs.fileInput.click()"
          @dragover.prevent="dropping = true"
          @dragleave.prevent="dropping = false"
          @drop.prevent="onDrop"
        >
          <FileSpreadsheet :size="52" class="mb-4" style="color: #9ca3af;" />
          <div class="text-h6 font-weight-medium mb-1">{{ t('dropTitle') }}</div>
          <div class="text-body-2 text-medium-emphasis mb-5">{{ t('dropSub') }}</div>
          <v-btn variant="outlined" rounded="lg" size="small" class="text-none" @click.stop="$refs.fileInput.click()">
            <Upload :size="16" class="mr-2" />
            {{ t('chooseFile') }}
          </v-btn>
        </div>
        <v-card variant="tonal" rounded="lg" class="mt-4 pa-4" elevation="0">
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
      </div>

      <!-- ── Step 2 : Mapping colonnes ── -->
      <div v-if="step === 2">
        <div class="d-flex align-center mb-4" style="gap: 8px;">
          <FileSpreadsheet :size="16" style="color: #6b7280; flex-shrink: 0;" />
          <span class="text-body-2 font-weight-medium">{{ fileName }}</span>
          <v-chip size="x-small" variant="tonal" color="primary">
            {{ csvRows.length }} {{ t('rowsLabel') }}
          </v-chip>
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
            <v-select
              :model-value="mapping[field.key]"
              @update:model-value="setMapping(field.key, $event)"
              :items="columnOptions"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              :menu-props="{ attach: 'body', offset: 4 }"
              style="flex: 1;"
            />
          </div>
        </div>
      </div>

      <!-- ── Step 2.5 : Vérification des noms ambigus (seulement si nécessaire) ── -->
      <div v-if="step === 3 && resolving">
        <v-alert type="warning" variant="tonal" density="compact" rounded="lg" class="mb-3">
          {{ t('resolveIntro') }}
        </v-alert>
        <div v-for="choice in resolutionChoices" :key="choice.key" class="mpcid-resolve-row mb-3">
          <div class="text-body-2 mb-2">
            <strong>"{{ choice.raw }}"</strong> {{ t('resolveResembles') }} <strong>"{{ choice.matchName }}"</strong>
            <v-chip size="x-small" variant="tonal" class="ml-2">{{ t('f_' + choice.type) }}</v-chip>
          </div>
          <v-radio-group v-model="choice.choice" hide-details density="compact" class="mt-0">
            <v-radio :label="`${t('useExisting')} « ${choice.matchName} »`" value="existing" />
            <v-radio :label="`${t('createNew')} « ${choice.raw} »`" value="new" />
          </v-radio-group>
        </div>
      </div>

      <!-- ── Step 3 : Résultats ── -->
      <div v-if="step === 3 && !resolving">
        <div v-if="importLoading" class="d-flex flex-column align-center justify-center py-12">
          <v-progress-circular indeterminate color="#ff3131" size="48" class="mb-4" />
          <div class="text-body-2 text-medium-emphasis">
            {{ sendingToServer ? t('sendingToServer') : `${t('importing')} ${importProgress}/${csvRows.length}` }}
          </div>
        </div>
        <template v-else-if="importResults">
          <v-alert v-if="autoCreatedSummary" type="info" variant="tonal" rounded="lg" class="mb-4">
            {{ autoCreatedSummary }}
          </v-alert>
          <v-alert v-if="importResults.success > 0" type="success" variant="tonal" rounded="lg" class="mb-4">
            <strong>{{ importResults.success }}</strong> {{ t('importedOk') }}
          </v-alert>
          <v-alert v-if="importResults.skipped > 0" type="info" variant="tonal" rounded="lg" class="mb-4">
            <strong>{{ importResults.skipped }}</strong> {{ t('skippedDuplicates') }}
          </v-alert>
          <v-alert v-if="importResults.errors.length > 0" type="error" variant="tonal" rounded="lg" class="mb-4">
            <div class="font-weight-medium mb-2">{{ importResults.errors.length }} {{ t('errors') }}</div>
            <ul style="padding-left: 16px; margin: 0;">
              <li v-for="(err, idx) in importResults.errors" :key="`${err.row}-${idx}`" class="text-body-2">
                {{ t('row') }} {{ err.row }} : {{ err.message }}
              </li>
            </ul>
          </v-alert>
          <v-alert v-if="importResults.success === 0 && importResults.skipped === 0 && importResults.errors.length === 0" type="info" variant="tonal" rounded="lg">
            {{ t('noRows') }}
          </v-alert>
        </template>
      </div>

    </div>

    <!-- Footer -->
    <div v-if="step > 1" class="mpcid__footer">
      <template v-if="step === 2">
        <button class="mpcid-btn mpcid-btn--back" @click="step = 1">{{ t('back') }}</button>
        <button
          class="mpcid-btn mpcid-btn--primary"
          :disabled="!canImport || importLoading"
          @click="startImport"
        >
          <span v-if="importLoading" class="spinner-border spinner-border-sm me-2" role="status"></span>
          <Upload v-else :size="15" class="me-1" />
          {{ t('importBtn') }} {{ csvRows.length }} {{ t('rowsLabel') }}
        </button>
      </template>
      <template v-if="step === 3 && resolving">
        <button class="mpcid-btn mpcid-btn--back" @click="resolving = false; step = 2">{{ t('back') }}</button>
        <button class="mpcid-btn mpcid-btn--primary" @click="confirmResolution">{{ t('continueBtn') }}</button>
      </template>
      <template v-if="step === 3 && !resolving && !importLoading">
        <button class="mpcid-btn mpcid-btn--back" @click="reset">{{ t('importAnother') }}</button>
        <button class="mpcid-btn mpcid-btn--primary" @click="$emit('update:modelValue', false)">{{ t('close') }}</button>
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
import { importMarketPrices, createSupplier } from '@/api/endpoints/menu.api';
import { createIndustrial } from '@/api/endpoints/industrial.api';
import { createMarketPriceType, createMarketPriceCategory } from '@/api/endpoints/market.price.api';
import { supabase } from '@/lib/supabase';

// Seuil de similarité (0-1) au-delà duquel deux noms sont considérés comme une probable faute
// de frappe plutôt que deux entités distinctes ("Metro Auxxerre" vs "Metro Auxerre" ≈ 0.92,
// "Metro Auxerre" vs "Metro Sens" ≈ 0.5 — assez d'écart pour ne pas confondre deux fournisseurs
// réellement différents qui partagent juste un mot).
const TYPO_SIMILARITY_THRESHOLD = 0.72;

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

function stringSimilarity(a, b) {
  const s1 = String(a || '').trim().toLowerCase();
  const s2 = String(b || '').trim().toLowerCase();
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(s1, s2) / maxLen;
}

function detectSeparator(firstLine) {
  const counts = { '\t': 0, ';': 0, ',': 0 };
  let inQuote = false;
  for (const ch of firstLine) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (!inQuote && ch in counts) counts[ch]++;
  }
  // Priorité : tab > point-virgule > virgule (tab = copier-coller depuis tableur)
  if (counts['\t'] > 0) return '\t';
  if (counts[';'] > 0) return ';';
  return ',';
}

function parseCSV(text) {
  // Supprimer le BOM UTF-8 éventuel
  const clean = text.replace(/^\uFEFF/, '');
  if (!clean.trim()) return [];
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const sep = detectSeparator(firstLine);
  // Parcours caractère par caractère sur TOUT le texte (pas ligne par ligne au préalable) :
  // un saut de ligne à l'intérieur d'un champ entre guillemets ne doit pas couper la ligne
  // logique (bug précédent : `split(/\r?\n/)` coupait avant toute prise en compte des
  // guillemets, désalignant les colonnes des lignes suivantes).
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

export default {
  name: 'MarketPriceCsvImportDrawer',
  components: { X, Upload, Download, FileSpreadsheet, CheckCircle2 },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
    // Fournisseurs existants — pour relier supplierId par nom (cf. MarketPriceCreateDrawer.vue).
    suppliers: { type: Array, default: () => [] },
    // Industriels existants — pour relier industrialId par nom (même principe que suppliers).
    industrials: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue', 'imported'],

  data() {
    return {
      locale: localStorage.getItem('appLocale') || 'en',
      step: 1,
      dropping: false,
      fileName: '',
      csvHeaders: [],
      csvRows: [],
      mapping: {},
      importLoading: false,
      importProgress: 0,
      sendingToServer: false,
      importResults: null,
      resolving: false,
      resolutionChoices: [],
      pendingAutoCreate: [],

      priceFields: [
        { key: 'itemName',               required: true },
        { key: 'unit',                   required: true },
        { key: 'price',                  required: true },
        { key: 'goodType',               required: true },
        { key: 'recipeUnit',             required: false },
        { key: 'purchaseUnitConversion', required: false },
        { key: 'category',               required: false },
        { key: 'supplierName',           required: false },
        { key: 'supplierItemName',       required: false },
        { key: 'unitsPerPurchase',       required: false },
        { key: 'purchasePackaging',      required: false },
        { key: 'inventoryPackaging',     required: false },
        { key: 'industrialName',         required: false },
        { key: 'image',                  required: false },
        { key: 'packedUnits',            required: false },
        { key: 'numberOfUnits',          required: false },
        { key: 'packingLength',          required: false },
        { key: 'packingWidth',           required: false },
        { key: 'packingHeight',          required: false },
      ],

      translations: {
        en: {
          drawerTitle: 'Import Market Prices',
          stepFile: 'File', stepMapping: 'Mapping', stepResults: 'Results',
          stepLabelFile: 'Choose a CSV file',
          stepLabelMapping: 'Map columns to fields',
          stepLabelResults: 'Import results',
          stepLabelResolving: 'Confirm a few close matches',
          dropTitle: 'Drop a CSV file here',
          dropSub: 'or click to browse',
          chooseFile: 'Choose a file',
          expectedFormat: 'Expected format',
          formatDesc: 'First row = headers · Comma or semicolon separator · UTF-8 encoding',
          downloadTemplate: 'Download template',
          mapColumns: 'Map CSV columns to market price fields',
          required: 'required',
          back: 'Back',
          continueBtn: 'Continue',
          importBtn: 'Import',
          rowsLabel: 'row(s)',
          importing: 'Importing',
          importedOk: 'price(s) imported successfully.',
          errors: 'error(s)',
          row: 'Row',
          resolveIntro: 'Some names in your file are close to existing ones but not identical — please confirm what to do for each before importing.',
          resolveResembles: 'resembles',
          useExisting: 'Use',
          createNew: 'Create new',
          noRows: 'Nothing to import (empty file?)',
          importAnother: 'Import another file',
          close: 'Close',
          f_itemName: 'Item Name',
          f_unit: 'Purchase Unit (kg, l, pcs…)',
          f_price: 'Price (Package Total)',
          f_goodType: 'Good Type',
          f_recipeUnit: 'Recipe Unit',
          f_purchaseUnitConversion: 'Purchase Unit Conversion',
          f_category: 'Category',
          f_supplierName: 'Supplier Name',
          f_supplierItemName: 'Supplier Item Name',
          f_unitsPerPurchase: 'Units per Purchase',
          f_purchasePackaging: 'Purchased In (Packaging)',
          f_inventoryPackaging: 'Stored In (Packaging)',
          f_industrialName: 'Industrial',
          f_image: 'Image URL',
          f_packedUnits: 'Packed Units',
          f_numberOfUnits: 'Number of Units',
          f_packingLength: 'Packing Length (cm)',
          f_packingWidth: 'Packing Width (cm)',
          f_packingHeight: 'Packing Height (cm)',
          err_missingName: 'Missing item name',
          err_missingUnit: 'Missing unit (required)',
          err_missingPrice: 'Missing or invalid price (required)',
          err_missingGoodType: 'Missing good type (required)',
          err_invalidGoodType: 'Could not resolve or auto-create this good type',
          missingRequiredMapping: 'Map all required fields (unit, price, good type) before importing.',
          skippedDuplicates: 'duplicate(s) skipped (already imported).',
          sendingToServer: 'Sending to server…',
          unexpectedEmptyResponse: 'Rows were sent to the server, but the response could not be read (0 created/skipped/errors reported) — the backend may need to be restarted with the latest changes. Please check before retrying.',
        },
        fr: {
          drawerTitle: 'Importer des prix du marché',
          stepFile: 'Fichier', stepMapping: 'Colonnes', stepResults: 'Résultats',
          stepLabelFile: 'Choisissez un fichier CSV',
          stepLabelMapping: 'Associez les colonnes aux champs',
          stepLabelResults: "Résultats de l'importation",
          stepLabelResolving: 'Confirmez quelques correspondances',
          dropTitle: 'Glissez un fichier CSV ici',
          dropSub: 'ou cliquez pour parcourir',
          chooseFile: 'Choisir un fichier',
          expectedFormat: 'Format attendu',
          formatDesc: 'Première ligne = en-têtes · Séparateur virgule ou point-virgule · Encodage UTF-8',
          downloadTemplate: 'Télécharger le modèle',
          mapColumns: 'Associez les colonnes CSV aux champs',
          required: 'requis',
          back: 'Retour',
          continueBtn: 'Continuer',
          importBtn: 'Importer',
          rowsLabel: 'ligne(s)',
          importing: 'Importation',
          importedOk: 'prix importé(s) avec succès.',
          errors: 'erreur(s)',
          row: 'Ligne',
          resolveIntro: "Certains noms de votre fichier ressemblent à des noms existants sans être identiques — confirmez ce qu'il faut faire pour chacun avant d'importer.",
          resolveResembles: 'ressemble à',
          useExisting: 'Utiliser',
          createNew: 'Créer un nouveau',
          noRows: 'Rien à importer (fichier vide ?)',
          importAnother: 'Importer un autre fichier',
          close: 'Fermer',
          f_itemName: "Nom de l'article",
          f_unit: "Unité d'achat (kg, l, pcs…)",
          f_price: 'Prix (total du conditionnement)',
          f_goodType: 'Type de produit',
          f_recipeUnit: 'Unité de recette',
          f_purchaseUnitConversion: "Conversion d'unité d'achat",
          f_category: 'Catégorie',
          f_supplierName: 'Nom du fournisseur',
          f_supplierItemName: 'Article fournisseur',
          f_unitsPerPurchase: 'Unités par achat',
          f_purchasePackaging: 'Acheté en (emballage)',
          f_inventoryPackaging: 'Stocké en (emballage)',
          f_industrialName: 'Industriel',
          f_image: 'URL image',
          f_packedUnits: 'Unités emballées',
          f_numberOfUnits: "Nombre d'unités",
          f_packingLength: 'Longueur emballage (cm)',
          f_packingWidth: 'Largeur emballage (cm)',
          f_packingHeight: 'Hauteur emballage (cm)',
          err_missingName: "Nom de l'article manquant",
          err_missingUnit: "Unité manquante (obligatoire)",
          err_missingPrice: 'Prix manquant ou invalide (obligatoire)',
          err_missingGoodType: 'Type de produit manquant (obligatoire)',
          err_invalidGoodType: "Impossible de résoudre ou de créer automatiquement ce type de produit",
          missingRequiredMapping: 'Associez tous les champs obligatoires (unité, prix, type de produit) avant d\'importer.',
          skippedDuplicates: 'doublon(s) ignoré(s) (déjà importé(s)).',
          sendingToServer: 'Envoi vers le serveur…',
          unexpectedEmptyResponse: "Des lignes ont été envoyées au serveur, mais la réponse n'a pas pu être interprétée (0 créé/ignoré/erreur signalé) — le backend doit peut-être être redémarré avec la dernière version. Vérifiez avant de réessayer.",
        },
      },
    };
  },

  computed: {
    steps() {
      return [this.t('stepFile'), this.t('stepMapping'), this.t('stepResults')];
    },
    stepLabel() {
      if (this.step === 3 && this.resolving) return this.t('stepLabelResolving');
      const labels = [this.t('stepLabelFile'), this.t('stepLabelMapping'), this.t('stepLabelResults')];
      return labels[this.step - 1] || '';
    },
    autoCreatedSummary() {
      const c = this.importResults?.autoCreated;
      if (!c) return '';
      const fr = this.locale === 'fr';
      const parts = [];
      if (c.suppliers?.length) parts.push(`${c.suppliers.length} ${fr ? 'fournisseur(s)' : 'supplier(s)'}`);
      if (c.industrials?.length) parts.push(`${c.industrials.length} ${fr ? 'industriel(s)' : 'industrial(s)'}`);
      if (c.types?.length) parts.push(`${c.types.length} ${fr ? 'type(s)' : 'good type(s)'}`);
      if (c.categories?.length) parts.push(`${c.categories.length} ${fr ? 'catégorie(s)' : 'categor(y/ies)'}`);
      if (!parts.length) return '';
      return (fr ? 'Créé(s) automatiquement : ' : 'Automatically created: ') + parts.join(', ') + '.';
    },
    columnOptions() {
      const ignore = this.locale === 'fr' ? '— Ignorer —' : '— Ignore —';
      return [
        { title: ignore, value: null },
        ...this.csvHeaders.map((h) => ({ title: h, value: h })),
      ];
    },
    canImport() {
      return !!(
        this.mapping['itemName'] &&
        this.mapping['unit'] &&
        this.mapping['price'] &&
        this.mapping['goodType'] &&
        this.csvRows.length > 0
      );
    },
    localizedFields() {
      return this.priceFields.map((f) => ({
        ...f,
        label: this.t('f_' + f.key),
      }));
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
    setMapping(key, val) {
      this.mapping = { ...this.mapping, [key]: val };
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
      this.importLoading = false;
      this.importProgress = 0;
      this.sendingToServer = false;
      this.importResults = null;
      this.resolving = false;
      this.resolutionChoices = [];
      this.pendingAutoCreate = [];
    },

    onFileChange(e) {
      const file = e.target.files?.[0];
      if (file) this.loadFile(file);
      // Reset input so re-selecting same file triggers change
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

    autoMap() {
      const normalize = (s) => String(s || '').toLowerCase().replace(/[\s_\-()]+/g, '');
      const headerNorm = this.csvHeaders.map(normalize);
      const aliases = {
        itemName:               ['itemname', 'name', 'nom', 'article', 'item', 'nomarticle', 'produit'],
        recipeUnit:             ['recipeunit', 'uniterecette', 'unitérecette', 'recunit', 'unitederecette'],
        purchaseUnitConversion: ['purchaseunitconversion', 'purchaseunitconversioneur',
                                 'conversion', 'conversionunite', 'conversionunitéachat', 'puc'],
        goodType:               ['goodtype', 'type', 'typeproduit', 'good_type'],
        category:               ['category', 'categorie', 'catégorie', 'cat'],
        supplierName:           ['suppliername', 'supplier', 'fournisseur', 'nomfournisseur'],
        supplierItemName:       ['supplieritemname', 'supplieritem', 'articlefournisseur',
                                 'artictefournisseur', 'supplier_item', 'supplieritemeur'],
        unit:                   ['unit', 'unite', 'unité', 'unitéachat', 'purchaseunit', 'purchaseuniteur'],
        unitsPerPurchase:       ['unitsperpurchase', 'unitesparachat', 'unitésparachat', 'units_per_purchase'],
        // "Price Per Unit (EUR)" → normalize → "priceperuniteur". `pricePerUnit` n'est PAS un
        // champ mappable ici : comme partout ailleurs dans l'app (MarketPriceCreateDrawer,
        // MarketPriceEditSupplierDrawer), il est toujours recalculé (price / unitsPerPurchase),
        // jamais saisi directement — cf. doImport(). "Cost Per Recipe Unit (EUR)" (export
        // informatif) n'a délibérément aucun alias : c'est une valeur dérivée de second niveau
        // (pricePerUnit × purchaseUnitConversion) sans champ d'entrée correspondant côté API.
        price:                  ['price', 'prix', 'priceperunit', 'priceperuniteur',
                                 'prixparunite', 'prixparuniteeur', 'prixparunité',
                                 'cost', 'cout', 'coût', 'tarif', 'montant', 'amount',
                                 'unitprice', 'prixunit', 'prixunitaire', 'coutachat',
                                 'costprice', 'purchaseprice', 'prixachat',
                                 // "Price (Package Total) (EUR)" → normalize → "pricepackagetotaleur"
                                 'pricepackagetotal', 'pricepackagetotaleur',
                                 'prixtotalconditionnement', 'prixtotal', 'prixtotalpack'],
        purchasePackaging:      ['purchasepackaging', 'purchasedinpackaging', 'purchasedin', 'acheteen'],
        inventoryPackaging:     ['inventorypackaging', 'storedinpackaging', 'storedin', 'stockeen',
                                 'packaging', 'emballage'],
        industrialName:         ['industrial', 'industriel', 'manufacturer', 'fabricant', 'faconnier'],
        image:                  ['image', 'imageurl', 'photo', 'picture', 'img'],
        packedUnits:            ['packedunits', 'unitesemballees'],
        numberOfUnits:          ['numberofunits', 'nombredunites', 'nbunits'],
        // Le template/export utilise un suffixe "(cm)" — normalize() retire les parenthèses mais
        // pas les lettres qu'elles contenaient, donc "Packing Length (cm)" → "packinglengthcm"
        // (pas "packinglength") : il faut lister la forme AVEC le "cm" collé, sinon
        // l'auto-mapping échoue silencieusement sur un fichier réexporté par l'app elle-même.
        packingLength:          ['packinglength', 'packinglengthcm', 'longueuremballage', 'longueur', 'length'],
        packingWidth:           ['packingwidth', 'packingwidthcm', 'largeuremballage', 'largeur', 'width'],
        packingHeight:          ['packingheight', 'packingheightcm', 'hauteuremballage', 'hauteur', 'height'],
      };
      // Initialiser toutes les clés à null pour que v-select soit réactif dès le départ
      const newMapping = {};
      for (const field of this.priceFields) {
        newMapping[field.key] = null;
      }
      for (const [field, aliasList] of Object.entries(aliases)) {
        const idx = headerNorm.findIndex((h) => aliasList.includes(h));
        if (idx !== -1) newMapping[field] = this.csvHeaders[idx];
      }
      this.mapping = newMapping;
    },

    downloadTemplate() {
      // Utiliser des noms de colonnes lisibles. Pas de colonne "Cost Per Recipe Unit" : c'est
      // une valeur dérivée (pricePerUnit × Purchase Unit Conversion), toujours recalculée par
      // l'app, jamais un champ d'entrée — cf. autoMap()/doImport().
      const headers = [
        'Item Name', 'Good Type', 'Category', 'Image URL',
        'Supplier Name', 'Supplier Item', 'Industrial',
        'Recipe Unit', 'Purchase Unit', 'Purchase Unit Conversion', 'Units Per Purchase',
        'Price (Package Total) (EUR)',
        'Purchased In (Packaging)', 'Stored In (Packaging)',
        'Packed Units', 'Number of Units',
        'Packing Length (cm)', 'Packing Width (cm)', 'Packing Height (cm)',
      ];
      const example = [
        'Tomato', 'Food', 'Vegetables', '',
        'FreshCo', 'Tomato 5kg', '',
        'kg', 'box', '1', '5',
        '12.50',
        'Box', 'Box',
        '5', '1',
        '', '', '',
      ];
      const csv = [headers.join(','), example.join(',')].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'market_prices_template.csv';
      a.click();
      URL.revokeObjectURL(url);
    },

    async ensureAuth() {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) setAccessToken(token);
      } catch { /* ignore */ }
    },

    buildColumnIndex() {
      const colIdx = (colName) => (colName != null ? this.csvHeaders.indexOf(colName) : -1);
      const idxOf = {};
      for (const field of this.priceFields) {
        idxOf[field.key] = colIdx(this.mapping[field.key]);
      }
      return idxOf;
    },
    getCell(row, idxOf, key) {
      const idx = idxOf[key];
      return idx >= 0 ? (row[idx] || '').trim() : '';
    },

    /**
     * Parcourt tout le fichier et classe chaque nom unique de Good Type/Category/Supplier
     * Name/Industrial en : déjà existant (rien à faire), probable faute de frappe (à confirmer
     * via l'écran de vérification), ou nom réellement nouveau (créé automatiquement sans
     * confirmation). Doit tourner sur la totalité du fichier AVANT `doImport()` pour que la
     * création des référentiels manquants se fasse une seule fois par nom, pas par ligne.
     */
    scanNames() {
      const idxOf = this.buildColumnIndex();
      const marketPriceTypes = this.$store.getters['marketPriceTypes/marketPriceTypes'] || [];
      const marketPriceCategories = this.$store.getters['marketPriceCategories/marketPriceCategories'] || [];

      const configs = {
        goodType: { existing: marketPriceTypes, reserved: ['packaging'] },
        category: { existing: marketPriceCategories },
        supplierName: { existing: this.suppliers || [] },
        industrialName: { existing: this.industrials || [] },
      };

      const ambiguous = [];
      const autoCreate = [];
      const seen = new Set();

      for (const row of this.csvRows) {
        const goodTypeRaw = this.getCell(row, idxOf, 'goodType');
        for (const type of Object.keys(configs)) {
          const raw = this.getCell(row, idxOf, type);
          if (!raw) continue;
          const key = `${type}::${raw.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const cfg = configs[type];
          const normRaw = raw.toLowerCase();
          if (cfg.reserved && cfg.reserved.includes(normRaw)) continue; // "Packaging", valeur réservée

          const exact = cfg.existing.find((e) => String(e?.name || '').trim().toLowerCase() === normRaw);
          if (exact) continue; // résolu silencieusement, rien à faire

          let best = null;
          for (const e of cfg.existing) {
            const name = String(e?.name || '').trim();
            if (!name) continue;
            const score = stringSimilarity(raw, name);
            if (!best || score > best.score) best = { score, name, id: e.id };
          }

          if (best && best.score >= TYPO_SIMILARITY_THRESHOLD) {
            ambiguous.push({ key, type, raw, matchName: best.name, matchId: best.id, choice: 'existing' });
          } else {
            // Aucune ressemblance : nom réellement nouveau, créé automatiquement sans demander.
            autoCreate.push({ key, type, raw, relatedGoodTypeRaw: type === 'category' ? goodTypeRaw : undefined });
          }
        }
      }

      return { ambiguous, autoCreate };
    },

    async startImport() {
      const { ambiguous, autoCreate } = this.scanNames();
      this.resolutionChoices = ambiguous;
      this.pendingAutoCreate = autoCreate;
      if (ambiguous.length > 0) {
        this.resolving = true;
        this.step = 3;
        return;
      }
      await this.doImport();
    },

    confirmResolution() {
      this.resolving = false;
      this.doImport();
    },

    /**
     * Crée les Good Type/Category/Supplier/Industrial manquants (aucune correspondance exacte),
     * qu'ils viennent de `pendingAutoCreate` (aucune ressemblance, créés sans confirmation) ou
     * des choix "Créer un nouveau" de l'écran de vérification. Ordre important : les catégories
     * dépendent d'un typeId, donc les Good Types sont créés/résolus en premier.
     */
    async createMissingEntities() {
      const resolved = new Map(); // key `${type}::${rawLower}` -> { id, name }
      for (const choice of this.resolutionChoices) {
        if (choice.choice === 'existing') {
          resolved.set(choice.key, { id: choice.matchId, name: choice.matchName });
        }
      }

      const toCreate = [
        ...this.pendingAutoCreate,
        ...this.resolutionChoices.filter((c) => c.choice === 'new'),
      ];
      const byType = { goodType: [], category: [], supplierName: [], industrialName: [] };
      for (const item of toCreate) byType[item.type].push(item);

      const created = { types: [], categories: [], suppliers: [], industrials: [] };

      for (const item of byType.goodType) {
        try {
          const res = await createMarketPriceType({ name: item.raw });
          const id = res?.id || res?._id;
          if (!id) throw new Error('Missing id in response');
          resolved.set(item.key, { id, name: item.raw });
          created.types.push(item.raw);
          this.$store.dispatch('marketPriceTypes/addMarketPriceType', { ...res, id, name: item.raw });
        } catch { /* la ligne sera signalée en erreur plus loin, faute de type résolu */ }
      }

      for (const item of byType.category) {
        try {
          const goodTypeKey = `goodType::${String(item.relatedGoodTypeRaw || '').toLowerCase()}`;
          const typeMatch = resolved.get(goodTypeKey)
            || this.$store.getters['marketPriceTypes/marketPriceTypes']
              .find((t) => String(t?.name || '').toLowerCase() === String(item.relatedGoodTypeRaw || '').toLowerCase());
          const res = await createMarketPriceCategory({ name: item.raw, typeId: typeMatch?.id });
          const id = res?.id || res?._id;
          if (!id) throw new Error('Missing id in response');
          resolved.set(item.key, { id, name: item.raw });
          created.categories.push(item.raw);
          this.$store.dispatch('marketPriceCategories/addMarketPriceCategory', { ...res, id, name: item.raw, typeId: typeMatch?.id });
        } catch { /* idem */ }
      }

      for (const item of byType.supplierName) {
        try {
          const res = await createSupplier({ name: item.raw });
          const supplier = res?.data || res;
          const id = supplier?.id || supplier?._id;
          if (!id) throw new Error('Missing id in response');
          resolved.set(item.key, { id, name: item.raw });
          created.suppliers.push(item.raw);
          this.$store.dispatch('suppliers/addSupplier', { ...supplier, id, name: item.raw });
        } catch { /* idem */ }
      }

      for (const item of byType.industrialName) {
        try {
          const res = await createIndustrial({ name: item.raw });
          const id = res?.id || res?._id;
          if (!id) throw new Error('Missing id in response');
          resolved.set(item.key, { id, name: item.raw });
          created.industrials.push(item.raw);
          this.$store.dispatch('industrials/addIndustrial', { ...res, id, name: item.raw });
        } catch { /* idem */ }
      }

      return { resolved, created };
    },

    async doImport() {
      this.importLoading = true;
      this.importProgress = 0;
      this.sendingToServer = false;
      this.step = 3;
      await this.ensureAuth();
      await this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes', { forceRefresh: true });
      await this.$store.dispatch('marketPriceCategories/fetchMarketPriceCategories', { forceRefresh: true });

      const results = {
        success: 0,
        skipped: 0,
        errors: [],
        sentCount: 0,
        autoCreated: { types: [], categories: [], suppliers: [], industrials: [] },
      };

      // Crée automatiquement les référentiels manquants (types/catégories/fournisseurs/
      // industriels) et applique les choix de l'écran de vérification, AVANT de résoudre
      // chaque ligne — pour que tout se lie correctement dès ce premier import.
      const { resolved, created } = await this.createMissingEntities();
      results.autoCreated = created;

      const marketPriceTypes = this.$store.getters['marketPriceTypes/marketPriceTypes'] || [];
      const marketPriceCategories = this.$store.getters['marketPriceCategories/marketPriceCategories'] || [];

      const resolveEntity = (type, raw, existingList) => {
        if (!raw) return null;
        const key = `${type}::${raw.toLowerCase()}`;
        if (resolved.has(key)) return resolved.get(key);
        const exact = existingList.find((e) => String(e?.name || '').trim().toLowerCase() === raw.trim().toLowerCase());
        return exact ? { id: exact.id, name: exact.name } : null;
      };

      const idxOf = this.buildColumnIndex();
      const validItems = [];
      // Ligne CSV d'origine (pour remonter une erreur backend à la bonne ligne) alignée
      // index-à-index avec validItems.
      const validItemRows = [];

      for (let i = 0; i < this.csvRows.length; i++) {
        const row = this.csvRows[i];
        const get = (key) => this.getCell(row, idxOf, key);

        const itemName = get('itemName');
        if (!itemName) {
          results.errors.push({ row: i + 2, message: this.t('err_missingName') });
          this.importProgress++;
          continue;
        }

        const unitVal = get('unit');
        if (!unitVal) {
          results.errors.push({ row: i + 2, message: this.t('err_missingUnit') });
          this.importProgress++;
          continue;
        }

        const priceRaw = get('price');
        const priceNum = parseFloat(priceRaw);
        if (!priceRaw || !Number.isFinite(priceNum)) {
          results.errors.push({ row: i + 2, message: this.t('err_missingPrice') });
          this.importProgress++;
          continue;
        }

        const goodTypeRaw = get('goodType');
        if (!goodTypeRaw) {
          results.errors.push({ row: i + 2, message: this.t('err_missingGoodType') });
          this.importProgress++;
          continue;
        }

        let goodType;
        let marketPriceTypeId;
        if (goodTypeRaw.trim().toLowerCase() === 'packaging') {
          goodType = 'Packaging';
        } else {
          const typeMatch = resolveEntity('goodType', goodTypeRaw, marketPriceTypes);
          if (!typeMatch) {
            results.errors.push({ row: i + 2, message: this.t('err_invalidGoodType') + ` ("${goodTypeRaw}")` });
            this.importProgress++;
            continue;
          }
          goodType = typeMatch.name;
          marketPriceTypeId = typeMatch.id;
        }

        const numOrUndef = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : undefined; };

        const categoryRaw = get('category') || undefined;
        const categoryMatch = categoryRaw ? resolveEntity('category', categoryRaw, marketPriceCategories) : null;
        const marketPriceCategoryId = categoryMatch?.id || undefined;

        const supplierNameRaw = get('supplierName') || undefined;
        const supplierMatch = supplierNameRaw ? resolveEntity('supplierName', supplierNameRaw, this.suppliers || []) : null;

        const industrialNameRaw = get('industrialName') || undefined;
        const industrialMatch = industrialNameRaw ? resolveEntity('industrialName', industrialNameRaw, this.industrials || []) : null;

        const unitsPerPurchase = numOrUndef(get('unitsPerPurchase'));
        // `pricePerUnit` n'est jamais un champ d'entrée (cf. MarketPriceCreateDrawer.vue
        // recomputePricePerUnit) : toujours dérivé de price/unitsPerPurchase, jamais lu
        // depuis une colonne CSV.
        const pricePerUnit = unitsPerPurchase && unitsPerPurchase > 0 ? priceNum / unitsPerPurchase : priceNum;

        const payload = {
          itemName,
          unit:                   unitVal,
          price:                  priceNum,
          goodType,
          marketPriceTypeId,
          recipeUnit:             get('recipeUnit') || undefined,
          purchaseUnitConversion: numOrUndef(get('purchaseUnitConversion')),
          category:               categoryRaw,
          marketPriceCategoryId,
          supplier:               supplierNameRaw,
          supplierId:             supplierMatch?.id || undefined,
          supplierItem:           get('supplierItemName') || undefined,
          industrialId:           industrialMatch?.id || undefined,
          unitsPerPurchase,
          pricePerUnit,
          purchasePackaging:      get('purchasePackaging') || undefined,
          inventoryPackaging:     get('inventoryPackaging') || undefined,
          image:                  get('image') || undefined,
          packedUnits:            numOrUndef(get('packedUnits')),
          numberOfUnits:          numOrUndef(get('numberOfUnits')),
          packingLength:          numOrUndef(get('packingLength')),
          packingWidth:           numOrUndef(get('packingWidth')),
          packingHeight:          numOrUndef(get('packingHeight')),
        };

        Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
        validItems.push(payload);
        validItemRows.push(i + 2);
        this.importProgress++;
      }

      // Bulk import via /market-prices/import — le backend traite chaque ligne indépendamment
      // (créée / doublon ignoré / erreur) et remonte un décompte précis, cf. bulkCreate().
      results.sentCount = validItems.length;
      if (validItems.length > 0) {
        this.sendingToServer = true;
        try {
          const response = await importMarketPrices(validItems);
          const createdCount = Array.isArray(response?.created) ? response.created.length : 0;
          const skipped = Number(response?.skipped) || 0;
          const backendErrors = Array.isArray(response?.errors) ? response.errors : [];
          results.success += createdCount;
          results.skipped += skipped;
          for (const err of backendErrors) {
            const row = validItemRows[err.index] ?? '?';
            results.errors.push({ row, message: err.message });
          }
          // Des lignes ont été envoyées mais le décompte créé/ignoré/erreur retombe à zéro : la
          // réponse serveur n'a pas la forme attendue (backend pas à jour, proxy qui réécrit la
          // réponse, etc). Ne JAMAIS afficher "fichier vide" dans ce cas — on a bien envoyé des
          // données, on ne sait juste pas ce qui s'est passé côté serveur.
          if (createdCount === 0 && skipped === 0 && backendErrors.length === 0) {
            results.errors.push({ row: '?', message: this.t('unexpectedEmptyResponse') });
          }
        } catch (e) {
          const errMsg = e?.response?.data?.message || e?.message || 'Import failed';
          // Échec réseau/serveur global (pas une erreur ligne par ligne) : impossible de savoir
          // ce qui a réellement été committé côté serveur avant la coupure.
          results.errors.push({ row: '?', message: errMsg });
        } finally {
          this.sendingToServer = false;
        }
      }

      this.importResults = results;
      this.importLoading = false;
      if (results.success > 0) this.$emit('imported');
    },
  },
};
</script>

<style scoped>
.mpcid-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
}

.mpcid-panel {
  width: 520px;
  height: 100%;
  background: #ffffff;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mpcid-enter-active,
.mpcid-leave-active {
  transition: opacity 0.25s ease;
}
.mpcid-enter-active .mpcid-panel,
.mpcid-leave-active .mpcid-panel {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.mpcid-enter-from,
.mpcid-leave-to {
  opacity: 0;
}
.mpcid-enter-from .mpcid-panel,
.mpcid-leave-to .mpcid-panel {
  transform: translateX(100%);
}

/* === Gradient Header === */
.mpcid__grad-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  background: #ff3131;
  flex-shrink: 0;
}
.mpcid__header-icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.mpcid__header-titles { flex: 1; min-width: 0; }
.mpcid__header-title { font-size: 15px; font-weight: 700; color: #fff; line-height: 1.2; }
.mpcid__header-subtitle { font-size: 12px; color: rgba(255,255,255,.72); margin-top: 3px; }
.mpcid__close-btn {
  width: 32px; height: 32px; border: none; border-radius: 8px;
  background: rgba(255,255,255,.18); color: rgba(255,255,255,.85);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .18s; flex-shrink: 0; margin-left: auto;
}
.mpcid__close-btn:hover { background: rgba(255,255,255,.3); }

.mpcid-step-bar {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
}

.mpcid-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.mpcid__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
  flex-shrink: 0;
}
.mpcid-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 22px; border-radius: 100px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all .2s; border: none; line-height: 1.4;
}
.mpcid-btn:disabled { opacity: .45; cursor: not-allowed; }
.mpcid-btn--back {
  background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280;
}
.mpcid-btn--back:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; color: #374151; }
.mpcid-btn--primary {
  background: #ff3131;
  color: #fff; box-shadow: 0 4px 14px rgba(255, 49, 49,.3);
}
.mpcid-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }

.mpcid-step-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
  color: #6b7280;
}

.mpcid-step-dot--active {
  background: #ff3131;
  color: white;
}

.mpcid-step-dot--done {
  background: #16a34a;
  color: white;
}

.mpcid-step-line {
  background: #e5e7eb;
}

.mpcid-resolve-row {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
}
.mpcid--dark .mpcid-resolve-row {
  border-color: #2d3f55;
}

.mpcid-dropzone {
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.mpcid-dropzone:hover,
.mpcid-dropzone--hover {
  border-color: #ff3131;
  background: rgba(255, 49, 49, 0.04);
}

/* ── Dark mode ── */
.mpcid--dark.mpcid-panel {
  background: #1f2937;
}

.mpcid--dark .mpcid__footer {
  background: #1f2937;
  border-color: #2d3f55;
}

.mpcid--dark .mpcid-step-bar {
  border-color: #2d3f55;
}

.mpcid--dark .mpcid-step-line {
  background: #2d3f55;
}

.mpcid--dark .mpcid-step-dot {
  background: #2d3f55;
  color: #9ca3af;
}

.mpcid--dark .mpcid-step-dot--active {
  background: #ff3131;
  color: white;
}

.mpcid--dark .mpcid-step-dot--done {
  background: #16a34a;
  color: white;
}

.mpcid--dark .mpcid-dropzone {
  border-color: #2d3f55;
}

.mpcid--dark .mpcid-dropzone:hover,
.mpcid--dark .mpcid-dropzone--hover {
  border-color: #ff3131;
  background: rgba(255, 49, 49, 0.08);
}

.mpcid--dark :deep(.v-navigation-drawer__content) {
  background-color: #1f2937;
}

.mpcid--dark :deep(.v-field) {
  background-color: #263548 !important;
}

.mpcid--dark :deep(.v-field__input),
.mpcid--dark :deep(input) {
  color: #e5e7eb !important;
}

.mpcid--dark :deep(.v-select__selection-text) {
  color: #e5e7eb !important;
}

.mpcid--dark :deep(.v-field__outline) {
  --v-field-border-color: #2d3f55;
}

.mpcid--dark :deep(.v-list-item-title) {
  color: #e5e7eb;
}
</style>
