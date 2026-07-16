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

      <!-- ── Step 3 : Résultats ── -->
      <div v-if="step === 3">
        <div v-if="importLoading" class="d-flex flex-column align-center justify-center py-12">
          <v-progress-circular indeterminate color="#ff3131" size="48" class="mb-4" />
          <div class="text-body-2 text-medium-emphasis">
            {{ t('importing') }} {{ importProgress }}/{{ csvRows.length }}
          </div>
        </div>
        <template v-else-if="importResults">
          <v-alert v-if="importResults.success > 0" type="success" variant="tonal" rounded="lg" class="mb-4">
            <strong>{{ importResults.success }}</strong> {{ t('importedOk') }}
          </v-alert>
          <v-alert v-if="importResults.errors.length > 0" type="error" variant="tonal" rounded="lg" class="mb-4">
            <div class="font-weight-medium mb-2">{{ importResults.errors.length }} {{ t('errors') }}</div>
            <ul style="padding-left: 16px; margin: 0;">
              <li v-for="err in importResults.errors" :key="err.row" class="text-body-2">
                {{ t('row') }} {{ err.row }} : {{ err.message }}
              </li>
            </ul>
          </v-alert>
          <v-alert v-if="importResults.success === 0 && importResults.errors.length === 0" type="info" variant="tonal" rounded="lg">
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
          @click="doImport"
        >
          <span v-if="importLoading" class="spinner-border spinner-border-sm me-2" role="status"></span>
          <Upload v-else :size="15" class="me-1" />
          {{ t('importBtn') }} {{ csvRows.length }} {{ t('rowsLabel') }}
        </button>
      </template>
      <template v-if="step === 3 && !importLoading">
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
import { api, setAccessToken } from '@/api/client';
import { supabase } from '@/lib/supabase';

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
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const sep = detectSeparator(lines[0]);
  const result = [];
  for (const line of lines) {
    const row = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === sep && !inQuote) {
        row.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    row.push(cur.trim());
    result.push(row);
  }
  return result;
}

