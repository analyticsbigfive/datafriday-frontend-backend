<template>
  <EventDrawerShell
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :persistent="importLoading"
    :is-dark="isDark"
    width="640"
    title="Importer des événements"
    :subtitle="stepLabel"
    flush
  >
    <template #icon>
      <FileSpreadsheet :size="20" color="white" />
    </template>

    <!-- BUG-148 : wrapper efd/elv--dark conservé ici (et non sur la racine) : le CSS scoped de
         ce composant ne matche que les éléments de son propre template, pas l'intérieur de
         EventDrawerShell. -->
    <div :class="{ 'elv--dark': isDark }">
    <!-- Step indicator — défile horizontalement plutôt que de couper les dernières étapes
         (ex. "Résultats" tronqué hors du cadre à 640px de large pour 8 étapes). -->
    <div class="px-4 py-3 elv-step-bar">
      <div class="elv-step-scroll">
        <template v-for="(s, i) in steps" :key="i">
          <div
            class="elv-step-item"
            :class="{ 'elv-step-item--active': step === i + 1 }"
          >
            <div
              class="elv-step-dot"
              :class="{
                'elv-step-dot--active': step === i + 1,
                'elv-step-dot--done': step > i + 1,
              }"
            >
              <CheckCircle2 v-if="step > i + 1" :size="12" />
              <span v-else class="elv-step-dot__num">{{ i + 1 }}</span>
            </div>
            <span
              class="elv-step-label"
              :class="step >= i + 1 ? 'font-weight-medium' : 'text-disabled'"
            >{{ s }}</span>
          </div>
          <div v-if="i < steps.length - 1" class="elv-step-line" />
        </template>
      </div>
    </div>

    <!-- Body -->
    <div class="elv-drawer-body pa-6">

      <!-- ── Step 1 : Upload ── -->
      <div v-if="step === 1">
        <v-alert v-if="fileError" type="error" variant="tonal" rounded="lg" class="mb-4">{{ fileError }}</v-alert>
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
              :menu-props="{ class: 'elv-select-overlay' }"
              style="flex: 1;"
            />
          </div>
        </div>
      </div>

      <!-- ── Steps 3-7 : mapping des valeurs de taxonomie (Espaces/Configs/Types/Catégories/
           Sous-catégories) — un seul bloc data-driven (computed `currentValueStep`) au lieu de
           5 blocs dupliqués : design garanti identique aux 5 étapes, un seul endroit à corriger. -->
      <div v-if="currentValueStep">
        <div class="d-flex align-center mb-1" style="gap: 8px;">
          <Tags :size="16" style="color: #6b7280;" />
          <span class="text-body-2 font-weight-medium">
            Colonne CSV : <strong>{{ mapping[currentValueStep.mappingKey] }}</strong>
          </span>
        </div>
        <div class="text-caption text-medium-emphasis mb-4">{{ currentValueStep.description }}</div>

        <v-alert v-if="currentValueStep.error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4">
          Impossible de charger {{ currentValueStep.title }} : {{ currentValueStep.error }}
          <div class="mt-2"><v-btn size="x-small" variant="outlined" rounded="lg" class="text-none" @click="currentValueStep.retry">Réessayer</v-btn></div>
        </v-alert>
        <v-alert v-else-if="currentValueStep.loading" type="info" variant="tonal" density="compact" rounded="lg" class="mb-4">
          <v-progress-circular indeterminate size="16" width="2" class="mr-2" />Chargement de {{ currentValueStep.title }}…
        </v-alert>
        <v-alert v-else-if="currentValueStep.items.length === 0" type="warning" variant="tonal" density="compact" rounded="lg" class="mb-4">
          {{ currentValueStep.emptySourceMessage }}
        </v-alert>

        <div v-if="currentValueStep.values.length > 0" class="elv-mapping-card">
          <div
            v-for="val in currentValueStep.values"
            :key="val"
            class="elv-mapping-row"
          >
            <div class="elv-csv-chip" :title="val">
              <span class="elv-csv-chip__text">{{ val }}</span>
            </div>
            <ArrowRight :size="14" class="elv-mapping-arrow" />
            <v-select
              v-model="currentValueStep.valueMap[val]"
              :items="currentValueStep.items"
              item-title="name"
              item-value="id"
              placeholder="Ignorer"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              clearable
              :menu-props="{ class: 'elv-select-overlay' }"
              class="elv-mapping-select"
            />
          </div>
        </div>
        <div v-else class="elv-empty-state">
          <Tags :size="26" class="elv-empty-state__icon" />
          <span>Aucune valeur trouvée dans le fichier pour cette colonne.</span>
        </div>
      </div>

      <!-- ── Step 4 : Map Configurations — bloc dédié (pas dans le computed `currentValueStep`) :
           une configuration appartient à EXACTEMENT un espace, donc le mapping se fait par PAIRE
           (espace, configuration) et non par valeur brute seule — sinon deux espaces avec une
           configuration de même nom seraient impossibles à distinguer, et rien n'indiquerait à
           l'utilisateur à quel espace appartient chaque option proposée. ── -->
      <div v-if="step === 4">
        <div class="d-flex align-center mb-1" style="gap: 8px;">
          <Tags :size="16" style="color: #6b7280;" />
          <span class="text-body-2 font-weight-medium">Colonne CSV : <strong>{{ mapping.configurationRaw }}</strong></span>
        </div>
        <div class="text-caption text-medium-emphasis mb-4">
          Associez chaque valeur de votre fichier à une configuration existante — la liste proposée
          est limitée aux configurations de l'espace correspondant à cette ligne.
        </div>

        <v-alert v-if="configsLoadError" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4">
          Impossible de charger les configurations : {{ configsLoadError }}
          <div class="mt-2"><v-btn size="x-small" variant="outlined" rounded="lg" class="text-none" @click="loadConfigsForCurrentSpaces">Réessayer</v-btn></div>
        </v-alert>
        <v-alert v-else-if="configsLoading" type="info" variant="tonal" density="compact" rounded="lg" class="mb-4">
          <v-progress-circular indeterminate size="16" width="2" class="mr-2" />Chargement des configurations…
        </v-alert>
        <v-alert v-else-if="allLoadedConfigurations.length === 0" type="warning" variant="tonal" density="compact" rounded="lg" class="mb-4">
          Aucune configuration trouvée pour les espaces mappés à l'étape précédente.
        </v-alert>

        <div v-if="uniqueSpaceConfigPairs.length > 0" class="elv-mapping-card">
          <div v-for="pair in uniqueSpaceConfigPairs" :key="pair.key" class="elv-mapping-row">
            <div class="elv-csv-chip elv-csv-chip--pair" :title="`${pair.spaceRaw} — ${pair.configRaw}`">
              <span class="elv-csv-chip__space">{{ pair.spaceRaw }}</span>
              <span class="elv-csv-chip__text">{{ pair.configRaw }}</span>
            </div>
            <ArrowRight :size="14" class="elv-mapping-arrow" />
            <v-select
              v-model="configValueMap[pair.key]"
              :items="configsForSpaceRaw(pair.spaceRaw)"
              item-title="name"
              item-value="id"
              :placeholder="configsForSpaceRaw(pair.spaceRaw).length ? 'Ignorer' : 'Aucune config. pour cet espace'"
              :disabled="configsForSpaceRaw(pair.spaceRaw).length === 0"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              clearable
              :menu-props="{ class: 'elv-select-overlay' }"
              class="elv-mapping-select"
            />
          </div>
        </div>
        <div v-else class="elv-empty-state">
          <Tags :size="26" class="elv-empty-state__icon" />
          <span>Aucune valeur trouvée dans le fichier pour cette colonne.</span>
        </div>
      </div>

      <!-- Résumé des valeurs non associées, affiché sur la dernière étape de mapping avant
           l'import : sans ça, une valeur laissée sur "Ignorer" (ou jamais visitée si le
           dropdown source était vide) part silencieusement sans son champ — voir
           docs/bugs/ (import CSV événements). -->
      <v-alert
        v-if="step === lastValueStep && unmappedSummary.length > 0"
        type="warning"
        variant="tonal"
        rounded="lg"
        class="mt-4"
      >
        <div class="font-weight-medium mb-2">Valeurs non associées — les lignes concernées seront importées sans ce champ :</div>
        <div v-for="u in unmappedSummary" :key="u.label" class="elv-unmapped-group">
          <div class="elv-unmapped-group__label">{{ u.label }} ({{ u.unmapped.length }})</div>
          <div class="elv-unmapped-group__chips">
            <span v-for="v in u.unmapped" :key="v" class="elv-unmapped-chip">{{ v }}</span>
          </div>
        </div>
      </v-alert>

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
          <v-alert v-if="importResults.missingAssociations > 0" type="warning" variant="tonal" rounded="lg" class="mb-4">
            <strong>{{ importResults.missingAssociations }}</strong>
            événement{{ importResults.missingAssociations > 1 ? 's' : '' }} importé{{ importResults.missingAssociations > 1 ? 's' : '' }} sans espace, configuration ou taxonomie associée (valeur du fichier non mappée) — voir l'étape de mapping.
          </v-alert>
          <v-alert v-if="importResults.skipped > 0" type="warning" variant="tonal" rounded="lg" class="mb-4">
            <strong>{{ importResults.skipped }}</strong>
            ligne{{ importResults.skipped > 1 ? 's' : '' }} ignorée{{ importResults.skipped > 1 ? 's' : '' }} (doublon déjà présent).
          </v-alert>
          <v-alert v-if="importResults.errors.length > 0" type="error" variant="tonal" rounded="lg" class="mb-4">
            <div class="font-weight-medium mb-2">
              {{ importResults.errors.length }} ligne{{ importResults.errors.length > 1 ? 's' : '' }} non importée{{ importResults.errors.length > 1 ? 's' : '' }}
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
    </div>

    <template #footer>
      <div class="d-flex" style="gap: 12px; flex: 1;">

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
    </template>
  </EventDrawerShell>
