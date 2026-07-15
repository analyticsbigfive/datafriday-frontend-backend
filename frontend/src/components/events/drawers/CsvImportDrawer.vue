<template>
  <v-navigation-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    location="right"
    temporary
    width="640"
    class="elv-csv-drawer"
    :class="{ 'elv--dark': isDark }"
  >
    <!-- Header -->
    <div class="elv-drawer-header">
      <div class="elv-drawer-header__icon">
        <FileSpreadsheet :size="20" color="white" />
      </div>
      <div class="elv-drawer-header__text">
        <div class="elv-drawer-header__title">Importer des événements</div>
        <div class="elv-drawer-header__sub">{{ stepLabel }}</div>
      </div>
      <button class="elv-drawer-header__close" @click="$emit('update:modelValue', false)">
        <X :size="18" />
      </button>
    </div>

    <!-- Step indicator -->
    <div class="px-6 py-3 elv-step-bar">
      <div class="d-flex align-center" style="gap: 4px;">
        <template v-for="(s, i) in steps" :key="i">
          <div class="d-flex align-center" style="gap: 4px; flex-shrink: 0;">
            <div
              class="elv-step-dot"
              :class="{
                'elv-step-dot--active': step === i + 1,
                'elv-step-dot--done': step > i + 1,
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
            class="elv-step-line"
            style="flex: 1; height: 1px; min-width: 8px;"
          />
        </template>
      </div>
    </div>

    <!-- Body -->
    <div class="elv-drawer-body pa-6">

      <!-- ── Step 1 : Upload ── -->
      <div v-if="step === 1">
        <input ref="fileInput" type="file" accept=".csv,.tsv,text/csv" style="display: none;" @change="onFileChange" />
        <div
          class="elv-dropzone d-flex flex-column align-center justify-center pa-10"
          :class="{ 'elv-dropzone--hover': dropping }"
          @click="$refs.fileInput.click()"
          @dragover.prevent="dropping = true"
          @dragleave.prevent="dropping = false"
          @drop.prevent="onDrop"
        >
          <FileSpreadsheet :size="52" class="mb-4" style="color: #9ca3af;" />
          <div class="text-h6 font-weight-medium mb-1">Glissez un fichier CSV ici</div>
          <div class="text-body-2 text-medium-emphasis mb-5">ou cliquez pour parcourir</div>
          <v-btn variant="outlined" rounded="lg" size="small" class="text-none" @click.stop="$refs.fileInput.click()">
            <Upload :size="16" class="mr-2" />
            Choisir un fichier
          </v-btn>
        </div>
        <v-card variant="tonal" rounded="lg" class="mt-4 pa-4" elevation="0">
          <div class="text-body-2 font-weight-medium mb-1">Format attendu</div>
          <div class="text-caption text-medium-emphasis">Première ligne = en-têtes · Séparateur virgule · Encodage UTF-8</div>
        </v-card>
      </div>

      <!-- ── Step 2 : Mapping colonnes ── -->
      <div v-if="step === 2">
        <div class="d-flex align-center mb-4" style="gap: 8px;">
          <FileSpreadsheet :size="16" style="color: #6b7280; flex-shrink: 0;" />
          <span class="text-body-2 font-weight-medium">{{ fileName }}</span>
          <v-chip size="x-small" variant="tonal" color="primary">
            {{ csvRows.length }} ligne{{ csvRows.length > 1 ? 's' : '' }}
          </v-chip>
        </div>
        <div class="text-body-2 font-weight-medium mb-3">Associez les colonnes CSV aux champs événement</div>
        <div>
          <div v-for="field in eventFields" :key="field.key" class="d-flex align-center mb-2" style="gap: 12px;">
            <div style="min-width: 200px; flex-shrink: 0;">
              <span class="text-body-2">{{ field.label }}</span>
              <v-chip v-if="field.required" size="x-small" color="error" variant="flat" class="ml-1">requis</v-chip>
            </div>
            <v-select
              v-model="mapping[field.key]"
              :items="columnOptions"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              style="flex: 1;"
            />
          </div>
        </div>
      </div>

      <!-- ── Step 3 : Map Espaces ── -->
      <div v-if="step === 3">
        <div class="d-flex align-center mb-1" style="gap: 8px;">
          <Tags :size="16" style="color: #6b7280;" />
          <span class="text-body-2 font-weight-medium">Colonne CSV : <strong>{{ mapping.spaceRaw }}</strong></span>
        </div>
        <div class="text-caption text-medium-emphasis mb-4">
          Associez chaque valeur de votre fichier à un espace existant dans le système.
        </div>
        <div v-if="uniqueSpaceValues.length > 0">
          <div v-for="val in uniqueSpaceValues" :key="val" class="d-flex align-center mb-3" style="gap: 12px;">
            <div class="pa-2 rounded elv-csv-chip" style="min-width: 150px; flex-shrink: 0;">
              <span class="text-body-2 font-weight-medium" style="word-break: break-all;">{{ val }}</span>
            </div>
            <ArrowRight :size="14" style="color: #9ca3af; flex-shrink: 0;" />
            <v-select
              v-model="spaceValueMap[val]"
              :items="spaces"
              item-title="name"
              item-value="id"
              placeholder="Ignorer"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              clearable
              style="flex: 1;"
            />
          </div>
        </div>
        <v-alert v-else type="info" variant="tonal" density="compact" rounded="lg">Aucune valeur trouvée.</v-alert>
      </div>

      <!-- ── Step 4 : Map Configurations ── -->
      <div v-if="step === 4">
        <div class="d-flex align-center mb-1" style="gap: 8px;">
          <Tags :size="16" style="color: #6b7280;" />
          <span class="text-body-2 font-weight-medium">Colonne CSV : <strong>{{ mapping.configurationRaw }}</strong></span>
        </div>
        <div class="text-caption text-medium-emphasis mb-4">
          Associez chaque valeur de votre fichier à une configuration existante.
        </div>
        <div v-if="uniqueConfigValues.length > 0">
          <div v-for="val in uniqueConfigValues" :key="val" class="d-flex align-center mb-3" style="gap: 12px;">
            <div class="pa-2 rounded elv-csv-chip" style="min-width: 150px; flex-shrink: 0;">
              <span class="text-body-2 font-weight-medium" style="word-break: break-all;">{{ val }}</span>
            </div>
            <ArrowRight :size="14" style="color: #9ca3af; flex-shrink: 0;" />
            <v-select
              v-model="configValueMap[val]"
              :items="allLoadedConfigurations"
              item-title="name"
              item-value="id"
              placeholder="Ignorer"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              clearable
              style="flex: 1;"
            />
          </div>
        </div>
        <v-alert v-else type="info" variant="tonal" density="compact" rounded="lg">Aucune valeur trouvée.</v-alert>
      </div>

      <!-- ── Step 5 : Map Type ── -->
      <div v-if="step === 5">
        <div class="d-flex align-center mb-1" style="gap: 8px;">
          <Tags :size="16" style="color: #6b7280;" />
          <span class="text-body-2 font-weight-medium">Colonne CSV : <strong>{{ mapping.eventTypeRaw }}</strong></span>
        </div>
        <div class="text-caption text-medium-emphasis mb-4">
          Associez chaque valeur de votre fichier à un type d'événement existant.
        </div>
        <div v-if="uniqueTypeValues.length > 0">
          <div v-for="val in uniqueTypeValues" :key="val" class="d-flex align-center mb-3" style="gap: 12px;">
            <div class="pa-2 rounded elv-csv-chip" style="min-width: 150px; flex-shrink: 0;">
              <span class="text-body-2 font-weight-medium" style="word-break: break-all;">{{ val }}</span>
            </div>
            <ArrowRight :size="14" style="color: #9ca3af; flex-shrink: 0;" />
            <v-select
              v-model="typeValueMap[val]"
              :items="eventTypes"
              item-title="name"
              item-value="id"
              placeholder="Ignorer"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              clearable
              style="flex: 1;"
            />
          </div>
        </div>
        <v-alert v-else type="info" variant="tonal" density="compact" rounded="lg">Aucune valeur trouvée.</v-alert>
      </div>

      <!-- ── Step 6 : Map Catégorie ── -->
      <div v-if="step === 6">
        <div class="d-flex align-center mb-1" style="gap: 8px;">
          <Tags :size="16" style="color: #6b7280;" />
          <span class="text-body-2 font-weight-medium">Colonne CSV : <strong>{{ mapping.eventCategoryRaw }}</strong></span>
        </div>
        <div class="text-caption text-medium-emphasis mb-4">
          Associez chaque valeur de votre fichier à une catégorie existante.
        </div>
        <div v-if="uniqueCategoryValues.length > 0">
          <div v-for="val in uniqueCategoryValues" :key="val" class="d-flex align-center mb-3" style="gap: 12px;">
            <div class="pa-2 rounded elv-csv-chip" style="min-width: 150px; flex-shrink: 0;">
              <span class="text-body-2 font-weight-medium" style="word-break: break-all;">{{ val }}</span>
            </div>
            <ArrowRight :size="14" style="color: #9ca3af; flex-shrink: 0;" />
            <v-select
              v-model="categoryValueMap[val]"
              :items="eventCategories"
              item-title="name"
              item-value="id"
              placeholder="Ignorer"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              clearable
              style="flex: 1;"
            />
          </div>
        </div>
        <v-alert v-else type="info" variant="tonal" density="compact" rounded="lg">Aucune valeur trouvée.</v-alert>
      </div>

      <!-- ── Step 7 : Map Sous-catégorie ── -->
      <div v-if="step === 7">
        <div class="d-flex align-center mb-1" style="gap: 8px;">
          <Tags :size="16" style="color: #6b7280;" />
          <span class="text-body-2 font-weight-medium">Colonne CSV : <strong>{{ mapping.eventSubcategoryRaw }}</strong></span>
        </div>
        <div class="text-caption text-medium-emphasis mb-4">
          Associez chaque valeur de votre fichier à une sous-catégorie existante.
        </div>
        <div v-if="uniqueSubcategoryValues.length > 0">
          <div v-for="val in uniqueSubcategoryValues" :key="val" class="d-flex align-center mb-3" style="gap: 12px;">
            <div class="pa-2 rounded elv-csv-chip" style="min-width: 150px; flex-shrink: 0;">
              <span class="text-body-2 font-weight-medium" style="word-break: break-all;">{{ val }}</span>
            </div>
            <ArrowRight :size="14" style="color: #9ca3af; flex-shrink: 0;" />
            <v-select
              v-model="subcategoryValueMap[val]"
              :items="eventSubcategories"
              item-title="name"
              item-value="id"
              placeholder="Ignorer"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              clearable
              style="flex: 1;"
            />
          </div>
        </div>
        <v-alert v-else type="info" variant="tonal" density="compact" rounded="lg">Aucune valeur trouvée.</v-alert>
      </div>

      <!-- ── Step 8 : Résultats ── -->
      <div v-if="step === 8">
        <div v-if="importLoading" class="d-flex flex-column align-center justify-center py-12">
          <v-progress-circular indeterminate color="#ff3131" size="48" class="mb-4" />
          <div class="text-body-2 text-medium-emphasis">Importation en cours...</div>
        </div>
        <template v-else-if="importResults">
          <v-alert v-if="importResults.success > 0" type="success" variant="tonal" rounded="lg" class="mb-4">
            <strong>{{ importResults.success }}</strong>
            événement{{ importResults.success > 1 ? 's' : '' }} importé{{ importResults.success > 1 ? 's' : '' }} avec succès.
          </v-alert>
          <v-alert v-if="importResults.errors.length > 0" type="error" variant="tonal" rounded="lg" class="mb-4">
            <div class="font-weight-medium mb-2">
              {{ importResults.errors.length }} erreur{{ importResults.errors.length > 1 ? 's' : '' }}
            </div>
            <ul style="padding-left: 16px; margin: 0;">
              <li v-for="err in importResults.errors" :key="err.row" class="text-body-2">
                Ligne {{ err.row }} : {{ err.message }}
              </li>
            </ul>
          </v-alert>
          <v-alert v-if="importResults.success === 0 && importResults.errors.length === 0" type="info" variant="tonal" rounded="lg">
            Aucune ligne à importer (fichier vide ?).
          </v-alert>
        </template>
      </div>

    </div>

    <!-- Footer -->
    <div class="elv-drawer-footer pa-6">
      <div class="d-flex" style="gap: 12px;">

        <template v-if="step >= 2 && step <= 7">
          <v-btn variant="outlined" rounded="lg" size="small" class="text-none" style="flex: 1;" @click="navigateBack">
            Retour
          </v-btn>
          <v-btn
            v-if="step !== lastValueStep"
            color="#ff3131"
            variant="flat"
            rounded="lg"
            size="small"
            class="text-white text-none"
            style="flex: 1;"
            :disabled="step === 2 && !canProceedFromMapping"
            @click="navigateForward"
          >
            Suivant
          </v-btn>
          <v-btn
            v-else
            color="#ff3131"
            variant="flat"
            rounded="lg"
            size="small"
            class="text-white text-none"
            style="flex: 1;"
            :disabled="step === 2 && !canProceedFromMapping"
            :loading="importLoading"
            @click="doImport"
          >
            <Upload :size="16" class="mr-2" />
            Importer {{ csvRows.length }} ligne{{ csvRows.length > 1 ? 's' : '' }}
          </v-btn>
        </template>

        <template v-if="step === 8 && !importLoading">
          <v-btn variant="outlined" rounded="lg" size="small" class="text-none" style="flex: 1;" @click="reset">
            Importer un autre fichier
          </v-btn>
          <v-btn color="#ff3131" variant="flat" rounded="lg" size="small" class="text-white text-none" style="flex: 1;" @click="$emit('update:modelValue', false)">
            Fermer
          </v-btn>
        </template>

      </div>
    </div>
  </v-navigation-drawer>
