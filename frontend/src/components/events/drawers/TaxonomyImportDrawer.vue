<template>
  <EventDrawerShell
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :persistent="importLoading"
    :is-dark="isDark"
    width="600"
    :title="`Importer — ${entityLabel}`"
    :subtitle="stepLabel"
    flush
  >
    <template #icon>
      <FileSpreadsheet :size="20" color="white" />
    </template>

    <!-- BUG-148 : wrapper etax--dark conservé ici (et non sur la racine) : le CSS scoped de ce
         composant ne matche que les éléments de son propre template, pas l'intérieur de
         EventDrawerShell. -->
    <div :class="{ 'etax--dark': isDark }">
    <!-- Step indicator -->
    <div class="px-6 py-3 elv-t-stepbar">
      <div class="d-flex align-center" style="gap:4px;">
        <template v-for="(s, i) in visibleSteps" :key="i">
          <div class="d-flex align-center" style="gap:4px;flex-shrink:0;">
            <div class="elv-t-dot"
              :class="{'elv-t-dot--active': step === i+1, 'elv-t-dot--done': step > i+1}">
              <CheckCircle2 v-if="step > i+1" :size="12" />
              <span v-else style="font-size:10px;font-weight:700;">{{ i+1 }}</span>
            </div>
            <span class="text-caption" :class="step >= i+1 ? 'font-weight-medium' : 'text-disabled'"
              style="white-space:nowrap;font-size:11px;">{{ s }}</span>
          </div>
          <div v-if="i < visibleSteps.length-1" style="flex:1;height:1px;min-width:8px;background:rgba(var(--v-border-color),var(--v-border-opacity,1));" />
        </template>
      </div>
    </div>

    <!-- Body -->
    <div class="elv-t-body pa-6">

      <!-- Step 1: Upload -->
      <div v-if="step === 1">
        <v-alert v-if="fileError" type="error" variant="tonal" rounded="lg" class="mb-4">{{ fileError }}</v-alert>
        <input ref="fileInput" type="file" accept=".csv,text/csv" style="display:none;" @change="onFileChange" />
        <div class="elv-t-dropzone d-flex flex-column align-center justify-center pa-10"
          :class="{'elv-t-dropzone--hover': dropping}"
          @click="$refs.fileInput.click()"
          @dragover.prevent="dropping=true"
          @dragleave.prevent="dropping=false"
          @drop.prevent="onDrop">
          <FileSpreadsheet :size="48" class="mb-4" style="color:#9ca3af;" />
          <div class="text-h6 font-weight-medium mb-1">Glissez un fichier CSV ici</div>
          <div class="text-body-2 text-medium-emphasis mb-5">ou cliquez pour parcourir</div>
          <v-btn variant="outlined" rounded="lg" size="small" class="text-none" @click.stop="$refs.fileInput.click()">
            <Upload :size="16" class="mr-2" />Choisir un fichier
          </v-btn>
        </div>
        <v-card variant="tonal" rounded="lg" class="mt-4 pa-4" elevation="0">
          <div class="text-body-2 font-weight-medium mb-1">Format attendu</div>
          <div class="text-caption text-medium-emphasis">Première ligne = en-têtes · Séparateur virgule · Encodage UTF-8</div>
          <div class="text-caption text-medium-emphasis mt-2">
            <span v-if="entity==='type'">Colonne requise : <strong>name</strong></span>
            <span v-else-if="entity==='category'">Colonnes : <strong>name</strong> (requis), <strong>eventType</strong>, <strong>hasHomeTeam</strong></span>
            <span v-else>Colonnes : <strong>name</strong> (requis), <strong>eventCategory</strong></span>
          </div>
        </v-card>
      </div>

      <!-- Step 2: Mapping colonnes -->
      <div v-if="step === 2">
        <div class="d-flex align-center mb-4" style="gap:8px;">
          <FileSpreadsheet :size="16" style="color:#6b7280;flex-shrink:0;" />
          <span class="text-body-2 font-weight-medium">{{ fileName }}</span>
          <v-chip size="x-small" variant="tonal" color="primary">{{ csvRows.length }} ligne{{ csvRows.length>1?'s':'' }}</v-chip>
        </div>
        <div class="text-body-2 font-weight-medium mb-3">Associez les colonnes CSV aux champs</div>
        <div v-for="field in entityFields" :key="field.key" class="d-flex align-center mb-2" style="gap:12px;">
          <div style="min-width:180px;flex-shrink:0;">
            <span class="text-body-2">{{ field.label }}</span>
            <v-chip v-if="field.required" size="x-small" color="error" variant="flat" class="ml-1">requis</v-chip>
          </div>
          <v-select v-model="mapping[field.key]" :items="columnOptions"
            item-title="title" item-value="value"
            variant="outlined" density="compact" rounded="lg" hide-details style="flex:1;" />
        </div>
      </div>

      <!-- Step 3: Map Event Types (category import) -->
      <div v-if="step === 3 && entity === 'category'">
        <div class="d-flex align-center mb-1" style="gap:8px;">
          <Tags :size="16" style="color:#6b7280;" />
          <span class="text-body-2 font-weight-medium">Colonne CSV : <strong>{{ mapping.eventTypeRaw }}</strong></span>
        </div>
        <div class="text-caption text-medium-emphasis mb-4">
          Associez chaque valeur à un type d'événement existant.
        </div>
        <div v-for="val in uniqueTypeValues" :key="val" class="d-flex align-center mb-3" style="gap:12px;">
          <div class="pa-2 rounded elv-t-chip" style="min-width:150px;flex-shrink:0;">
            <span class="text-body-2 font-weight-medium" style="word-break:break-all;">{{ val }}</span>
          </div>
          <ArrowRight :size="14" style="color:#9ca3af;flex-shrink:0;" />
          <v-select v-model="typeValueMap[val]" :items="eventTypes"
            item-title="name" item-value="id" placeholder="Ignorer"
            variant="outlined" density="compact" rounded="lg" hide-details clearable style="flex:1;" />
        </div>
        <v-alert v-if="!uniqueTypeValues.length" type="info" variant="tonal" density="compact" rounded="lg">Aucune valeur trouvée.</v-alert>
        <v-alert v-else-if="!valuesFullyMapped" type="warning" variant="tonal" density="compact" rounded="lg">
          Associez chaque valeur à un type existant pour pouvoir importer — un type d'événement est obligatoire pour créer une catégorie.
        </v-alert>
      </div>

      <!-- Step 3: Map Event Categories (subcategory import) -->
      <div v-if="step === 3 && entity === 'subcategory'">
        <div class="d-flex align-center mb-1" style="gap:8px;">
          <Tags :size="16" style="color:#6b7280;" />
          <span class="text-body-2 font-weight-medium">Colonne CSV : <strong>{{ mapping.eventCategoryRaw }}</strong></span>
        </div>
        <div class="text-caption text-medium-emphasis mb-4">
          Associez chaque valeur à une catégorie existante.
        </div>
        <div v-for="val in uniqueCategoryValues" :key="val" class="d-flex align-center mb-3" style="gap:12px;">
          <div class="pa-2 rounded elv-t-chip" style="min-width:150px;flex-shrink:0;">
            <span class="text-body-2 font-weight-medium" style="word-break:break-all;">{{ val }}</span>
          </div>
          <ArrowRight :size="14" style="color:#9ca3af;flex-shrink:0;" />
          <v-select v-model="categoryValueMap[val]" :items="eventCategories"
            item-title="name" item-value="id" placeholder="Ignorer"
            variant="outlined" density="compact" rounded="lg" hide-details clearable style="flex:1;" />
        </div>
        <v-alert v-if="!uniqueCategoryValues.length" type="info" variant="tonal" density="compact" rounded="lg">Aucune valeur trouvée.</v-alert>
        <v-alert v-else-if="!valuesFullyMapped" type="warning" variant="tonal" density="compact" rounded="lg">
          Associez chaque valeur à une catégorie existante pour pouvoir importer — une catégorie est obligatoire pour créer une sous-catégorie.
        </v-alert>
      </div>

      <!-- Last step: Résultats -->
      <div v-if="isResultStep">
        <div v-if="importLoading" class="d-flex flex-column align-center justify-center py-12">
          <v-progress-circular indeterminate color="#ff3131" size="48" class="mb-4" />
          <div class="text-body-2 text-medium-emphasis">Importation en cours...</div>
        </div>
        <template v-else-if="importResults">
          <v-alert v-if="importResults.success > 0" type="success" variant="tonal" rounded="lg" class="mb-4">
            <strong>{{ importResults.success }}</strong>
            {{ entityLabel.toLowerCase() }}{{ importResults.success > 1 ? (entity==='type'?'s':(entity==='category'?'s':'s')) : '' }}
            importé{{ importResults.success > 1 ? 's' : '' }} avec succès.
          </v-alert>
          <v-alert v-if="importResults.errors.length > 0" type="error" variant="tonal" rounded="lg" class="mb-4">
            <div class="font-weight-medium mb-2">{{ importResults.errors.length }} erreur{{ importResults.errors.length>1?'s':'' }}</div>
            <ul style="padding-left:16px;margin:0;">
              <li v-for="err in importResults.errors" :key="err.row" class="text-body-2">Ligne {{ err.row }} : {{ err.message }}</li>
            </ul>
          </v-alert>
          <v-alert v-if="importResults.success===0 && importResults.errors.length===0" type="info" variant="tonal" rounded="lg">
            Aucune ligne à importer.
          </v-alert>
        </template>
      </div>

    </div>
    </div>

    <template #footer>
      <div class="d-flex" style="gap:12px; flex: 1;">
        <template v-if="step >= 2 && !isResultStep">
          <v-btn variant="outlined" rounded="lg" size="small" class="text-none" style="flex:1;" @click="navigateBack">
            Retour
          </v-btn>
          <v-btn v-if="!isLastValueStep"
            color="#ff3131" variant="flat" rounded="lg" size="small" class="text-white text-none" style="flex:1;"
            :disabled="step===2 && !canProceed"
            @click="navigateForward">
            Suivant
          </v-btn>
          <v-btn v-else
            color="#ff3131" variant="flat" rounded="lg" size="small" class="text-white text-none" style="flex:1;"
            :disabled="(step===2 && !canProceed) || !valuesFullyMapped"
            :loading="importLoading"
            @click="doImport">
            <Upload :size="16" class="mr-2" />
            Importer {{ csvRows.length }} ligne{{ csvRows.length>1?'s':'' }}
          </v-btn>
        </template>
        <template v-if="isResultStep && !importLoading">
          <v-btn variant="outlined" rounded="lg" size="small" class="text-none" style="flex:1;" @click="reset">
            Importer un autre fichier
          </v-btn>
          <v-btn color="#ff3131" variant="flat" rounded="lg" size="small" class="text-white text-none" style="flex:1;"
            @click="$emit('update:modelValue', false)">
            Fermer
          </v-btn>
        </template>
      </div>
    </template>
  </EventDrawerShell>
