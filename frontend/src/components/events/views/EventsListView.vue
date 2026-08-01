<template>
  <div class="elv-root" :class="{'elv--dark': isDark}">

    <!-- ── Header ── -->
    <div class="elv-header sticky-header">
      <div class="elv-header__inner">
        <div class="elv-header__left">
          <div class="elv-header__icon">
            <Calendar :size="22" color="white" />
          </div>
          <div>
            <h1 class="elv-header__title">{{ t('eventsList.title') }}</h1>
            <p class="elv-header__subtitle">{{ t('eventsList.subtitle') }}</p>
          </div>
        </div>
        <div class="elv-header__right">
          <div class="elv-header__sep"></div>
          <div class="elv-header__actions">
            <button class="elv-action-hbtn" @click="exportToCSV">
              <Download :size="15" /> {{ t('eventsList.exportCsv') }}
            </button>
            <button class="elv-action-hbtn" @click="csvImportDrawer = true">
              <Upload :size="15" /> {{ t('eventsList.importCsv') }}
            </button>
            <button class="elv-add-btn" @click="openAddEventDialog">
              <Plus :size="17" /> {{ t('eventsList.newEvent') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Search bar ── -->
    <div class="elv-searchbar sticky-search">
      <div class="elv-searchbar__inner">
        <Search :size="17" class="elv-searchbar__icon" />
        <input v-model="search" class="elv-searchbar__input" type="search" :placeholder="t('eventsList.searchPlaceholder')" />
        <div class="elv-filter-pills">
          <select v-model="selectedLocation" class="elv-filter-select">
            <option value="">{{ t('eventsList.allLocations') }}</option>
            <option v-for="opt in locationOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <select v-model="selectedType" class="elv-filter-select">
            <option value="">{{ locale === 'fr' ? 'Tous les types' : 'All types' }}</option>
            <option v-for="opt in typeOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <select v-model="selectedCategory" class="elv-filter-select">
            <option value="">{{ locale === 'fr' ? 'Toutes les catégories' : 'All categories' }}</option>
            <option v-for="opt in categoryOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>
        <span class="elv-searchbar__count">
          <Calendar :size="13" />
          {{ filteredEvents.length }} événement{{ filteredEvents.length !== 1 ? 's' : '' }}
        </span>
        <button v-if="hasActiveFilters" class="elv-searchbar__clear" @click="clearFilters">
          <X :size="15" />
        </button>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="elv-content">

      <!-- Error -->
      <div v-if="error" class="elv-error-bar mb-4">
        <AlertCircle :size="14" /> {{ error }}
      </div>

      <!-- Barre d'action groupée (visible quand des lignes sont sélectionnées) -->
      <div v-if="selected.length" class="elv-bulk-bar">
        <span class="elv-bulk-bar__info">
          {{ selected.length }} {{ locale === 'fr' ? 'sélectionné' : 'selected' }}{{ selected.length > 1 ? 's' : '' }}
        </span>
        <div class="elv-bulk-bar__actions">
          <button class="elv-bulk-bar__clear" @click="selected = []">
            {{ locale === 'fr' ? 'Désélectionner' : 'Clear' }}
          </button>
          <button class="elv-bulk-bar__del" @click="openBulkDelete">
            <Trash2 :size="15" /> {{ locale === 'fr' ? 'Supprimer' : 'Delete' }}
          </button>
        </div>
      </div>

      <!-- Table card -->
      <div class="elv-table-wrap">
        <v-data-table
          v-model="selected"
          :headers="tableHeaders"
          :items="filteredEvents"
          :loading="loading ? '#ff3131' : false"
          item-value="id"
          show-select
          :items-per-page="25"
          :items-per-page-options="[10, 25, 50, 100]"
          density="compact"
          class="elv-table"
        >
          <template #item.eventDate="{ item }">
            {{ formatDate(item.eventDate) }}
          </template>
          <template #item.eventStartDate="{ item }">
            {{ formatDate(item.eventStartDate) }}
          </template>
          <template #item.eventEndDate="{ item }">
            {{ formatDate(item.eventEndDate) }}
          </template>
          <template #item.revenue="{ item }">
            {{ formatCurrency(item.revenue) }}
          </template>
          <template #item.transactionCount="{ item }">
            {{ Number(item.transactionCount ?? 0) }}
          </template>
          <template #item.ticketsScanned="{ item }">
            {{ item.ticketsScanned != null ? Number(item.ticketsScanned) : '—' }}
          </template>
          <template #item.actions="{ item }">
            <div class="elv-actions">
              <div class="elv-abtn elv-abtn--edit" @click.stop="openEditEventDialog(item.raw)">
                <Pencil :size="15" />
              </div>
              <div class="elv-abtn elv-abtn--del" @click.stop="openDeleteEventDialog(item.raw)">
                <Trash2 :size="15" />
              </div>
            </div>
          </template>
        </v-data-table>
      </div>
    </div>

    <EventFormDrawer
      v-model="addEventDialog"
      :mode="addEventMode"
      :initial-event="editingEvent"
      :is-dark="isDark"
      @submitted="loadEvents({ forceRefresh: true })"
    />

    <EventDeleteDialog
      v-model="deleteEventDialog"
      :event-name="deleteEventName"
      :loading="deleteEventLoading"
      :error="deleteEventError"
      :is-dark="isDark"
      @confirm="confirmDeleteEvent"
    />

    <!-- Suppression multiple : dialog stylé maison — état confirmation puis progression X/N -->
    <v-dialog v-model="bulkDeleteDialog" max-width="440" :persistent="bulkDeleteLoading">
      <div class="elv-bd" :class="{ 'elv-bd--dark': isDark }">
        <div class="elv-bd__header">
          <div class="elv-bd__icon"><Trash2 :size="20" color="white" /></div>
          <div class="elv-bd__title">{{ locale === 'fr' ? 'Supprimer des événements' : 'Delete events' }}</div>
          <button v-if="!bulkDeleteLoading" type="button" class="elv-bd__close" aria-label="Fermer" @click="bulkDeleteDialog = false">
            <X :size="18" />
          </button>
        </div>

        <div class="elv-bd__body">
          <div v-if="bulkDeleteError" class="elv-bd__error">
            <AlertCircle :size="14" style="flex-shrink:0" /> {{ bulkDeleteError }}
          </div>

          <template v-if="bulkDeleteLoading">
            <div class="elv-bd__progress">
              <div class="elv-bd__progress-bar" :style="{ width: bulkDeletePct + '%' }"></div>
            </div>
            <div class="elv-bd__progress-label">
              {{ bulkDeleteProgress }}/{{ bulkDeleteTotal }}
              {{ locale === 'fr' ? 'événements supprimés' : 'events deleted' }}
            </div>
          </template>
          <p v-else class="elv-bd__text">
            {{ locale === 'fr' ? 'Voulez-vous vraiment supprimer' : 'Delete' }}
            <strong>{{ selected.length }} {{ locale === 'fr' ? 'événement' : 'event' }}{{ selected.length > 1 ? 's' : '' }}</strong> ?
          </p>
        </div>

        <div class="elv-bd__footer">
          <template v-if="!bulkDeleteLoading">
            <button type="button" class="elv-bd__btn elv-bd__btn--cancel" @click="bulkDeleteDialog = false">
              {{ locale === 'fr' ? 'Annuler' : 'Cancel' }}
            </button>
            <button type="button" class="elv-bd__btn elv-bd__btn--danger" :disabled="!selected.length" @click="confirmBulkDelete">
              <Trash2 :size="14" /> {{ locale === 'fr' ? 'Supprimer' : 'Delete' }}
            </button>
          </template>
          <button v-else type="button" class="elv-bd__btn elv-bd__btn--cancel" disabled>
            {{ locale === 'fr' ? 'Suppression en cours…' : 'Deleting…' }}
          </button>
        </div>
      </div>
    </v-dialog>

    <CsvImportDrawer
      v-model="csvImportDrawer"
      :is-dark="isDark"
      @imported="loadEvents({ forceRefresh: true })"
    />
  </div>
</template>

<script>
import { t as translate, getCurrentLocale } from "@/i18n/translations";
import { Upload, Download, Plus, Trash2, Pencil, Search, Calendar, AlertCircle, X } from "lucide-vue-next";
import { deleteEvent } from "@/api/endpoints/event.api";
import { downloadCSV } from "@/utils/csv";
import EventFormDrawer from "@/components/events/drawers/EventFormDrawer.vue";
import EventDeleteDialog from "@/components/events/dialogs/EventDeleteDialog.vue";
import CsvImportDrawer from "@/components/events/drawers/CsvImportDrawer.vue";

export default {
  name: "EventsListView",
  components: {
    Upload,
    Download,
    Plus,
    Trash2,
    Pencil,
    Search,
    Calendar,
    AlertCircle,
    X,
    EventFormDrawer,
    EventDeleteDialog,
    CsvImportDrawer,
  },
  data() {
    return {
      locale: getCurrentLocale(),
      theme: (() => { const s = localStorage.getItem('datafriday:theme') || localStorage.getItem('appTheme') || 'dataFridayLight'; return (s === 'light' ? 'dataFridayLight' : s === 'dark' ? 'dataFridayDark' : s); })(),
      search: "",
      selectedLocation: "",
      selectedType: "",
      selectedCategory: "",
      loading: false,
      error: "",
      addEventDialog: false,
      addEventMode: "create",
      editingEvent: null,
      deleteEventDialog: false,
      deleteEventLoading: false,
      deleteEventError: "",
      deleteEventId: null,
      deleteEventName: "",
      csvImportDrawer: false,
      // Suppression multiple (sélection dans la table)
      selected: [],
      bulkDeleteDialog: false,
      bulkDeleteLoading: false,
      bulkDeleteError: "",
      bulkDeleteProgress: 0,
      bulkDeleteTotal: 0,
    };
  },

  methods: {
    t(key) {
      return translate(key, this.locale);
    },
    handleLocaleChange(event) {
      this.locale = event.detail.locale;
    },
    _onThemeChanged(event) {
      this.theme = event.detail?.theme || 'light';
    },
    clearFilters() {
      this.search = "";
      this.selectedLocation = "";
      this.selectedType = "";
      this.selectedCategory = "";
    },

    async loadTaxonomies() {
      await Promise.allSettled([
        this.$store.dispatch('eventTypes/fetchEventTypes'),
        this.$store.dispatch('eventCategories/fetchEventCategories'),
        this.$store.dispatch('eventSubcategories/fetchEventSubcategories'),
      ]);
    },
    async loadSpaces() {
      try {
        await this.$store.dispatch('spaces/fetchSpaces');
      } catch (e) {}
    },
    openAddEventDialog() {
      this.editingEvent = null;
      this.addEventMode = 'create';
      this.addEventDialog = true;
    },
    openEditEventDialog(row) {
      const e = row?.raw || row;
      if (!e) return;
      this.editingEvent = e;
      this.addEventMode = 'edit';
      this.addEventDialog = true;
    },
    openDeepLinkedEvent() {
      const id = this.$route.query?.editEventId;
      if (!id) return;
      const ev = (this.events || []).find((e) => String(e.id) === String(id));
      // BUG-154 : ne PAS nettoyer la query si l'event n'est pas (encore) trouvé — `activated()`
      // peut s'exécuter avant que `loadEvents()` (awaité dans `mounted()`) n'ait résolu lors de la
      // toute première activation de la session ; effacer la query ici sans avoir ouvert la fiche
      // ferait perdre le deep-link définitivement. `mounted()` rappelle cette même méthode une fois
      // les events chargés, donc un id valide finit toujours par être résolu.
      if (!ev) return;
      this.openEditEventDialog(ev);
      // Nettoie la query pour ne pas rouvrir la fiche à chaque navigation/refresh.
      this.$router.replace({ name: 'events' }).catch(() => {});
    },
    openDeleteEventDialog(row) {
      const e = row?.raw || row;
      this.deleteEventId = e?.id || null;
      this.deleteEventName = e?.name || 'this event';
      this.deleteEventError = '';
      this.deleteEventLoading = false;
      this.deleteEventDialog = true;
    },
    closeDeleteEventDialog() {
      this.deleteEventDialog = false;
      this.deleteEventLoading = false;
      this.deleteEventError = '';
      this.deleteEventId = null;
      this.deleteEventName = '';
    },
    async confirmDeleteEvent() {
      if (!this.deleteEventId) { this.deleteEventError = 'Missing event id'; return; }
      this.deleteEventLoading = true;
      this.deleteEventError = '';
      try {
        await deleteEvent(this.deleteEventId);
        this.$store.dispatch('events/removeEvent', this.deleteEventId);
        this.closeDeleteEventDialog();
      } catch (e) {
        this.deleteEventError = e?.response?.data?.message || e?.message || 'Failed to delete event';
      } finally {
        this.deleteEventLoading = false;
      }
    },
    // Suppression multiple : supprime chaque event sélectionné en séquence (évite de saturer
    // le rate-limiter), retire du store au fur et à mesure ; les échecs restent sélectionnés.
    openBulkDelete() {
      this.bulkDeleteError = '';
      this.bulkDeleteProgress = 0;
      this.bulkDeleteTotal = 0;
      this.bulkDeleteDialog = true;
    },
    async confirmBulkDelete() {
      const ids = [...this.selected];
      if (!ids.length) return;
      this.bulkDeleteLoading = true;
      this.bulkDeleteError = '';
      this.bulkDeleteTotal = ids.length;
      this.bulkDeleteProgress = 0;
      const failed = [];
      for (const id of ids) {
        try {
          await deleteEvent(id);
          this.$store.dispatch('events/removeEvent', id);
        } catch (e) {
          failed.push(id);
        }
        this.bulkDeleteProgress += 1;
      }
      this.bulkDeleteLoading = false;
      this.selected = failed;
      if (failed.length) {
        this.bulkDeleteError = this.locale === 'fr'
          ? `${failed.length} événement(s) n'ont pas pu être supprimés.`
          : `${failed.length} event(s) could not be deleted.`;
      } else {
        this.bulkDeleteDialog = false;
      }
    },
    async loadEvents({ forceRefresh = false } = {}) {
      this.loading = true;
      this.error = "";
      try {
        await this.$store.dispatch('events/fetchEvents', { forceRefresh });
      } catch (e) {
        this.error =
          e?.userMessage ||
          e?.message ||
          "Impossible de charger les événements";
      } finally {
        this.loading = false;
      }
    },
    formatDate(value) {
      if (!value) return "-";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString("fr-FR");
    },
    formatCurrency(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return "€0,00";
      return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
    },
    // Un event reste ré-importable tel quel : les en-têtes reprennent les libellés que
    // CsvImportDrawer.vue auto-détecte (aliases d'`eventFields`), et l'ordre des colonnes
    // suit celui de l'assistant d'import plutôt que l'ordre d'affichage du tableau.
    parseEventSessions(raw) {
      let list = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else if (typeof raw === 'string' && raw.trim()) {
        try {
          list = JSON.parse(raw);
          if (!Array.isArray(list)) list = [];
        } catch {
          list = [];
        }
      }
      // Repli sur des events déjà persistés par un ancien double-encodage (BUG-250-02,
      // EventFormDrawer.vue stringifiait chaque session avant envoi) : chaque élément est
      // alors une chaîne JSON plutôt qu'un objet — un second parse suffit à les récupérer.
      return list
        .map((s) => {
          if (typeof s === 'string') { try { return JSON.parse(s); } catch { return null; } }
          return s;
        })
        .filter((s) => s && typeof s === 'object' && !Array.isArray(s));
    },
    async exportToCSV() {
      const rows = this.filteredEvents || [];

      const spaceIds = Array.from(new Set(rows.map((r) => r.raw?.spaceId).filter(Boolean)));
      const configLists = await Promise.all(
        spaceIds.map((spaceId) =>
          this.$store.dispatch('spaceConfigurations/fetchForSpace', { spaceId }).catch(() => []),
        ),
      );
      const configNameById = new Map();
      configLists.forEach((list) => {
        (list || []).forEach((c) => c?.id && configNameById.set(c.id, c.name || c.configurationName || ''));
      });

      const header = [
        'Space', 'Configuration', 'Event Date', 'End Date', 'End Time', 'Event Name',
        'Event Type', 'Event Category', 'Event Subcategory', 'Doors Open', 'Show Time',
        'Performer Name', 'Home Team Name', 'Visiting Team', 'Sponsor', 'Number of Sessions',
        'All Sessions (Doors|Show)', 'Has Opening Act', 'Opening Act Name', 'Has Intermission',
        'Tickets Sold', 'Tickets Scanned',
      ];

      const csvRows = [
        header,
        ...rows.map((row) => {
          const e = row.raw || {};
          const sessions = this.parseEventSessions(e.sessions);
          const firstSession = sessions[0] || {};
          return [
            e.spaceName || '',
            (e.configurationId && configNameById.get(e.configurationId)) || '',
            this.formatDate(e.eventDate),
            e.eventEndDate ? this.formatDate(e.eventEndDate) : '',
            e.eventEndTime || '',
            e.name || '',
            row.eventType !== '-' ? row.eventType : '',
            row.eventCategory !== '-' ? row.eventCategory : '',
            row.eventSubcategory !== '-' ? row.eventSubcategory : '',
            firstSession.doorsOpening || '',
            firstSession.showTime || '',
            e.performerName || '',
            e.homeTeamName || '',
            e.visitingTeamName || '',
            e.sponsor || '',
            e.numberOfSessions ?? '',
            sessions.map((s) => `${s.doorsOpening || ''}|${s.showTime || ''}`).join('; '),
            e.hasOpeningAct ? 'Oui' : 'Non',
            e.openingActName || '',
            e.hasIntermission ? 'Oui' : 'Non',
            e.ticketsSold ?? '',
            e.ticketsScanned ?? '',
          ];
        }),
      ];

      downloadCSV(csvRows, 'events');
    },
  },

  computed: {
    isDark() {
      return this.theme === 'dark' || this.theme === 'dataFridayDark';
    },
    bulkDeletePct() {
      return this.bulkDeleteTotal ? Math.round((this.bulkDeleteProgress / this.bulkDeleteTotal) * 100) : 0;
    },
    tableHeaders() {
      return [
        { title: this.t('eventsList.colSpace'), key: 'spaceName' },
        { title: this.t('eventsList.colDate'), key: 'eventStartDate' },
        { title: this.t('eventsList.colName'), key: 'name' },
        { title: this.t('eventsList.colStartDate'), key: 'eventStartDate' },
        { title: this.t('eventsList.colCategory'), key: 'eventCategory' },
        { title: this.t('eventsList.colRevenue'), key: 'revenue', align: 'end' },
        { title: 'Tickets Scanned', key: 'ticketsScanned', align: 'end' },
        { title: this.t('eventsList.colActions'), key: 'actions', sortable: false, align: 'end' },
      ];
    },
    spaceItems() {
      return this.spaces.map(s => ({
        name: s.name || s.spaceName || 'Unknown',
        id: s.id
      }));
    },
    events() {
      return this.$store.getters['events/events']
    },
    spaces() {
      return this.$store.getters['spaces/spaces']
        .map((s) => ({
          ...s,
          id: s?.id || s?._id,
          name: s?.name || s?.spaceName || s?.title || "",
        }))
        .filter((s) => !!s.id)
    },
    spacesById() {
      const map = new Map();
      for (const s of this.spaces) map.set(s.id, s);
      return map;
    },
    mappedEvents() {
      return (this.events || []).map((e) => {
        const spaceFromId = this.spacesById.get(e.spaceId);
        const spaceName = e.spaceName || spaceFromId?.name || e.space || e.location || "-";
        const eventDate = e.eventDate || e.date || e.startsAt || e.startDate;
        const eventStartDate = e.eventStartDate || e.startDate || '';
        const eventEndDate = e.eventEndDate || e.endDate || '';
        const eventEndTime = e.eventEndTime || '';
        const name = e.name || e.eventName || "-";

        const eventType = e?.eventType?.name || e?.eventTypeName || "-";
        const eventCategory = e?.eventCategory?.name || e?.eventCategoryName || "-";
        const eventSubcategory = e?.eventSubcategory?.name || e?.eventSubcategoryName || "-";

        const status = e.status || "-";
        const revenue = e.revenue ?? e.totalRevenue ?? 0;
        const transactionCount = e.transactionCount ?? null;
        const ticketsScanned = e.ticketsScanned ?? e.attendees ?? null;

        return {
          id: e.id || `${name}-${eventDate || ""}-${spaceName}`,
          spaceName,
          eventDate,
          eventStartDate,
          eventEndDate,
          eventEndTime,
          name,
          eventType,
          eventCategory,
          eventSubcategory,
          status,
          revenue,
          transactionCount,
          ticketsScanned,
          raw: e,
        };
      });
    },
    locationOptions() {
      const list = (this.mappedEvents || []).map((r) => r.spaceName).filter((v) => v && v !== "-");
      return Array.from(new Set(list)).sort((a, b) => String(a).localeCompare(String(b)));
    },
    typeOptions() {
      const list = (this.mappedEvents || []).map((r) => r.eventType).filter((v) => v && v !== "-");
      return Array.from(new Set(list)).sort((a, b) => String(a).localeCompare(String(b)));
    },
    categoryOptions() {
      const list = (this.mappedEvents || []).map((r) => r.eventCategory).filter((v) => v && v !== "-");
      return Array.from(new Set(list)).sort((a, b) => String(a).localeCompare(String(b)));
    },
    hasActiveFilters() {
      return !!(this.search || this.selectedLocation || this.selectedType || this.selectedCategory);
    },
    filteredEvents() {
      const q = (this.search || "").trim().toLowerCase();

      return (this.mappedEvents || []).filter((row) => {
        if (this.selectedLocation && String(row.spaceName) !== String(this.selectedLocation)) return false;
        if (this.selectedType && String(row.eventType) !== String(this.selectedType)) return false;
        if (this.selectedCategory && String(row.eventCategory) !== String(this.selectedCategory)) return false;

        if (!q) return true;
        const hay = [
          row.spaceName,
          row.name,
          row.eventType,
          row.eventCategory,
          row.eventSubcategory,
          row.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    },
  },

  async mounted() {
    window.addEventListener('locale-changed', this.handleLocaleChange);
    window.addEventListener('theme-changed', this._onThemeChanged);
    this.loadTaxonomies();
    this.loadSpaces();
    await this.loadEvents();
    // Deep-link : ?editEventId=<id> (ex. depuis l'alerte « évènements sans coup
    // d'envoi » de la Moyenne timeline, ou depuis TaxonomyDetailDrawer) → ouvre
    // directement la fiche event.
    this.openDeepLinkedEvent();
  },
  // BUG-154 : /events a `meta.keepAlive: true` (DashboardView enveloppe le router-view dans
  // <keep-alive>) — sans ce hook, `mounted()` ne se redéclenche qu'à la toute première visite de
  // la session ; toute navigation ultérieure vers /events?editEventId=<id> (ex. depuis le tiroir
  // « Événements liés » des écrans taxonomie) laissait le query param dans l'URL sans jamais rouvrir
  // la fiche. Même classe de bug que BUG-122 (SpaceMenuView, deep-link cassé par keep-alive).
  activated() {
    this.openDeepLinkedEvent();
  },
  beforeUnmount() {
    window.removeEventListener('locale-changed', this.handleLocaleChange);
    window.removeEventListener('theme-changed', this._onThemeChanged);
  },
};
</script>

<style scoped>
.elv-root {
  width: 100%;
  min-height: 100%;
  background: #f5f5f5;
}
.elv--dark.elv-root { background: #111827; }

/* ── Header ── */
.elv-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
}
.sticky-header { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.elv-header__inner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 28px; gap: 16px; flex-wrap: wrap;
}
.elv-header__left { display: flex; align-items: center; gap: 14px; }
.elv-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.elv-header__title { font-size: var(--fs-xl); font-weight: var(--fw-bold); color: #fff; margin: 0; line-height: 1.2; }
.elv-header__subtitle { font-size: var(--fs-sm); color: rgba(255,255,255,.72); margin: 3px 0 0; }
.elv-header__right { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.elv-header__sep { width: 1px; height: 32px; background: rgba(255,255,255,.25); }
.elv-header__actions { display: flex; align-items: center; gap: 8px; }
.elv-action-hbtn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 14px; border-radius: 100px;
  border: 1.5px solid rgba(255,255,255,.6);
  background: transparent; color: rgba(255,255,255,.9);
  font-size: var(--fs-sm); font-weight: 600; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.elv-action-hbtn:hover { background: rgba(255,255,255,.15); border-color: #fff; }
.elv-add-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 9px 18px; border-radius: 100px;
  border: 2px solid rgba(255,255,255,.85);
  background: transparent; color: #fff;
  font-size: var(--fs-base); font-weight: 700; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.elv-add-btn:hover { background: #fff; color: #ff3131; }

/* ── Search bar ── */
.elv-searchbar {
  background: #fff; border-bottom: 1px solid #e5e7eb;
  position: sticky; top: 81px; z-index: 99; flex-shrink: 0;
}
.elv--dark .elv-searchbar { background: #1e293b; border-bottom-color: rgba(255,255,255,.08); }
.elv-searchbar__inner { display: flex; align-items: center; gap: 10px; padding: 10px 28px; flex-wrap: wrap; }
.elv-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.elv-searchbar__input {
  flex: 1; min-width: 140px; border: none; outline: none;
  background: transparent; font-size: var(--fs-md); color: #111827;
}
.elv--dark .elv-searchbar__input { color: #e5e7eb; }
.elv-searchbar__input::placeholder { color: #9ca3af; }

/* ── Filtres (All locations / All types / All categories) : pilules stylées ── */
.elv-filter-pills { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.elv-filter-select {
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background-color: #fff;
  color: #374151;
  font-size: var(--fs-base);
  font-weight: 500;
  padding: 7px 32px 7px 14px;
  max-width: 190px;
  cursor: pointer;
  outline: none;
  text-overflow: ellipsis;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 11px center;
  background-size: 14px;
  transition: border-color .15s ease, box-shadow .15s ease, background-color .15s ease;
}
.elv-filter-select:hover { border-color: #d1d5db; }
.elv-filter-select:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .12);
}
.elv--dark .elv-filter-select {
  background-color: #0f172a;
  border-color: rgba(255, 255, 255, .14);
  color: #e5e7eb;
}
.elv--dark .elv-filter-select:hover { border-color: rgba(255, 255, 255, .28); }

.elv-searchbar__count { font-size: var(--fs-sm); color: #9ca3af; white-space: nowrap; display: flex; align-items: center; gap: 4px; }

/* ── Content ── */
.elv-content { padding: 24px 28px; }

/* Error */
.elv-error-bar {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca;
  color: #991b1b; border-radius: 12px;
  padding: 12px 16px; font-size: var(--fs-base);
}

/* Table wrap */
.elv-table-wrap {
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}
.elv--dark .elv-table-wrap { background: #1e293b; border-color: rgba(255,255,255,.08); }

/* Table (reference: MarketPriceListView) */
.elv-table :deep(.v-data-table__th),
.elv-table :deep(.v-data-table__td) {
  font-size: var(--fs-base);
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 16px;
  padding-right: 16px;
}
.elv-table :deep(.v-data-table__td) { vertical-align: middle; }
.elv-table :deep(.v-data-table__th) {
  font-size: var(--fs-xs)!important;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #9ca3af !important;
  background: #fafafa !important;
}
.elv-table :deep(tbody tr:hover td) { background: #fafafa !important; }
.elv--dark .elv-table :deep(.v-data-table__th) { background: #1a2332 !important; }
.elv--dark .elv-table :deep(tbody tr:hover td) { background: #1a2332 !important; }

/* Table action buttons */
.elv-actions { display: flex; gap: 4px; justify-content: flex-end; }
.elv-abtn {
  width: 28px; height: 28px;
  border-radius: 8px;
  background: #f3f4f6; color: #6b7280;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s, color .15s; flex-shrink: 0;
}
.elv-abtn--edit { background: #eff6ff; color: #2563eb; }
.elv-abtn--edit:hover { background: #dbeafe; }
.elv-abtn--del { background: #fef2f2; color: #ff3131; }
.elv-abtn--del:hover { background: #fee2e2; }

/* Dark mode — compléments */
.elv--dark .elv-error-bar { background: rgba(255,49,49,.12); border-color: rgba(255,49,49,.35); color: #fca5a5; }
.elv--dark .elv-abtn { background: #1f2937; color: #cbd5e1; }
.elv--dark .elv-abtn--edit { background: rgba(37,99,235,.15); color: #93c5fd; }
.elv--dark .elv-abtn--del { background: rgba(255,49,49,.14); color: #fca5a5; }
.elv--dark .elv-table :deep(.v-data-table__td) { color: #e2e8f0; }

/* ── Barre d'action groupée (suppression multiple) ── */
.elv-bulk-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 16px; margin-bottom: 12px;
  background: #fff5f5; border: 1px solid #fecaca; border-radius: 12px;
}
.elv-bulk-bar__info { font-size: var(--fs-base); font-weight: 700; color: #ff3131; }
.elv-bulk-bar__actions { display: flex; align-items: center; gap: 8px; }
.elv-bulk-bar__clear {
  background: none; border: none; color: #6b7280;
  font-size: var(--fs-sm); font-weight: 600; cursor: pointer;
  padding: 6px 10px; border-radius: 8px; transition: background .15s, color .15s;
}
.elv-bulk-bar__clear:hover { background: rgba(0,0,0,.05); color: #374151; }
.elv-bulk-bar__del {
  display: inline-flex; align-items: center; gap: 6px;
  background: #ff3131; color: #fff; border: none; border-radius: 100px;
  padding: 7px 16px; font-size: var(--fs-sm); font-weight: 700; cursor: pointer;
  transition: box-shadow .18s, transform .18s;
}
.elv-bulk-bar__del:hover { box-shadow: 0 4px 14px rgba(255,49,49,.35); transform: translateY(-1px); }
.elv--dark .elv-bulk-bar { background: rgba(255,49,49,.1); border-color: rgba(255,49,49,.3); }
.elv--dark .elv-bulk-bar__clear { color: #94a3b8; }
.elv--dark .elv-bulk-bar__clear:hover { background: rgba(255,255,255,.06); color: #e2e8f0; }

/* ── Dialog stylé de suppression multiple (confirmation → progression) ── */
.elv-bd { background: #fff; border-radius: 16px; overflow: hidden; }
.elv-bd__header { display: flex; align-items: center; gap: 12px; padding: 16px 18px; background: #ff3131; }
.elv-bd__icon { width: 38px; height: 38px; border-radius: 11px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.elv-bd__title { flex: 1; min-width: 0; color: #fff; font-size: var(--fs-md); font-weight: 700; }
.elv-bd__close { width: 30px; height: 30px; border: none; border-radius: 8px; background: rgba(255,255,255,.18); color: rgba(255,255,255,.9); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background .18s; flex-shrink: 0; }
.elv-bd__close:hover { background: rgba(255,255,255,.3); }
.elv-bd__body { padding: 20px 18px; display: flex; flex-direction: column; gap: 14px; }
.elv-bd__error { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 10px; font-size: var(--fs-base); }
.elv-bd__text { font-size: var(--fs-md); color: #374151; line-height: 1.6; margin: 0; }
.elv-bd__progress { height: 10px; background: #f1f5f9; border-radius: 100px; overflow: hidden; }
.elv-bd__progress-bar { height: 100%; background: #ff3131; border-radius: 100px; transition: width .2s ease; }
.elv-bd__progress-label { font-size: var(--fs-sm); color: #6b7280; text-align: center; font-weight: 600; }
.elv-bd__footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 18px; border-top: 1px solid #f0f0f0; background: #fafafa; }
.elv-bd__btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: 100px; font-size: var(--fs-base); font-weight: 600; cursor: pointer; border: none; transition: all .2s; }
.elv-bd__btn:disabled { opacity: .6; cursor: default; }
.elv-bd__btn--cancel { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.elv-bd__btn--cancel:hover:not(:disabled) { background: #f3f4f6; color: #374151; }
.elv-bd__btn--danger { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255,49,49,.3); }
.elv-bd__btn--danger:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(255,49,49,.4); transform: translateY(-1px); }
/* Dark */
.elv-bd--dark { background: #1f2937; }
.elv-bd--dark .elv-bd__body { background: #1f2937; }
.elv-bd--dark .elv-bd__text { color: #d1d5db; }
.elv-bd--dark .elv-bd__error { background: rgba(255,49,49,.12); border-color: rgba(255,49,49,.3); color: #fca5a5; }
.elv-bd--dark .elv-bd__progress { background: rgba(255,255,255,.08); }
.elv-bd--dark .elv-bd__progress-label { color: #94a3b8; }
.elv-bd--dark .elv-bd__footer { background: #111827; border-top-color: rgba(255,255,255,.08); }
.elv-bd--dark .elv-bd__btn--cancel { background: transparent; border-color: rgba(255,255,255,.14); color: #cbd5e1; }
.elv-bd--dark .elv-bd__btn--cancel:hover:not(:disabled) { background: #374151; color: #fff; }
</style>