</template>

<script>
import { X, Upload, FileSpreadsheet, CheckCircle2, ArrowRight, Tags } from 'lucide-vue-next';
import { createEvent } from '@/api/endpoints/event.api';
import { parseCSV } from '@/utils/csv';

export default {
  name: 'CsvImportDrawer',
  components: { X, Upload, FileSpreadsheet, CheckCircle2, ArrowRight, Tags },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'imported'],

  data() {
    return {
      step: 1,
      steps: ['Fichier', 'Colonnes', 'Espaces', 'Configs', 'Types', 'Catégories', 'Sous-cat.', 'Résultats'],
      dropping: false,
      fileName: '',
      csvHeaders: [],
      csvRows: [],
      mapping: {},
      spaceValueMap: {},
      configValueMap: {},
      typeValueMap: {},
      categoryValueMap: {},
      subcategoryValueMap: {},
      importLoading: false,
      importResults: null,
      _spaceConfigsCache: {},
      eventFields: [
        { key: 'spaceRaw',            label: 'Espace',                             aliases: ['space'] },
        { key: 'configurationRaw',    label: 'Configuration',                      aliases: ['configuration'] },
        { key: 'eventDate',           label: "Date de l'événement",                aliases: ['event date', 'eventdate', 'date'] },
        { key: 'name',                label: "Nom de l'événement", required: true, aliases: ['event name', 'eventname', 'nom'] },
        { key: 'eventTypeRaw',        label: "Type d'événement",                   aliases: ['event type', 'eventtype', 'type'] },
        { key: 'eventCategoryRaw',    label: 'Catégorie',                          aliases: ['event category', 'eventcategory', 'category', 'categorie'] },
        { key: 'eventSubcategoryRaw', label: 'Sous-catégorie',                     aliases: ['event subcategory', 'eventsubcategory', 'subcategory'] },
        { key: 'doorsOpen',           label: 'Ouverture des portes',               aliases: ['doors open', 'doorsopen'] },
        { key: 'showTime',            label: 'Heure du show',                      aliases: ['show time', 'showtime'] },
        { key: 'performerName',       label: 'Nom du performer',                   aliases: ['performer name', 'performername', 'performer'] },
        { key: 'homeTeamName',        label: 'Équipe domicile',                    aliases: ['home team name', 'hometeamname', 'home team'] },
        { key: 'visitingTeam',        label: 'Équipe visiteur',                    aliases: ['visiting team', 'visitingteam'] },
        { key: 'sponsor',             label: 'Sponsor',                            aliases: ['sponsor'] },
        { key: 'numberOfSessions',    label: 'Nombre de sessions',                 aliases: ['number of sessions', 'numberofsessions'] },
        { key: 'allSessions',         label: 'Toutes les sessions (Portes|Show)',  aliases: ['all sessions (doors|show)', 'allsessions', 'all sessions'] },
        { key: 'hasOpeningAct',       label: 'Opening Act (oui/non)',              aliases: ['has opening act', 'hasopeningact'] },
        { key: 'openingActName',      label: "Nom de l'opening act",               aliases: ['opening act name', 'openingactname'] },
        { key: 'hasIntermission',     label: 'Intermission (oui/non)',             aliases: ['has intermission', 'hasintermission', 'intermission'] },
        { key: 'ticketsSold',         label: 'Tickets vendus',                     aliases: ['tickets sold', 'ticketssold'] },
        { key: 'ticketsScanned',      label: 'Tickets scannés',                    aliases: ['tickets scanned', 'ticketsscanned'] },
      ],
    };
  },

  computed: {
    stepLabel() {
      const labels = [
        'Choisissez un fichier CSV',
        'Associez les colonnes aux champs',
        'Associez les espaces',
        'Associez les configurations',
        "Associez les types d'événement",
        'Associez les catégories',
        'Associez les sous-catégories',
        "Résultats de l'importation",
      ];
      return labels[this.step - 1] || '';
    },

    columnOptions() {
      return [
        { title: '— Ignorer —', value: null },
        ...this.csvHeaders.map((h) => ({ title: h, value: h })),
      ];
    },

    canProceedFromMapping() {
      return !!(this.mapping['name'] && this.csvRows.length > 0);
    },

    reachableValueSteps() {
      const s = [2];
      if (this.mapping.spaceRaw)           s.push(3);
      if (this.mapping.configurationRaw)   s.push(4);
      if (this.mapping.eventTypeRaw)       s.push(5);
      if (this.mapping.eventCategoryRaw)   s.push(6);
      if (this.mapping.eventSubcategoryRaw) s.push(7);
      return s;
    },

    lastValueStep() {
      return this.reachableValueSteps[this.reachableValueSteps.length - 1];
    },

    spaces() {
      return (this.$store.getters['spaces/spaces'] || [])
        .map((s) => ({ ...s, id: s?.id || s?._id, name: s?.name || s?.spaceName || s?.title || '' }))
        .filter((s) => !!s.id);
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

    eventSubcategories() {
      return (this.$store.getters['eventSubcategories/eventSubcategories'] || [])
        .map((s) => ({ ...s, id: s?.id || s?._id }))
        .filter((s) => !!s.id);
    },

    allLoadedConfigurations() {
      const mappedSpaceIds = [...new Set(Object.values(this.spaceValueMap).filter(Boolean))];
      const source = mappedSpaceIds.length > 0 ? mappedSpaceIds : this.spaces.map((s) => s.id);
      const configs = [];
      const seen = new Set();
      for (const sid of source) {
        const rows = this._spaceConfigsCache[sid] || [];
        for (const c of rows) {
          const id = c?.id || c?._id;
          if (id && !seen.has(id)) {
            seen.add(id);
            configs.push({ ...c, id, name: c?.name || c?.configurationName || String(id) });
          }
        }
      }
      return configs;
    },

    uniqueSpaceValues()       { return this._uniqueColValues('spaceRaw'); },
    uniqueConfigValues()      { return this._uniqueColValues('configurationRaw'); },
    uniqueTypeValues()        { return this._uniqueColValues('eventTypeRaw'); },
    uniqueCategoryValues()    { return this._uniqueColValues('eventCategoryRaw'); },
    uniqueSubcategoryValues() { return this._uniqueColValues('eventSubcategoryRaw'); },
  },

  watch: {
    modelValue(v) {
      if (v) {
        Promise.allSettled([
          this.$store.dispatch('spaces/fetchSpaces'),
          this.$store.dispatch('eventTypes/fetchEventTypes'),
          this.$store.dispatch('eventCategories/fetchEventCategories'),
          this.$store.dispatch('eventSubcategories/fetchEventSubcategories'),
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

    async navigateForward() {
      const idx = this.reachableValueSteps.indexOf(this.step);
      if (idx < 0 || idx >= this.reachableValueSteps.length - 1) return;
      const nextStep = this.reachableValueSteps[idx + 1];

      // Avant l'étape configs, charger les configurations des spaces mappés
      if (nextStep === 4) {
        const mappedSpaceIds = [...new Set(Object.values(this.spaceValueMap).filter(Boolean))];
        const toLoad = mappedSpaceIds.length > 0 ? mappedSpaceIds : this.spaces.map((s) => s.id);
        const results = await Promise.allSettled(
          toLoad.map((sid) => this.$store.dispatch('spaceConfigurations/fetchForSpace', { spaceId: sid }).catch(() => []))
        );
        for (let i = 0; i < toLoad.length; i++) {
          const r = results[i];
          if (r.status === 'fulfilled' && Array.isArray(r.value)) {
            this._spaceConfigsCache = { ...this._spaceConfigsCache, [toLoad[i]]: r.value };
          }
        }
      }
      this.step = nextStep;
    },

    navigateBack() {
      const idx = this.reachableValueSteps.indexOf(this.step);
      if (idx > 0) {
        this.step = this.reachableValueSteps[idx - 1];
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
      this.spaceValueMap = {};
      this.configValueMap = {};
      this.typeValueMap = {};
      this.categoryValueMap = {};
      this.subcategoryValueMap = {};
      this.importLoading = false;
      this.importResults = null;
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
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result;
        const parsed = parseCSV(text);
        if (parsed.length < 2) return;
        this.csvHeaders = parsed[0];
        this.csvRows = parsed.slice(1).filter((r) => r.some((c) => c.trim()));
        this.mapping = {};
        const norm = (s) => s.toLowerCase().replace(/[\s_\-()|]/g, '');
        for (const field of this.eventFields) {
          const match = this.csvHeaders.find((h) => {
            const hNorm = norm(h);
            return (
              hNorm === norm(field.key) ||
              h.toLowerCase() === field.key.toLowerCase() ||
              field.aliases?.some((a) => h.toLowerCase() === a || hNorm === norm(a))
            );
          });
          this.mapping[field.key] = match || null;
        }
        this.spaceValueMap = {};
        this.configValueMap = {};
        this.typeValueMap = {};
        this.categoryValueMap = {};
        this.subcategoryValueMap = {};
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

    parseBool(val) {
      if (!val) return false;
      return ['true', '1', 'oui', 'yes'].includes(String(val).toLowerCase().trim());
    },

    parseDate(val) {
      if (!val) return undefined;
      // DD/MM/YYYY → YYYY-MM-DD
      const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      return val;
    },

    parseTime(val) {
      if (!val) return undefined;
      // HHhMM → HH:MM
      return val.replace(/h/i, ':');
    },

    async doImport() {
      this.step = 8;
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

        const spaceRaw         = get('spaceRaw');
        const configurationRaw = get('configurationRaw');
        const typeRaw          = get('eventTypeRaw');
        const categoryRaw      = get('eventCategoryRaw');
        const subcategoryRaw   = get('eventSubcategoryRaw');

        const payload = {
          name,
          eventDate:          get('eventDate') ? this.parseDate(get('eventDate')) : undefined,
          doorsOpen:          get('doorsOpen') ? this.parseTime(get('doorsOpen')) : undefined,
          showTime:           get('showTime') ? this.parseTime(get('showTime')) : undefined,
          performerName:      get('performerName') || undefined,
          homeTeamName:       get('homeTeamName') || undefined,
          visitingTeam:       get('visitingTeam') || undefined,
          sponsor:            get('sponsor') || undefined,
          numberOfSessions:   get('numberOfSessions') ? parseInt(get('numberOfSessions')) : undefined,
          allSessions:        get('allSessions') || undefined,
          hasOpeningAct:      get('hasOpeningAct') ? this.parseBool(get('hasOpeningAct')) : undefined,
          openingActName:     get('openingActName') || undefined,
          hasIntermission:    get('hasIntermission') ? this.parseBool(get('hasIntermission')) : undefined,
          ticketsSold:        get('ticketsSold') ? parseInt(get('ticketsSold')) : undefined,
          ticketsScanned:     get('ticketsScanned') ? parseInt(get('ticketsScanned')) : undefined,
          spaceId:            (spaceRaw && this.spaceValueMap[spaceRaw]) || undefined,
          configurationId:    (configurationRaw && this.configValueMap[configurationRaw]) || undefined,
          eventTypeId:        (typeRaw && this.typeValueMap[typeRaw]) || undefined,
          eventCategoryId:    (categoryRaw && this.categoryValueMap[categoryRaw]) || undefined,
          eventSubcategoryId: (subcategoryRaw && this.subcategoryValueMap[subcategoryRaw]) || undefined,
        };

        // Nettoyer les undefined
        Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

        try {
          const response = await createEvent(payload);
          const created = response?.data ?? response;
          this.$store.dispatch('events/addEvent', created);
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
.elv-csv-drawer { display: flex; flex-direction: column; }
.elv-csv-drawer :deep(.v-navigation-drawer__content) { display: flex; flex-direction: column; }
.elv-drawer-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  flex-shrink: 0;
}
.elv-drawer-header__icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.elv-drawer-header__text { flex: 1; }
.elv-drawer-header__title { font-size: 16px; font-weight: 700; color: #fff; }
.elv-drawer-header__sub { font-size: 12.5px; color: rgba(255,255,255,.75); margin-top: 2px; }
.elv-drawer-header__close {
  width: 30px; height: 30px; border-radius: 8px; border: none;
  background: rgba(255,255,255,.15);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: rgba(255,255,255,.85); flex-shrink: 0; transition: background .2s;
}
.elv-drawer-header__close:hover { background: rgba(255,255,255,.25); }
.elv-step-bar {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity, 1));
  background: rgb(var(--v-theme-surface));
  flex-shrink: 0;
}
.elv-step-line { background: rgba(var(--v-border-color), var(--v-border-opacity, 1)); }
.elv-drawer-body { flex: 1; overflow-y: auto; background: rgb(var(--v-theme-background)); }
.elv-drawer-footer {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity, 1));
  background: rgb(var(--v-theme-surface));
  flex-shrink: 0;
}
.elv-dropzone {
  border: 2px dashed rgba(var(--v-border-color), var(--v-border-opacity, 1));
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  cursor: pointer; transition: border-color 0.2s, background 0.2s; min-height: 220px;
}
.elv-dropzone:hover, .elv-dropzone--hover { border-color: #ff3131; }
.elv-hint-card { background: rgb(var(--v-theme-surface-variant, var(--v-theme-surface))); border-radius: 8px; }
.elv-step-dot {
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(var(--v-border-color), 0.4);
  color: rgb(var(--v-theme-on-surface));
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.elv-step-dot--active { background: #ff3131; color: white; }
.elv-step-dot--done { background: #10b981; color: white; }
.elv-csv-chip {
  background: rgb(var(--v-theme-surface-variant, var(--v-theme-surface)));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity, 1));
}

/* ===== DARK MODE OVERRIDES ===== */
.elv--dark,
.elv--dark :deep(.v-navigation-drawer__content) {
  background: #111827 !important;
}

.elv--dark .elv-drawer-header {
  background: #1f2937 !important;
  border-bottom-color: rgba(255, 255, 255, 0.08) !important;
}

.elv--dark .elv-step-bar {
  background: #1f2937 !important;
  border-bottom-color: rgba(255, 255, 255, 0.08) !important;
}

.elv--dark .elv-drawer-body {
  background: #111827 !important;
}

.elv--dark .elv-drawer-footer {
  background: #1f2937 !important;
  border-top-color: rgba(255, 255, 255, 0.08) !important;
}

.elv--dark .elv-dropzone {
  background: #1f2937 !important;
  border-color: rgba(255, 255, 255, 0.15) !important;
}

.elv--dark .elv-dropzone:hover,
.elv--dark .elv-dropzone--hover {
  border-color: #ff3131 !important;
  background: rgba(255, 49, 49, 0.05) !important;
}

.elv--dark .elv-csv-chip {
  background: #263548 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.elv--dark .elv-step-line {
  background: rgba(255, 255, 255, 0.12) !important;
}

.elv--dark .elv-step-dot {
  background: rgba(255, 255, 255, 0.15) !important;
  color: rgba(255, 255, 255, 0.6) !important;
}

.elv--dark :deep(.v-field__outline) {
  --v-field-border-color: #4b5563;
}

.elv--dark :deep(.v-field) {
  background: #1f2937;
  color: #f3f4f6;
}

.elv--dark :deep(.v-field input::placeholder),
.elv--dark :deep(.v-field textarea::placeholder) {
  color: #6b7280;
}

.elv--dark :deep(.v-select__selection-text) {
  color: #f3f4f6;
}
</style>