</template>

<script>
import { Upload, FileSpreadsheet, CheckCircle2, ArrowRight, Tags } from 'lucide-vue-next';
import EventDrawerShell from './EventDrawerShell.vue';
import {
  createEventType,
  createEventCategory,
  createEventSubcategory,
} from '@/api/endpoints/event.api';
import { parseCSV } from '@/utils/csv';

export default {
  name: 'TaxonomyImportDrawer',
  components: { Upload, FileSpreadsheet, CheckCircle2, ArrowRight, Tags, EventDrawerShell },
  props: {
    modelValue: { type: Boolean, default: false },
    entity: { type: String, default: 'type' }, // 'type' | 'category' | 'subcategory'
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'imported'],

  data() {
    return {
      step: 1,
      dropping: false,
      fileName: '',
      csvHeaders: [],
      csvRows: [],
      mapping: {},
      typeValueMap: {},
      categoryValueMap: {},
      importLoading: false,
      importResults: null,
      fileError: '',
    };
  },

  computed: {
    entityLabel() {
      if (this.entity === 'type') return 'Types d\'événement';
      if (this.entity === 'category') return 'Catégories';
      return 'Sous-catégories';
    },

    entityFields() {
      if (this.entity === 'type') {
        return [{ key: 'name', label: 'Nom', required: true }];
      }
      if (this.entity === 'category') {
        return [
          { key: 'name', label: 'Nom', required: true },
          { key: 'eventTypeRaw', label: 'Type d\'événement (nom)', required: true },
          { key: 'hasHomeTeam', label: 'Has Home Team (true/false)' },
        ];
      }
      // subcategory
      return [
        { key: 'name', label: 'Nom', required: true },
        { key: 'eventCategoryRaw', label: 'Catégorie (nom)', required: true },
      ];
    },

    // Steps: always [Fichier, Colonnes, ...mapping..., Résultats]
    // - type:        [1, 2, 3R]
    // - category:    [1, 2, 3M-type, 4R] (skip 3 if eventTypeRaw not mapped)
    // - subcategory: [1, 2, 3M-cat, 4R]  (skip 3 if eventCategoryRaw not mapped)
    reachableSteps() {
      if (this.entity === 'type') {
        return [2, 3]; // 2=colonnes, 3=résultats
      }
      if (this.entity === 'category') {
        const s = [2];
        if (this.mapping.eventTypeRaw) s.push(3);
        s.push(4);
        return s;
      }
      // subcategory
      const s = [2];
      if (this.mapping.eventCategoryRaw) s.push(3);
      s.push(4);
      return s;
    },

    lastValueStep() {
      const rs = this.reachableSteps;
      // last step before result is the one before the last
      return rs[rs.length - 2] ?? 2;
    },

    resultStep() {
      return this.reachableSteps[this.reachableSteps.length - 1];
    },

    isResultStep() {
      return this.step === this.resultStep;
    },

    isLastValueStep() {
      return this.step === this.lastValueStep;
    },

    visibleSteps() {
      if (this.entity === 'type') return ['Fichier', 'Colonnes', 'Résultats'];
      if (this.entity === 'category') {
        const s = ['Fichier', 'Colonnes'];
        if (this.mapping.eventTypeRaw) s.push('Types');
        s.push('Résultats');
        return s;
      }
      const s = ['Fichier', 'Colonnes'];
      if (this.mapping.eventCategoryRaw) s.push('Catégories');
      s.push('Résultats');
      return s;
    },

    stepLabel() {
      if (this.step === 1) return 'Choisissez un fichier CSV';
      if (this.step === 2) return 'Associez les colonnes aux champs';
      if (this.isResultStep) return 'Résultats de l\'importation';
      if (this.entity === 'category') return 'Associez les types d\'événement';
      return 'Associez les catégories';
    },

    columnOptions() {
      return [
        { title: '— Ignorer —', value: null },
        ...this.csvHeaders.map((h) => ({ title: h, value: h })),
      ];
    },

    // BUG-151 : la FK parente (type pour une catégorie, catégorie pour une sous-catégorie) est
    // obligatoire côté backend (DTO) — on la rend obligatoire ici aussi plutôt que de laisser
    // chaque ligne échouer en 400 brut après coup.
    canProceed() {
      if (!this.mapping.name || this.csvRows.length === 0) return false;
      if (this.entity === 'category' && !this.mapping.eventTypeRaw) return false;
      if (this.entity === 'subcategory' && !this.mapping.eventCategoryRaw) return false;
      return true;
    },

    // BUG-151 : une colonne mappée ne suffit pas — chaque valeur unique doit être résolue vers un
    // type/catégorie existant (pas laissée sur "Ignorer") avant de pouvoir importer.
    valuesFullyMapped() {
      if (this.entity === 'category' && this.mapping.eventTypeRaw) {
        return this.uniqueTypeValues.every((v) => !!this.typeValueMap[v]);
      }
      if (this.entity === 'subcategory' && this.mapping.eventCategoryRaw) {
        return this.uniqueCategoryValues.every((v) => !!this.categoryValueMap[v]);
      }
      return true;
    },

    eventTypes() {
      return (this.$store.getters['eventTypes/eventTypes'] || [])
        .map((t) => ({ ...t, id: t?.id || t?._id }))
        .filter((t) => !!t.id);
    },

    eventCategories() {
      return (this.$store.getters['eventCategories/eventCategories'] || [])
        .map((c) => ({ ...c, id: c?.id || c?._id }))
        .filter((c) => !!c.id);
    },

    uniqueTypeValues() {
      return this._uniqueColValues('eventTypeRaw');
    },

    uniqueCategoryValues() {
      return this._uniqueColValues('eventCategoryRaw');
    },
  },

  watch: {
    modelValue(v) {
      if (v) {
        Promise.allSettled([
          this.$store.dispatch('eventTypes/fetchEventTypes'),
          this.$store.dispatch('eventCategories/fetchEventCategories'),
        ]);
      } else {
        this.reset();
      }
    },
  },

  methods: {
    _uniqueColValues(fieldKey) {
      const col = this.mapping[fieldKey];
      if (!col) return [];
      const idx = this.csvHeaders.indexOf(col);
      if (idx < 0) return [];
      return [...new Set(this.csvRows.map((r) => r[idx]?.trim()).filter(Boolean))];
    },

    navigateForward() {
      const idx = this.reachableSteps.indexOf(this.step);
      if (idx < 0 || idx >= this.reachableSteps.length - 2) return; // -2 because last is result
      this.step = this.reachableSteps[idx + 1];
    },

    navigateBack() {
      const idx = this.reachableSteps.indexOf(this.step);
      if (idx > 0) {
        this.step = this.reachableSteps[idx - 1];
      } else {
        this.step = 1;
      }
    },

    reset() {
      this.step = 1;
      this.fileName = '';
      this.csvHeaders = [];
      this.csvRows = [];
      this.mapping = {};
      this.typeValueMap = {};
      this.categoryValueMap = {};
      this.importLoading = false;
      this.importResults = null;
      this.fileError = '';
      this.dropping = false;
    },

    onDrop(e) {
      this.dropping = false;
      const file = e.dataTransfer?.files?.[0];
      if (file) this.readFile(file);
    },

    onFileChange(e) {
      const file = e.target.files?.[0];
      if (file) this.readFile(file);
      e.target.value = '';
    },

    readFile(file) {
      this.fileName = file.name;
      this.fileError = '';
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result;
        const parsed = parseCSV(text);
        if (parsed.length < 2) {
          this.fileError = 'Ce fichier est vide ou ne contient que l\'en-tête — aucune ligne à importer.';
          return;
        }
        this.csvHeaders = parsed[0];
        this.csvRows = parsed.slice(1).filter((r) => r.some((c) => c.trim()));
        this.mapping = {};
        for (const field of this.entityFields) {
          const match = this.csvHeaders.find(
            (h) => h.toLowerCase().replace(/[\s_-]/g, '') === field.key.toLowerCase()
              || h.toLowerCase() === field.key.toLowerCase(),
          );
          this.mapping[field.key] = match || null;
        }
        this.typeValueMap = {};
        this.categoryValueMap = {};
        this.step = 2;
      };
      reader.readAsText(file, 'UTF-8');
    },

    getCellValue(row, fieldKey) {
      const col = this.mapping[fieldKey];
      if (!col) return '';
      const idx = this.csvHeaders.indexOf(col);
      return idx >= 0 ? (row[idx]?.trim() || '') : '';
    },

    parseBool(v) {
      return ['true', '1', 'oui', 'yes'].includes(String(v || '').toLowerCase().trim());
    },

    async doImport() {
      this.step = this.resultStep;
      this.importLoading = true;
      this.importResults = null;
      let successCount = 0;
      const errors = [];

      for (let i = 0; i < this.csvRows.length; i++) {
        const row = this.csvRows[i];
        const get = (key) => this.getCellValue(row, key);
        const name = get('name');

        if (!name) {
          errors.push({ row: i + 2, message: 'Nom manquant' });
          continue;
        }

        try {
          let created;
          if (this.entity === 'type') {
            const res = await createEventType({ name });
            created = res?.data ?? res;
            const id = created?.id || created?._id;
            if (id) {
              await this.$store.dispatch('eventTypes/addEventType', created);
            }
          } else if (this.entity === 'category') {
            const typeRaw = get('eventTypeRaw');
            const eventTypeId = (typeRaw && this.typeValueMap[typeRaw]) || undefined;
            const hasHomeTeam = get('hasHomeTeam') ? this.parseBool(get('hasHomeTeam')) : false;
            const res = await createEventCategory({ name, eventTypeId, hasHomeTeam });
            created = res?.data ?? res;
            const id = created?.id || created?._id;
            if (id) {
              await this.$store.dispatch('eventCategories/addEventCategory', created);
            }
          } else {
            const catRaw = get('eventCategoryRaw');
            const categoryId = (catRaw && this.categoryValueMap[catRaw]) || undefined;
            const res = await createEventSubcategory({ name, categoryId });
            created = res?.data ?? res;
            const id = created?.id || created?._id;
            if (id) {
              await this.$store.dispatch('eventSubcategories/addEventSubcategory', created);
            }
          }
          successCount++;
        } catch (e) {
          errors.push({
            row: i + 2,
            message: e?.response?.data?.message || e?.message || 'Erreur inconnue',
          });
        }
      }

      this.importResults = { success: successCount, errors };
      this.importLoading = false;
      if (successCount > 0) this.$emit('imported');
    },
  },
};
</script>