</template>

<script>
import { Upload, FileSpreadsheet, CheckCircle2, ArrowRight, Tags } from 'lucide-vue-next';
import { createEvent } from '@/api/endpoints/event.api';
import { parseCSV } from '@/utils/csv';
import EventDrawerShell from './EventDrawerShell.vue';

export default {
  name: 'CsvImportDrawer',
  components: { Upload, FileSpreadsheet, CheckCircle2, ArrowRight, Tags, EventDrawerShell },
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
      fileError: '',
      _spaceConfigsCache: {},
      taxonomyLoading: false,
      taxonomyErrors: {},
      configsLoading: false,
      configsLoadError: '',
      eventFields: [
        { key: 'spaceRaw',            label: 'Espace',                             aliases: ['space'] },
        { key: 'configurationRaw',    label: 'Configuration',                      aliases: ['configuration'] },
        { key: 'eventDate',           label: "Date de l'événement",                aliases: ['event date', 'eventdate', 'date'] },
        { key: 'eventEndDate',        label: "Date de fin de l'événement",         aliases: ['event end date', 'eventenddate', 'end date'] },
        { key: 'eventEndTime',        label: "Heure de fin de l'événement",        aliases: ['event end time', 'eventendtime', 'end time'] },
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

    events() {
      return this.$store.getters['events/events'] || [];
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
    uniqueTypeValues()        { return this._uniqueColValues('eventTypeRaw'); },
    uniqueCategoryValues()    { return this._uniqueColValues('eventCategoryRaw'); },
    uniqueSubcategoryValues() { return this._uniqueColValues('eventSubcategoryRaw'); },

    // Une configuration appartient à EXACTEMENT un espace (contrairement à Type/Catégorie/
    // Sous-catégorie, des taxonomies globales au tenant) — mapper par simple valeur brute de
    // colonne (comme les 4 autres dimensions) risquerait de confondre deux configs de même nom
    // dans deux espaces différents. On mappe donc par PAIRE (espace, configuration) réellement
    // observée dans le fichier, avec un select dont les options sont limitées aux configurations
    // de CET espace précis.
    uniqueSpaceConfigPairs() {
      const spaceCol = this.mapping.spaceRaw;
      const configCol = this.mapping.configurationRaw;
      if (!spaceCol || !configCol) return [];
      const spaceIdx = this.csvHeaders.indexOf(spaceCol);
      const configIdx = this.csvHeaders.indexOf(configCol);
      if (spaceIdx < 0 || configIdx < 0) return [];
      const seen = new Set();
      const pairs = [];
      for (const row of this.csvRows) {
        const s = row[spaceIdx]?.trim();
        const c = row[configIdx]?.trim();
        if (!s || !c) continue;
        const key = this._configPairKey(s, c);
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push({ key, spaceRaw: s, configRaw: c });
        }
      }
      return pairs;
    },

    unmappedSummary() {
      const dims = [
        { key: 'spaceRaw',            label: 'Espace',            values: this.uniqueSpaceValues,       map: this.spaceValueMap },
        { key: 'eventTypeRaw',        label: "Type d'événement",  values: this.uniqueTypeValues,        map: this.typeValueMap },
        { key: 'eventCategoryRaw',    label: 'Catégorie',         values: this.uniqueCategoryValues,    map: this.categoryValueMap },
        { key: 'eventSubcategoryRaw', label: 'Sous-catégorie',    values: this.uniqueSubcategoryValues, map: this.subcategoryValueMap },
      ];
      const result = dims
        .filter((d) => this.mapping[d.key])
        .map((d) => ({ label: d.label, unmapped: d.values.filter((v) => !d.map[v]) }))
        .filter((d) => d.unmapped.length > 0);

      if (this.mapping.configurationRaw) {
        const unmappedPairs = this.uniqueSpaceConfigPairs
          .filter((p) => !this.configValueMap[p.key])
          .map((p) => `${p.spaceRaw} / ${p.configRaw}`);
        if (unmappedPairs.length > 0) {
          result.push({ label: 'Configuration', unmapped: unmappedPairs });
        }
      }
      return result;
    },

    // Configuration de l'étape de mapping de valeurs actuellement affichée (steps 3 à 7) —
    // un seul computed data-driven plutôt que 5 blocs de template dupliqués.
    currentValueStep() {
      switch (this.step) {
        case 3:
          return {
            title: 'la liste des espaces',
            mappingKey: 'spaceRaw',
            description: "Associez chaque valeur de votre fichier à un espace existant dans le système.",
            values: this.uniqueSpaceValues,
            valueMap: this.spaceValueMap,
            items: this.spaces,
            loading: this.taxonomyLoading,
            error: this.taxonomyErrors.spaces,
            retry: this.loadTaxonomies,
            emptySourceMessage: "Aucun espace accessible avec votre compte. Vérifiez vos droits d'accès (espaces) auprès d'un administrateur.",
          };
        // case 4 (Configurations) volontairement absent d'ici : une configuration appartient à
        // un espace précis, ce n'est pas un mapping "valeur brute → item" comme les autres —
        // voir le bloc dédié `v-if="step === 4"` dans le template et `uniqueSpaceConfigPairs`.
        case 5:
          return {
            title: "les types d'événement",
            mappingKey: 'eventTypeRaw',
            description: "Associez chaque valeur de votre fichier à un type d'événement existant.",
            values: this.uniqueTypeValues,
            valueMap: this.typeValueMap,
            items: this.eventTypes,
            loading: this.taxonomyLoading,
            error: this.taxonomyErrors.eventTypes,
            retry: this.loadTaxonomies,
            emptySourceMessage: "Aucun type d'événement n'existe encore pour ce compte.",
          };
        case 6:
          return {
            title: 'les catégories',
            mappingKey: 'eventCategoryRaw',
            description: 'Associez chaque valeur de votre fichier à une catégorie existante.',
            values: this.uniqueCategoryValues,
            valueMap: this.categoryValueMap,
            items: this.eventCategories,
            loading: this.taxonomyLoading,
            error: this.taxonomyErrors.eventCategories,
            retry: this.loadTaxonomies,
            emptySourceMessage: "Aucune catégorie n'existe encore pour ce compte.",
          };
        case 7:
          return {
            title: 'les sous-catégories',
            mappingKey: 'eventSubcategoryRaw',
            description: 'Associez chaque valeur de votre fichier à une sous-catégorie existante.',
            values: this.uniqueSubcategoryValues,
            valueMap: this.subcategoryValueMap,
            items: this.eventSubcategories,
            loading: this.taxonomyLoading,
            error: this.taxonomyErrors.eventSubcategories,
            retry: this.loadTaxonomies,
            emptySourceMessage: "Aucune sous-catégorie n'existe encore pour ce compte.",
          };
        default:
          return null;
      }
    },
  },

  watch: {
    modelValue(v) {
      if (v) {
        this.loadTaxonomies();
      } else {
        this.reset();
      }
    },
    // Fait défiler la barre d'étapes pour garder l'étape courante visible (elle est plus large
    // que les 640px du drawer une fois les 8 étapes affichées).
    step() {
      this.$nextTick(() => {
        this.$el.querySelector?.('.elv-step-item--active')?.scrollIntoView({
          behavior: 'smooth', inline: 'center', block: 'nearest',
        });
      });
    },
  },

  methods: {
    async loadTaxonomies() {
      this.taxonomyLoading = true;
      this.taxonomyErrors = {};
      const jobs = [
        ['spaces', 'spaces/fetchSpaces'],
        ['eventTypes', 'eventTypes/fetchEventTypes'],
        ['eventCategories', 'eventCategories/fetchEventCategories'],
        ['eventSubcategories', 'eventSubcategories/fetchEventSubcategories'],
        ['events', 'events/fetchEvents'],
      ];
      const results = await Promise.allSettled(jobs.map(([, action]) => this.$store.dispatch(action)));
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const [key] = jobs[i];
          this.taxonomyErrors[key] = r.reason?.response?.data?.message || r.reason?.message || 'Erreur inconnue';
        }
      });
      this.taxonomyLoading = false;
    },

    async loadConfigsForCurrentSpaces() {
      this.configsLoading = true;
      this.configsLoadError = '';
      const mappedSpaceIds = [...new Set(Object.values(this.spaceValueMap).filter(Boolean))];
      const toLoad = mappedSpaceIds.length > 0 ? mappedSpaceIds : this.spaces.map((s) => s.id);
      const results = await Promise.allSettled(
        toLoad.map((sid) => this.$store.dispatch('spaceConfigurations/fetchForSpace', { spaceId: sid })),
      );
      const failures = [];
      for (let i = 0; i < toLoad.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          this._spaceConfigsCache = { ...this._spaceConfigsCache, [toLoad[i]]: r.value };
        } else if (r.status === 'rejected') {
          failures.push(r.reason?.response?.data?.message || r.reason?.message || 'Erreur inconnue');
        }
      }
      if (failures.length > 0) {
        this.configsLoadError = failures[0];
      }
      this.configsLoading = false;
    },

    _uniqueColValues(fieldKey) {
      const col = this.mapping[fieldKey];
      if (!col) return [];
      const idx = this.csvHeaders.indexOf(col);
      if (idx < 0) return [];
      return [...new Set(this.csvRows.map((r) => r[idx]?.trim()).filter(Boolean))];
    },

    _configPairKey(spaceRaw, configRaw) {
      return `${spaceRaw}␟${configRaw}`;
    },

    // Configurations disponibles pour l'espace RÉSOLU (spaceValueMap) correspondant à cette
    // valeur brute d'espace — jamais la liste pooled de tous les espaces mappés.
    configsForSpaceRaw(spaceRaw) {
      const spaceId = this.spaceValueMap[spaceRaw];
      if (!spaceId) return [];
      const rows = this._spaceConfigsCache[spaceId] || [];
      const seen = new Set();
      const configs = [];
      for (const c of rows) {
        const id = c?.id || c?._id;
        if (id && !seen.has(id)) {
          seen.add(id);
          configs.push({ ...c, id, name: c?.name || c?.configurationName || String(id) });
        }
      }
      return configs;
    },

    async navigateForward() {
      const idx = this.reachableValueSteps.indexOf(this.step);
      if (idx < 0 || idx >= this.reachableValueSteps.length - 1) return;
      const nextStep = this.reachableValueSteps[idx + 1];

      // Avant l'étape configs, charger les configurations des spaces mappés
      if (nextStep === 4) {
        await this.loadConfigsForCurrentSpaces();
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
      this.fileError = '';
      this.taxonomyLoading = false;
      this.taxonomyErrors = {};
      this.configsLoading = false;
      this.configsLoadError = '';
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

    // "All Sessions (Doors|Show)" : plusieurs sessions séparées par ";", chacune "portes|show"
    // (ex. "15:30|16:30; 18:15|19:30"). Repli sur les colonnes Doors Open/Show Time si la colonne
    // "All Sessions" est absente/vide pour cette ligne (une seule session).
    parseSessions(allSessionsRaw, fallbackDoors, fallbackShow) {
      const raw = (allSessionsRaw || '').trim();
      if (raw) {
        const sessions = raw
          .split(';')
          .map((group) => group.trim())
          .filter(Boolean)
          .map((group) => {
            const [doorsPart, showPart] = group.split('|');
            const doorsOpening = this.parseTime((doorsPart || '').trim()) || '';
            const showTime = this.parseTime((showPart || '').trim()) || '';
            return (doorsOpening || showTime) ? { doorsOpening, showTime } : null;
          })
          .filter(Boolean);
        if (sessions.length > 0) return sessions;
      }
      return (fallbackDoors || fallbackShow) ? [{ doorsOpening: fallbackDoors || '', showTime: fallbackShow || '' }] : undefined;
    },

    async doImport() {
      this.step = 8;
      this.importLoading = true;
      this.importResults = null;
      let successCount = 0;
      let skippedCount = 0;
      let missingAssociationsCount = 0;
      const errors = [];

      // Dédup au ré-import : un event existant avec le même nom (insensible à
      // la casse) + la même date n'est pas recréé (BUG-137).
      const existingKeys = new Set(
        (this.events || []).map((e) => `${String(e?.name || '').trim().toLowerCase()}|${String(e?.eventDate || '').slice(0, 10)}`),
      );

      for (let i = 0; i < this.csvRows.length; i++) {
        const row = this.csvRows[i];
        const get = (key) => this.getCellValue(row, key);

        const name = get('name');
        if (!name) {
          errors.push({ row: i + 2, message: 'Nom manquant' });
          continue;
        }

        const eventDate = get('eventDate') ? this.parseDate(get('eventDate')) : undefined;
        const dedupKey = `${name.trim().toLowerCase()}|${String(eventDate || '').slice(0, 10)}`;
        if (existingKeys.has(dedupKey)) {
          skippedCount++;
          errors.push({ row: i + 2, message: `Ignoré : un événement "${name}" existe déjà à cette date` });
          continue;
        }

        const spaceRaw         = get('spaceRaw');
        const configurationRaw = get('configurationRaw');
        const typeRaw          = get('eventTypeRaw');
        const categoryRaw      = get('eventCategoryRaw');
        const subcategoryRaw   = get('eventSubcategoryRaw');
        const doorsOpen        = get('doorsOpen') ? this.parseTime(get('doorsOpen')) : undefined;
        const showTime         = get('showTime') ? this.parseTime(get('showTime')) : undefined;
        const eventEndDate     = get('eventEndDate') ? this.parseDate(get('eventEndDate')) : undefined;
        const eventEndTime     = get('eventEndTime') ? this.parseTime(get('eventEndTime')) : undefined;

        const payload = {
          name,
          eventDate,
          eventEndDate,
          eventEndTime,
          homeTeamName:       get('homeTeamName') || undefined,
          visitingTeamName:   get('visitingTeam') || undefined,
          performerName:      get('performerName') || undefined,
          sponsor:            get('sponsor') || undefined,
          openingActName:     get('openingActName') || undefined,
          sessions:           this.parseSessions(get('allSessions'), doorsOpen, showTime),
          numberOfSessions:   get('numberOfSessions') ? parseInt(get('numberOfSessions')) : undefined,
          hasOpeningAct:      get('hasOpeningAct') ? this.parseBool(get('hasOpeningAct')) : undefined,
          hasIntermission:    get('hasIntermission') ? this.parseBool(get('hasIntermission')) : undefined,
          ticketsSold:        get('ticketsSold') ? parseInt(get('ticketsSold')) : undefined,
          ticketsScanned:     get('ticketsScanned') ? parseInt(get('ticketsScanned')) : undefined,
          spaceId:            (spaceRaw && this.spaceValueMap[spaceRaw]) || undefined,
          configurationId:    (spaceRaw && configurationRaw && this.configValueMap[this._configPairKey(spaceRaw, configurationRaw)]) || undefined,
          eventTypeId:        (typeRaw && this.typeValueMap[typeRaw]) || undefined,
          eventCategoryId:    (categoryRaw && this.categoryValueMap[categoryRaw]) || undefined,
          eventSubcategoryId: (subcategoryRaw && this.subcategoryValueMap[subcategoryRaw]) || undefined,
        };

        // Nettoyer les undefined
        Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

        // Une valeur brute présente dans le fichier mais restée sans map (ex. dropdown vide
        // au moment du mapping, cf. bug espaces vides) part sans son champ sans qu'aucune
        // erreur ne soit levée côté API (spaceId/etc. simplement absents du payload) — on le
        // compte pour l'afficher sur l'écran de résultats plutôt que de le laisser silencieux.
        const hasMissingAssociation = [
          [spaceRaw, payload.spaceId],
          [configurationRaw, payload.configurationId],
          [typeRaw, payload.eventTypeId],
          [categoryRaw, payload.eventCategoryId],
          [subcategoryRaw, payload.eventSubcategoryId],
        ].some(([raw, resolved]) => !!raw && !resolved);

        try {
          const response = await createEvent(payload);
          const created = response?.data ?? response;
          this.$store.dispatch('events/addEvent', created);
          existingKeys.add(dedupKey);
          successCount++;
          if (hasMissingAssociation) missingAssociationsCount++;
        } catch (e) {
          errors.push({
            row: i + 2,
            message: e?.response?.data?.message || e?.message || 'Erreur inconnue',
          });
        }
      }

      this.importResults = { success: successCount, skipped: skippedCount, missingAssociations: missingAssociationsCount, errors };
      this.importLoading = false;
      if (successCount > 0) this.$emit('imported');
    },
  },
};
</script>