export default {
  name: 'MarketPriceCsvImportDrawer',
  components: { X, Upload, Download, FileSpreadsheet, CheckCircle2 },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
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
      importResults: null,

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
        { key: 'pricePerUnit',           required: false },
        { key: 'purchasePackaging',      required: false },
      ],

      translations: {
        en: {
          drawerTitle: 'Import Market Prices',
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
          mapColumns: 'Map CSV columns to market price fields',
          required: 'required',
          back: 'Back',
          importBtn: 'Import',
          rowsLabel: 'row(s)',
          importing: 'Importing',
          importedOk: 'price(s) imported successfully.',
          errors: 'error(s)',
          row: 'Row',
          noRows: 'Nothing to import (empty file?)',
          importAnother: 'Import another file',
          close: 'Close',
          f_itemName: 'Item Name',
          f_unit: 'Purchase Unit (kg, l, pcs…)',
          f_price: 'Price',
          f_goodType: 'Good Type (Food/Beverage/Packaging/Other)',
          f_recipeUnit: 'Recipe Unit',
          f_purchaseUnitConversion: 'Purchase Unit Conversion',
          f_category: 'Category',
          f_supplierName: 'Supplier Name',
          f_supplierItemName: 'Supplier Item Name',
          f_unitsPerPurchase: 'Units per Purchase',
          f_pricePerUnit: 'Price per Unit',
          err_missingName: 'Missing item name',
          err_missingUnit: 'Missing unit (required)',
          err_missingPrice: 'Missing or invalid price (required)',
          err_missingGoodType: 'Missing good type (required: Food, Beverage, Packaging or Other)',
          err_invalidGoodType: 'Invalid good type — must be Food, Beverage, Packaging or Other',
          missingRequiredMapping: 'Map all required fields (unit, price, good type) before importing.',
        },
        fr: {
          drawerTitle: 'Importer des prix du marché',
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
          mapColumns: 'Associez les colonnes CSV aux champs',
          required: 'requis',
          back: 'Retour',
          importBtn: 'Importer',
          rowsLabel: 'ligne(s)',
          importing: 'Importation',
          importedOk: 'prix importé(s) avec succès.',
          errors: 'erreur(s)',
          row: 'Ligne',
          noRows: 'Rien à importer (fichier vide ?)',
          importAnother: 'Importer un autre fichier',
          close: 'Fermer',
          f_itemName: "Nom de l'article",
          f_unit: "Unité d'achat (kg, l, pcs…)",
          f_price: 'Prix',
          f_goodType: 'Type de produit (Food/Beverage/Packaging/Other)',
          f_recipeUnit: 'Unité de recette',
          f_purchaseUnitConversion: "Conversion d'unité d'achat",
          f_category: 'Catégorie',
          f_supplierName: 'Nom du fournisseur',
          f_supplierItemName: 'Article fournisseur',
          f_unitsPerPurchase: 'Unités par achat',
          f_pricePerUnit: 'Prix par unité',
          err_missingName: "Nom de l'article manquant",
          err_missingUnit: "Unité manquante (obligatoire)",
          err_missingPrice: 'Prix manquant ou invalide (obligatoire)',
          err_missingGoodType: 'Type de produit manquant (obligatoire : Food, Beverage, Packaging ou Other)',
          err_invalidGoodType: 'Type de produit invalide — doit être Food, Beverage, Packaging ou Other',
          missingRequiredMapping: 'Associez tous les champs obligatoires (unité, prix, type de produit) avant d\'importer.',
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
      this.importResults = null;
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
        // "Price Per Unit (EUR)" → normalize → "priceperuniteur"
        price:                  ['price', 'prix', 'priceperunit', 'priceperuniteur',
                                 'prixparunite', 'prixparuniteeur', 'prixparunité',
                                 'cost', 'cout', 'coût', 'tarif', 'montant', 'amount',
                                 'unitprice', 'prixunit', 'prixunitaire', 'coutachat',
                                 'costprice', 'purchaseprice', 'prixachat'],
        // "Cost Per Recipe Unit (EUR)" → normalize → "costperrecipeuniteur"
        pricePerUnit:           ['priceperrecipeunit', 'priceperrecipeuniteur',
                                 'costperrecipeunit', 'costperrecipeuniteur',
                                 'coutparunitérecette', 'coutparunitedrecette',
                                 'prixparunitederecette'],
        purchasePackaging:      ['purchasepackaging', 'packaging', 'emballage', 'purchasedin', 'acheten'],
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
      // Utiliser des noms de colonnes lisibles, identiques au format d'export
      const headers = [
        'Item Name', 'Good Type', 'Category', 'Supplier Name', 'Supplier Item',
        'Recipe Unit', 'Purchase Unit', 'Purchase Unit Conversion',
        'Price Per Unit (EUR)', 'Cost Per Recipe Unit (EUR)',
      ];
      const example = ['Tomato', 'Food', 'Vegetables', 'FreshCo', 'Tomato 5kg', 'kg', 'box', '1', '12.50', '2.50'];
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

    async doImport() {
      this.importLoading = true;
      this.importProgress = 0;
      this.step = 3;
      await this.ensureAuth();
      await this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes', { forceRefresh: true });
      await this.$store.dispatch('marketPriceCategories/fetchMarketPriceCategories', { forceRefresh: true });
      const marketPriceTypes = this.$store.getters['marketPriceTypes/marketPriceTypes'] || [];
      const marketPriceCategories = this.$store.getters['marketPriceCategories/marketPriceCategories'] || [];

      const results = { success: 0, errors: [] };

      const VALID_GOOD_TYPES = ['Food', 'Beverage', 'Packaging', 'Other'];
      const GOOD_TYPE_NORM = {
        food: 'Food', nourriture: 'Food', aliment: 'Food',
        beverage: 'Beverage', boisson: 'Beverage', drink: 'Beverage',
        packaging: 'Packaging', emballage: 'Packaging',
        other: 'Other', autre: 'Other',
      };

      const colIdx = (colName) => (colName != null ? this.csvHeaders.indexOf(colName) : -1);
      const idxOf = {};
      for (const field of this.priceFields) {
        idxOf[field.key] = colIdx(this.mapping[field.key]);
      }

      const validItems = [];

      for (let i = 0; i < this.csvRows.length; i++) {
        const row = this.csvRows[i];
        const get = (key) => { const idx = idxOf[key]; return idx >= 0 ? (row[idx] || '').trim() : ''; };

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
        const goodType = GOOD_TYPE_NORM[goodTypeRaw.toLowerCase()] ||
          (VALID_GOOD_TYPES.includes(goodTypeRaw) ? goodTypeRaw : null);
        if (!goodType) {
          results.errors.push({ row: i + 2, message: this.t('err_invalidGoodType') + ` ("${goodTypeRaw}")` });
          this.importProgress++;
          continue;
        }

        const numOrUndef = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : undefined; };

        const categoryRaw = get('category') || undefined;
        const marketPriceTypeId = marketPriceTypes
          .find((t) => (t?.name || '').toLowerCase() === goodType.toLowerCase())?.id || undefined;
        const marketPriceCategoryId = categoryRaw
          ? marketPriceCategories.find((c) => (c?.name || '').toLowerCase() === categoryRaw.toLowerCase()
              && (!marketPriceTypeId || c.typeId === marketPriceTypeId))?.id || undefined
          : undefined;

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
          supplier:               get('supplierName') || undefined,
          supplierItem:           get('supplierItemName') || undefined,
          unitsPerPurchase:       numOrUndef(get('unitsPerPurchase')),
          pricePerUnit:           numOrUndef(get('pricePerUnit')),
          purchasePackaging:      get('purchasePackaging') || undefined,
        };

        Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
        validItems.push(payload);
        this.importProgress++;
      }

      // Bulk import via /market-prices/import
      if (validItems.length > 0) {
        try {
          await api.post('/market-prices/import', { items: validItems });
          results.success = validItems.length;
        } catch (e) {
          const errMsg = e?.response?.data?.message || e?.message || 'Import failed';
          // Mark all as errors since we can't know which ones failed
          for (let i = 0; i < validItems.length; i++) {
            results.errors.push({ row: '?', message: errMsg });
          }
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