<style scoped>
.elv-t-stepbar {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity, 1));
  background: rgb(var(--v-theme-surface));
  flex-shrink: 0;
}
.elv-t-body { flex: 1; overflow-y: auto; background: rgb(var(--v-theme-background)); }
.elv-t-dropzone {
  border: 2px dashed rgba(var(--v-border-color), var(--v-border-opacity, 1));
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  cursor: pointer; transition: border-color 0.2s; min-height: 200px;
}
.elv-t-dropzone:hover, .elv-t-dropzone--hover { border-color: #ff3131; }
.elv-t-dot {
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(var(--v-border-color), 0.4);
  color: rgb(var(--v-theme-on-surface));
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.elv-t-dot--active { background: #ff3131; color: white; }
.elv-t-dot--done { background: #10b981; color: white; }
.elv-t-chip {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity, 1));
}

/* ===== DARK MODE OVERRIDES ===== */
.etax--dark,
.etax--dark :deep(.v-navigation-drawer__content) {
  background: #111827 !important;
}

.etax--dark .elv-t-stepbar {
  background: #1f2937 !important;
  border-bottom-color: rgba(255, 255, 255, 0.08) !important;
}

.etax--dark .elv-t-body {
  background: #111827 !important;
}

.etax--dark .elv-t-dropzone {
  background: #1f2937 !important;
  border-color: rgba(255, 255, 255, 0.15) !important;
}

.etax--dark .elv-t-dropzone:hover,
.etax--dark .elv-t-dropzone--hover {
  border-color: #ff3131 !important;
  background: rgba(255, 49, 49, 0.05) !important;
}

.etax--dark .elv-t-chip {
  background: #263548 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.etax--dark .elv-t-dot {
  background: rgba(255, 255, 255, 0.15) !important;
  color: rgba(255, 255, 255, 0.6) !important;
}

.etax--dark :deep(.v-field__outline) {
  --v-field-border-color: #4b5563;
}

.etax--dark :deep(.v-field) {
  background: #1f2937;
  color: #f3f4f6;
}

.etax--dark :deep(.v-field input::placeholder),
.etax--dark :deep(.v-field textarea::placeholder) {
  color: #6b7280;
}

.etax--dark :deep(.v-select__selection-text) {
  color: #f3f4f6;
}
</style>