<style scoped>
.elv-step-bar {
  border-bottom: 1px solid rgba(var(--v-border-color, 0, 0, 0), var(--v-border-opacity, 0.12));
  background: rgb(var(--v-theme-surface, 255, 255, 255));
  flex-shrink: 0;
}
.elv-step-line { background: rgba(var(--v-border-color, 0, 0, 0), var(--v-border-opacity, 0.12)); width: 20px; height: 1px; flex-shrink: 0; }
.elv-drawer-body { flex: 1; overflow-y: auto; background: rgb(var(--v-theme-background, 245, 245, 245)); }
.elv-dropzone {
  border: 2px dashed rgba(var(--v-border-color, 0, 0, 0), var(--v-border-opacity, 0.12));
  border-radius: 12px;
  background: rgb(var(--v-theme-surface, 255, 255, 255));
  cursor: pointer; transition: border-color 0.2s, background 0.2s; min-height: 220px;
}
.elv-dropzone:hover, .elv-dropzone--hover { border-color: #ff3131; }
.elv-hint-card { background: rgb(var(--v-theme-surface-variant, var(--v-theme-surface, 255, 255, 255))); border-radius: 8px; }

/* Barre d'étapes : défilement horizontal (scrollbar masquée, molette/trackpad toujours actifs)
   pour ne jamais couper une étape hors du cadre — cf. docs/bugs/ (barre tronquée à 8 étapes). */
.elv-step-scroll {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}
.elv-step-scroll::-webkit-scrollbar { display: none; }
.elv-step-item { display: flex; align-items: center; gap: 6px; flex-shrink: 0; padding: 2px 0; }
.elv-step-dot {
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(var(--v-border-color, 0, 0, 0), 0.4);
  color: rgb(var(--v-theme-on-surface, 0, 0, 0));
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: background 0.2s, color 0.2s;
}
.elv-step-dot--active { background: #ff3131; color: white; }
.elv-step-dot--done { background: #10b981; color: white; }
/* Palier `sm` (0.75rem) de la charte graphique — le plus petit disponible hors module Analyse,
   utilisé ici pour un badge de 22px (docs/CHARTE_GRAPHIQUE.md §3/§6). */
.elv-step-dot__num { font-size: 0.75rem; font-weight: 700; }
.elv-step-label { font-size: 0.75rem; white-space: nowrap; }

/* BUG : fond sombre en thème clair — `--v-theme-surface-variant` n'est PAS surchargé par
   `dataFridayLight` (plugins/vuetify.js), donc Vuetify retombe sur son défaut interne
   `#424242` (node_modules/vuetify/lib/composables/theme.js:25), un gris charbon — d'où la puce
   qui apparaissait sombre alors que toute la page est en thème clair. On utilise un gris clair
   littéral plutôt que ce token, non fiable pour cet usage. */
.elv-csv-chip {
  background: #f3f4f6;
  border: 1px solid rgba(var(--v-border-color, 0, 0, 0), var(--v-border-opacity, 0.12));
  border-radius: 8px;
  padding: 6px 10px;
  min-width: 150px;
  max-width: 150px;
  flex-shrink: 0;
}
.elv-csv-chip__text {
  font-size: 0.8125rem;
  font-weight: 500;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.elv-csv-chip--pair { display: flex; flex-direction: column; gap: 2px; }
.elv-csv-chip__space {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Liste de mapping (étapes 3-7) : un seul conteneur avec séparateurs entre lignes, plutôt que
   des lignes flottantes espacées — plus lisible sur une longue liste de valeurs. */
.elv-mapping-card {
  border: 1px solid rgba(var(--v-border-color, 0, 0, 0), var(--v-border-opacity, 0.12));
  border-radius: 12px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface, 255, 255, 255));
}
.elv-mapping-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--v-border-color, 0, 0, 0), var(--v-border-opacity, 0.12));
  transition: background 0.15s;
}
.elv-mapping-row:last-child { border-bottom: none; }
.elv-mapping-row:hover { background: rgba(var(--v-border-color, 0, 0, 0), 0.04); }
.elv-mapping-arrow { color: #9ca3af; flex-shrink: 0; }
.elv-mapping-select { flex: 1; min-width: 0; }

/* État vide (aucune valeur à mapper pour cette colonne) : bloc centré cohérent avec la zone de
   dépôt de l'étape 1, plutôt qu'un simple bandeau d'alerte. */
.elv-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 16px;
  color: #9ca3af;
  font-size: 0.8125rem;
  text-align: center;
}
.elv-empty-state__icon { opacity: 0.5; }

/* Résumé "valeurs non associées" : groupes de chips par dimension plutôt qu'une phrase avec
   virgules, plus scannable quand il y a beaucoup de valeurs. */
.elv-unmapped-group { margin-top: 10px; }
.elv-unmapped-group__label { font-size: 0.8125rem; font-weight: 600; margin-bottom: 6px; }
.elv-unmapped-group__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.elv-unmapped-chip {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
  background: rgba(217, 119, 6, 0.12);
  color: #92400e;
}

/* ===== DARK MODE OVERRIDES ===== */
.elv--dark,
.elv--dark :deep(.v-navigation-drawer__content) {
  background: #111827 !important;
  color: #f3f4f6;
}

.elv--dark .text-medium-emphasis {
  color: #9ca3af !important;
}

.elv--dark .elv-step-bar {
  background: #1f2937 !important;
  border-bottom-color: rgba(255, 255, 255, 0.08) !important;
}

.elv--dark .elv-drawer-body {
  background: #111827 !important;
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

.elv--dark .elv-csv-chip__space {
  color: #9ca3af !important;
}

.elv--dark .elv-step-line {
  background: rgba(255, 255, 255, 0.12) !important;
}

.elv--dark .elv-step-dot {
  background: rgba(255, 255, 255, 0.15) !important;
  color: rgba(255, 255, 255, 0.6) !important;
}

.elv--dark .elv-mapping-card {
  background: #1f2937 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.elv--dark .elv-mapping-row {
  border-bottom-color: rgba(255, 255, 255, 0.08) !important;
}

.elv--dark .elv-mapping-row:hover {
  background: rgba(255, 255, 255, 0.04) !important;
}

.elv--dark .elv-empty-state {
  color: #6b7280 !important;
}

.elv--dark .elv-unmapped-chip {
  background: rgba(217, 119, 6, 0.18) !important;
  color: #fbbf24 !important;
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

.elv--dark :deep(.v-list-item-title) {
  color: #f3f4f6;
}
</style>

<style>
/* Non scoped à dessein : le menu déroulant d'un v-select Vuetify (`.v-select__content`)
   est téléporté par Vuetify dans `.v-overlay-container`, un sibling de ce drawer sous
   <body> — donc HORS de la portée du CSS scoped ci-dessus et hors de `.elv--dark`
   (même mécanisme que docs/bugs/198_darkmode_eventpredict_overlay_teleporte.md :
   `.dark` sur <html> reste le seul ancêtre commun fiable). */

/* BUG-241 (v2, corrigé après lecture du code source Vuetify — la 1ère tentative ciblait le
   mauvais élément et n'avait aucun effet) : EventDrawerShell.vue force le drawer à z-index 2200
   et son scrim à 2199 (BUG-148). Le z-index dynamique de Vuetify (composable `useStack`,
   node_modules/vuetify/lib/composables/stack.js) est posé en style INLINE sur le wrapper
   `.v-overlay` (VOverlay.js:275-286 : `"style": [stackStyles.value, ...]`) — PAS sur
   `.v-overlay__content` (VOverlay.js:299-303, qui ne reçoit que `dimensionStyles`/`contentStyles`,
   sans z-index). `.v-overlay` a `position: fixed` + ce z-index inline → établit SA PROPRE
   stacking context : un z-index posé sur son enfant `.v-overlay__content` ne peut jamais
   "s'échapper" au-dessus d'éléments extérieurs à `.v-overlay` (notre drawer à 2200), quelle que
   soit sa valeur — d'où l'échec silencieux du 1er correctif (`.v-overlay__content.v-select__content
   { z-index: 2300 }`, toujours présent ci-dessous pour la couleur en dark mode, mais inutile pour
   la visibilité). Le menu "s'ouvre" bien (chevron inversé, isActive Vue passe à true) mais reste
   invisible car son wrapper `.v-overlay` est stacké SOUS le drawer. Indépendant du thème :
   reproductible en clair comme en sombre.
   Fix : chaque `<v-select>` du wizard passe désormais `menu-props="{ class: 'elv-select-overlay' }"`
   — VMenu.js:137 pose `props.class` sur SON `.v-overlay` (`"class": ['v-menu', props.class]`),
   donc cette classe atterrit bien sur le wrapper externe, la seule cible qui compte pour le
   z-index réel. */
.elv-select-overlay {
  z-index: 2300 !important;
}

.v-overlay__content.v-select__content {
  z-index: 2300 !important;
}

.dark .v-overlay__content.v-select__content .v-list-item-title,
.dark .v-overlay__content.v-select__content .v-list-item {
  color: #f3f4f6 !important;
}
.dark .v-overlay__content.v-select__content {
  background: #1f2937 !important;
}
</style>
