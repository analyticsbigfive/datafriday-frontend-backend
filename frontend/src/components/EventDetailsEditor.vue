<template>
  <div v-if="!event || !editedEvent" class="ede-empty">
    <h1 class="ede-empty-title">{{ t('edeSelectEvent') }}</h1>
  </div>

  <template v-else>
    <!-- Bandeau évènement ROUGE (même style que la barre Space Menus) :
         résumé compact ; le formulaire complet vit dans le drawer (Voir détail). -->
    <section class="ede-summary">
      <!-- Emplacement optionnel en tête du bandeau (ex : toggle panneau gauche). -->
      <slot name="lead" />
      <div class="ede-summary-main">
        <div class="ede-summary-title-row">
          <h2 class="ede-summary-title">{{ editedEvent.eventName || t('edeUnnamedEvent') }}</h2>
          <span v-if="hasChanges" class="ede-dirty-pill">{{ t('edeNotSaved') }}</span>
        </div>
        <div class="ede-summary-pills">
          <span v-if="showAttendance" class="ede-summary-pill">
            <Users class="w-3.5 h-3.5" />
            {{ editedEvent.ticketsScanned == null ? "—" : Number(editedEvent.ticketsScanned).toLocaleString("fr-FR") }}
            {{ t('edeScanned') }}
          </span>
          <span class="ede-summary-pill">
            <Tags class="w-3.5 h-3.5" />
            {{ configurationName || t('edeConfigUndefined') }}
          </span>
        </div>
      </div>
      <div class="ede-summary-actions">
        <p class="ede-summary-datetime">{{ summaryDateTime }}</p>
        <div class="ede-summary-action-row">
          <slot name="actions" />
          <button
            type="button"
            class="ede-summary-edit"
            :aria-label="t('edeViewDetail')"
            :title="t('edeViewDetail')"
            @click="openDrawer"
          >
            <Pencil :size="16" />
          </button>
        </div>
      </div>
    </section>

    <EventDrawerShell
      :model-value="drawerOpen"
      :title="t('edeDrawerTitle')"
      :subtitle="editedEvent.eventName || t('edeDrawerSubtitle')"
      @update:model-value="handleDrawerModel"
    >
      <template #icon>
          <CalendarDays :size="20" color="white" />
      </template>
<!-- details de l'eventn -->
      <div class="ede-drawer-body">
        <div class="ede-section-label">
          <Settings2 :size="12" />
          <span>{{ t('edeGeneralInfo') }}</span>
        </div>

        <v-text-field
          :model-value="editedEvent.eventName || ''"
          :label="t('edeEventName')"
          :placeholder="t('edeEventName')"
          variant="outlined"
          density="comfortable"
          hide-details
          class="ede-input ede-field-space"
          @update:model-value="(v) => handleFieldChange('eventName', v)"
        />

        <div class="ede-select-wrap ede-field-space">
          <label class="ede-select-label">{{ t('edeConfiguration') }}</label>
          <v-select
            :menu-props="{ zIndex: 2300 }"
            :model-value="configModel"
            :items="configOptions"
            item-title="name"
            item-value="id"
            density="comfortable"
            hide-details
            variant="outlined"
            :placeholder="t('edeSelectConfig')"
            class="ede-select"
            @update:model-value="onConfigurationChange"
          />
        </div>

        <div class="ede-section-label">
          <Tags :size="12" />
          <span>{{ t('edeTaxonomy') }}</span>
        </div>

        <div class="ede-select-wrap ede-field-space">
          <label class="ede-select-label">{{ t('edeEventType') }}</label>
          <v-select
            :menu-props="{ zIndex: 2300 }"
            :model-value="editedEvent.eventTypeId"
            :items="eventTypes"
            item-title="name"
            item-value="id"
            density="comfortable"
            hide-details
            variant="outlined"
            :placeholder="t('edeSelectType')"
            class="ede-select"
            @update:model-value="onEventTypeChange"
          />
        </div>

        <div class="ede-select-wrap ede-field-space">
          <label class="ede-select-label">{{ t('edeCategory') }}</label>
          <v-select
            :menu-props="{ zIndex: 2300 }"
            :model-value="editedEvent.eventCategoryId"
            :items="filteredCategories"
            item-title="name"
            item-value="id"
            density="comfortable"
            hide-details
            variant="outlined"
            :placeholder="t('edeSelectCategory')"
            class="ede-select"
            @update:model-value="onCategoryChange"
          />
        </div>

        <div class="ede-select-wrap ede-field-space">
          <label class="ede-select-label">{{ t('edeSubcategory') }}</label>
          <v-select
            :menu-props="{ zIndex: 2300 }"
            :model-value="editedEvent.eventSubcategoryId || 'none'"
            :items="subcategoryOptions"
            item-title="name"
            item-value="id"
            density="comfortable"
            hide-details
            variant="outlined"
            :placeholder="t('edeSelectSubcategory')"
            class="ede-select"
            @update:model-value="onSubcategoryChange"
          />
        </div>

        <div class="ede-section-label">
          <Users :size="12" />
          <span>{{ t('edeTeams') }}</span>
        </div>

        <div class="ede-select-wrap ede-field-space">
          <label class="ede-select-label">{{ t('edeHomeTeam') }}</label>
          <v-autocomplete
            :menu-props="{ zIndex: 2300 }"
            :model-value="homeTeamModel"
            :items="teamOptions"
            item-title="name"
            item-value="id"
            density="comfortable"
            hide-details
            variant="outlined"
            :placeholder="t('edeSearchTeam')"
            auto-select-first
            :custom-filter="teamFilter"
            class="ede-select"
            @update:model-value="onHomeTeamChange"
          >
            <template #item="{ props, item }">
              <v-list-item
                v-bind="props"
                :class="item.raw.id === '__create__' ? 'ede-create-option' : ''"
                @click="item.raw.id === '__create__' ? openCreateTeamDialog('home') : null"
              >
                <template #prepend v-if="item.raw.id === '__create__'">
                  <Plus :size="16" class="mr-2" />
                </template>
              </v-list-item>
            </template>
          </v-autocomplete>
        </div>

        <div class="ede-select-wrap ede-field-space">
          <label class="ede-select-label">{{ t('edeVisitingTeam') }}</label>
          <v-autocomplete
            :menu-props="{ zIndex: 2300 }"
            :model-value="editedEvent.visitingTeamId || 'none'"
            :items="teamOptions"
            item-title="name"
            item-value="id"
            density="comfortable"
            hide-details
            variant="outlined"
            :placeholder="t('edeSearchTeam')"
            auto-select-first
            :custom-filter="teamFilter"
            class="ede-select"
            @update:model-value="onVisitingTeamChange"
          >
            <template #item="{ props, item }">
              <v-list-item
                v-bind="props"
                :class="item.raw.id === '__create__' ? 'ede-create-option' : ''"
                @click="item.raw.id === '__create__' ? openCreateTeamDialog('visiting') : null"
              >
                <template #prepend v-if="item.raw.id === '__create__'">
                  <Plus :size="16" class="mr-2" />
                </template>
              </v-list-item>
            </template>
          </v-autocomplete>
        </div>

        <div class="ede-section-label">
          <CalendarDays :size="12" />
          <span>{{ t('edeDatesTimes') }}</span>
        </div>

        <div class="ede-row ede-field-space">
          <v-text-field
            type="date"
            :label="t('edeStartDate')"
            :model-value="convertToInputFormat(editedEvent.eventDate)"
            density="comfortable"
            hide-details
            variant="outlined"
            class="ede-input"
            @update:model-value="(v) => handleFieldChange('eventDate', v)"
          />
          <v-text-field
            type="date"
            :label="t('edeEndDate')"
            :model-value="convertToInputFormat(editedEvent.eventEndDate) || ''"
            density="comfortable"
            hide-details
            variant="outlined"
            class="ede-input"
            @update:model-value="(v) => handleFieldChange('eventEndDate', v)"
          />
        </div>

        <v-text-field
          type="time"
          :label="t('edeEndTime')"
          :model-value="editedEvent.eventEndTime || ''"
          density="comfortable"
          hide-details
          variant="outlined"
          class="ede-input ede-field-space"
          @update:model-value="(v) => handleFieldChange('eventEndTime', v)"
        />

        <template v-if="showSessions">
          <div class="ede-section-label ede-section-label--action">
            <span class="ede-section-label__title">
              <Clock3 :size="12" />
              <span>{{ t('edeSessions') }}</span>
            </span>
            <button type="button" class="ede-add-session" @click="handleAddSession">
              <Plus :size="13" />
              {{ t('edeAdd') }}
            </button>
          </div>

          <div
            v-for="(session, index) in editedEvent.sessions || []"
            :key="index"
            class="ede-session-card"
          >
            <div class="ede-session-card__head">
              <div class="ede-session-card__title">
                <span class="ede-session-card__num">{{ index + 1 }}</span>
                {{ t('edeSession') }} {{ index + 1 }}
              </div>
              <button
                v-if="(editedEvent.sessions || []).length > 1"
                type="button"
                class="ede-session-card__remove"
                :aria-label="t('edeRemoveSession')"
                @click="handleRemoveSession(index)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
            <div class="ede-row">
              <div>
                <div class="ede-session-label">{{ t('edeDoorsOpening') }}</div>
                <v-text-field
                  type="time"
                  :model-value="session.doorsOpening || ''"
                  density="comfortable"
                  hide-details
                  variant="outlined"
                  class="ede-input"
                  @update:model-value="(v) => handleSessionChange(index, 'doorsOpening', v)"
                />
              </div>
              <div>
                <div class="ede-session-label">{{ t('edeShowStart') }}</div>
                <v-text-field
                  type="time"
                  :model-value="session.showTime || ''"
                  density="comfortable"
                  hide-details
                  variant="outlined"
                  class="ede-input"
                  @update:model-value="(v) => handleSessionChange(index, 'showTime', v)"
                />
              </div>
            </div>
          </div>
        </template>

        <template v-if="showAttendance">
          <div class="ede-section-label">
            <Users :size="12" />
            <span>{{ t('edeTicketing') }}</span>
          </div>

          <div class="ede-row ede-field-space">
            <v-text-field
              type="number"
              :label="t('edeTicketsSold')"
              :model-value="editedEvent.ticketsSold || ''"
              density="comfortable"
              hide-details
              variant="outlined"
              placeholder="0"
              class="ede-input"
              @update:model-value="(v) => handleFieldChange('ticketsSold', toInt(v))"
            />
            <v-text-field
              type="number"
              :label="t('edeTicketsScanned')"
              :model-value="editedEvent.ticketsScanned || ''"
              density="comfortable"
              hide-details
              variant="outlined"
              placeholder="0"
              :error="ticketsInvalid"
              class="ede-input"
              @update:model-value="(v) => handleFieldChange('ticketsScanned', toInt(v))"
            />
          </div>
          <p v-if="ticketsInvalid" class="ede-field-error">
            {{ t('edeTicketsErrorA') }}{{ editedEvent.ticketsScanned }}{{ t('edeTicketsErrorB') }}{{ editedEvent.ticketsSold }}{{ t('edeTicketsErrorC') }}
          </p>
        </template>
      </div>

      <template #footer>
          <button type="button" class="ede-footer-btn ede-footer-btn--cancel" @click="cancelDrawer">
            {{ t('edeCancel') }}
          </button>
          <button
            type="button"
            class="ede-footer-btn ede-footer-btn--primary"
            :disabled="!hasChanges || isSaving || nameMissing || ticketsInvalid"
            @click="handleSave"
          >
            <Save :size="14" />
            {{ isSaving ? t('edeSaving') : t('edeSave') }}
          </button>
      </template>
    </EventDrawerShell>

    <!-- Création d'équipe inline (même flux que /events — EventFormDrawer).
         z-index 2400 : au-dessus du drawer (2200) et des menus (2300). -->
    <v-dialog v-model="teamDialogOpen" max-width="420" :z-index="2400">
      <div class="ede-team-dialog">
        <h3 class="ede-team-dialog-title">{{ t('edeCreateTeamTitle') }}</h3>
        <v-text-field
          v-model="newTeamName"
          :label="t('edeTeamName')"
          placeholder="Ex. Olympique Lyonnais"
          variant="outlined"
          density="comfortable"
          hide-details
          autofocus
          @keyup.enter="handleCreateTeam"
        />
        <p v-if="teamCreateError" class="ede-team-dialog-error">{{ teamCreateError }}</p>
        <div class="ede-team-dialog-actions">
          <v-btn variant="text" @click="teamDialogOpen = false">{{ t('edeCancel') }}</v-btn>
          <v-btn
            color="primary"
            :loading="isCreatingTeam"
            :disabled="!newTeamName.trim()"
            @click="handleCreateTeam"
          >{{ t('edeCreate') }}</v-btn>
        </div>
      </div>
    </v-dialog>
  </template>
</template>

<script>
/**
 * EventDetailsEditor.vue — port 1:1 du composant React
 * `EventDetailsEditor.tsx` (versionReact).
 *
 * Affiche un panneau éditable pour les métadonnées d'un event :
 *  - Titre + bouton Save
 *  - Sous-titre cliquable (collapse / expand) avec date longue + showTime +
 *    affluence + select Configuration
 *  - Section dépliée : Type / Catégorie / Sous-catégorie / Équipes (Sport)
 *    + 3 cards Dates / Times (sessions) / Attendance
 *
 * Sauvegarde via `eventApi.updateEvent`. Émet `event-update` avec le nouvel
 * event après save réussi.
 */
import {
  CalendarDays,
  Clock3,
  Save,
  Plus,
  Pencil,
  Trash2,
  Settings2,
  Tags,
  Users,
} from "lucide-vue-next";
import EventDrawerShell from "@/components/events/drawers/EventDrawerShell.vue";
import { createTeam as restCreateTeam } from "@/api/endpoints/team.api";
import { useI18n } from "@/i18n/useI18n";

// DD/MM/YYYY ou YYYY-MM-DD → YYYY-MM-DD (pour <input type="date">).
function convertToInputFormat(dateString) {
  if (!dateString) return "";
  const m = dateString.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // ISO-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) return dateString.slice(0, 10);
  return "";
}

function parseEventDate(dateString) {
  if (!dateString) return null;
  const value = String(dateString);
  const ddmm = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmm) return new Date(Number(ddmm[3]), Number(ddmm[2]) - 1, Number(ddmm[1]));
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function capitalizeDatePart(value, locale) {
  if (!value) return "";
  return value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
}

function normalizeTimeLabel(time) {
  if (!time) return "";
  const match = String(time).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function formatSummaryDateTime(dateString, time, locale, atLabel) {
  if (!dateString) return "N/A";
  const d = parseEventDate(dateString);
  if (!d) return dateString;
  const isFr = locale === "fr";
  const intlLocale = isFr ? "fr-FR" : "en-US";
  const weekday = capitalizeDatePart(
    new Intl.DateTimeFormat(intlLocale, { weekday: "long" }).format(d),
    intlLocale,
  );
  const month = capitalizeDatePart(
    new Intl.DateTimeFormat(intlLocale, { month: "long" }).format(d),
    intlLocale,
  );
  const dateLabel = isFr
    ? `${weekday}, ${d.getDate()} ${month} ${d.getFullYear()}`
    : `${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`;
  const timeLabel = normalizeTimeLabel(time);
  return timeLabel ? `${dateLabel} ${atLabel} ${timeLabel}` : dateLabel;
}

// DD/MM/YYYY ou ISO → "12/05/2026".
function formatLongDate(dateString) {
  if (!dateString) return "N/A";
  let d = null;
  const ddmm = dateString.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmm) {
    d = new Date(Number(ddmm[3]), Number(ddmm[2]) - 1, Number(ddmm[1]));
  } else if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
    d = new Date(dateString);
  }
  if (!d || isNaN(d.getTime())) return dateString;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export default {
  name: "EventDetailsEditor",
  components: {
    EventDrawerShell,
    CalendarDays,
    Clock3,
    Save,
    Plus,
    Pencil,
    Trash2,
    Settings2,
    Tags,
    Users,
  },
  props: {
    event: { type: Object, default: null },
    configurations: { type: Array, default: () => [] },
    eventTypes: { type: Array, default: () => [] },
    eventCategories: { type: Array, default: () => [] },
    eventSubcategories: { type: Array, default: () => [] },
    teams: { type: Array, default: () => [] },
    /** Si true, le Save ne fait PAS d'appel API (juste émission locale). */
    fromMock: { type: Boolean, default: false },
    /** Affiche la section Attendance (tickets). Masquée si le space n'a aucun
        event avec billetterie renseignée. */
    showAttendance: { type: Boolean, default: true },
    /** Affiche la section Times (sessions / show time) + le pill show time.
        Masquée si aucun event du space n'a d'horaire renseigné. */
    showSessions: { type: Boolean, default: true },
  },
  emits: ["event-update", "event-create", "team-created"],
  setup() {
    const { locale, t } = useI18n();
    return { locale, t };
  },
  data() {
    return {
      editedEvent: null,
      isSaving: false,
      hasChanges: false,
      drawerOpen: false,
      drawerSnapshot: null,
      // Création d'équipe inline (parité /events). localTeams = équipes créées
      // ici, en attendant que le parent rafraîchisse son catalogue `teams`.
      teamDialogOpen: false,
      teamDialogTarget: "visiting",
      newTeamName: "",
      isCreatingTeam: false,
      teamCreateError: "",
      localTeams: [],
    };
  },
  computed: {
    /** Nom de la configuration de l'event (pill du bandeau). */
    configurationName() {
      const cid = this.editedEvent?.configurationId;
      if (!cid) return "";
      const c = (this.configurations || []).find((x) => x.id === cid);
      return c?.name || "";
    },
    filteredCategories() {
      const tid = this.editedEvent?.eventTypeId;
      return (this.eventCategories || []).filter((c) => c.eventTypeId === tid);
    },
    filteredSubcategories() {
      const cid = this.editedEvent?.eventCategoryId;
      return (this.eventSubcategories || []).filter(
        (s) => s.eventCategoryId === cid,
      );
    },
    subcategoryOptions() {
      return [{ id: "none", name: this.t("edeNone") }, ...this.filteredSubcategories];
    },
    allTeams() {
      // Catalogue parent + équipes créées inline (dédupliquées par id).
      const ids = new Set((this.teams || []).map((t) => t.id));
      return [...(this.teams || []), ...this.localTeams.filter((t) => !ids.has(t.id))];
    },
    teamOptions() {
      return [
        { id: "none", name: this.t("edeNone") },
        { id: "__create__", name: this.t("edeCreateTeam") },
        ...this.allTeams,
      ];
    },
    teamNameOptions() {
      // Noms d'équipes pour l'autosuggestion du champ Home Team (texte libre).
      return this.allTeams.map((t) => t.name).filter(Boolean);
    },
    homeTeamModel() {
      // Valeur affichée du select Home : homeTeamId si présent, sinon reverse-lookup
      // depuis homeTeamName (persisté), sinon 'none'. Reflète l'équipe sauvée même
      // tant que le FK homeTeamId n'est pas encore envoyé au backend.
      if (this.editedEvent?.homeTeamId) return this.editedEvent.homeTeamId;
      const nm = this.editedEvent?.homeTeamName;
      if (nm) {
        const t = this.allTeams.find((x) => x.name === nm);
        if (t) return t.id;
      }
      return 'none';
    },
    configOptions() {
      return this.configurations || [];
    },
    /**
     * Valeur affichée du select Configuration. On ne remonte l'id de l'event que
     * s'il correspond à une config VALIDE de la liste (déjà filtrée des configs
     * supprimées par le store). Un `configurationId` périmé (config hard-delete
     * côté backend, encore porté par l'event) → `null` → le placeholder
     * « Select configuration » s'affiche au lieu de l'id brut.
     */
    configModel() {
      const id = this.editedEvent?.configurationId;
      return id && this.configOptions.some((c) => c?.id === id) ? id : null;
    },
    eventTypeName() {
      const t = (this.eventTypes || []).find(
        (x) => x.id === this.editedEvent?.eventTypeId,
      );
      return t?.name || "";
    },
    isSportType() {
      return this.eventTypeName.toLowerCase() === "sport";
    },
    firstShowTime() {
      const s = this.editedEvent?.sessions || [];
      return s.length > 0 ? s[0].showTime || "—" : "—";
    },
    summaryTime() {
      if (this.showSessions) {
        const s = this.editedEvent?.sessions || [];
        const showTime = s.length > 0 ? s[0].showTime : "";
        if (showTime) return showTime;
      }
      return this.editedEvent?.eventEndTime || "";
    },
    summaryDateTime() {
      return formatSummaryDateTime(
        this.editedEvent?.eventDate,
        this.summaryTime,
        this.locale,
        this.t("edeDateTimeAt"),
      );
    },
    /** True si l'event n'a pas de nom → on force la saisie avant Save. */
    nameMissing() {
      return !(
        this.editedEvent &&
        this.editedEvent.eventName &&
        String(this.editedEvent.eventName).trim()
      );
    },
    /** True si billets scannés > vendus (impossible : taux transfo ≤ 100%).
     *  Ne compare que si les deux valeurs sont des nombres > 0. */
    ticketsInvalid() {
      const sold = Number(this.editedEvent?.ticketsSold);
      const scanned = Number(this.editedEvent?.ticketsScanned);
      if (!Number.isFinite(sold) || !Number.isFinite(scanned)) return false;
      if (sold <= 0 || scanned <= 0) return false;
      return scanned > sold;
    },
  },
  watch: {
    event: {
      immediate: true,
      handler(ev) {
        // Édition en cours : si le parent renvoie le MÊME event (id identique) —
        // typiquement parce que notre aperçu live a mis à jour la liste in-memory
        // du parent — on NE réécrase PAS le draft, sinon l'input perd le focus /
        // le curseur saute et `hasChanges` se réinitialise pendant la saisie.
        // Clé logique = id (event réel) OU _basedOnEventId (draft de prédiction
        // cloné, sans id). Le live preview fait muter l'event source côté parent
        // → ce prop change ; sans cette garde le draft serait réécrasé à chaque
        // frappe (perte de focus / curseur).
        const evKey = ev && (ev.id || ev._basedOnEventId);
        const curKey =
          this.editedEvent &&
          (this.editedEvent.id || this.editedEvent._basedOnEventId);
        const sameEvent = !!(ev && this.editedEvent && evKey && evKey === curKey);
        if (sameEvent) return;
        if (ev) {
          // Deep-copy pour ne pas muter le prop.
          this.editedEvent = JSON.parse(JSON.stringify(ev));
          if (!Array.isArray(this.editedEvent.sessions)) {
            this.editedEvent.sessions = [];
          }
        } else {
          this.editedEvent = null;
        }
        this.hasChanges = false;
        this.drawerOpen = false;
        this.drawerSnapshot = null;
      },
    },
  },
  beforeUnmount() {
    if (this._liveTimer) clearTimeout(this._liveTimer);
  },
  methods: {
    convertToInputFormat,
    formatLongDate,
    toInt(v) {
      const n = parseInt(v, 10);
      return isNaN(n) ? 0 : n;
    },
    openDrawer() {
      if (!this.editedEvent) return;
      this.drawerSnapshot = JSON.parse(JSON.stringify(this.editedEvent));
      this.drawerOpen = true;
    },
    handleDrawerModel(value) {
      if (value) {
        if (!this.drawerOpen) this.openDrawer();
        return;
      }
      if (this.drawerOpen) this.cancelDrawer();
    },
    cancelDrawer() {
      // Fermeture sans Save : les édits étant DRAFT-LOCAL (aucune propagation au
      // parent pendant la saisie), il suffit de restaurer le draft depuis le
      // snapshot. Rien à ré-émettre côté parent (il n'a jamais reçu les modifs).
      if (this.hasChanges && this.drawerSnapshot) {
        this.editedEvent = JSON.parse(JSON.stringify(this.drawerSnapshot));
        this.hasChanges = false;
      }
      this.drawerOpen = false;
      this.drawerSnapshot = null;
    },
    handleFieldChange(field, value) {
      if (!this.editedEvent) return;
      // Édition DRAFT-LOCAL : on ne propage RIEN au parent pendant la saisie.
      // Toutes les modifs des détails de l'event (champs + dropdowns) sont
      // appliquées et recalculées UNIQUEMENT au clic « Save » (handleSave →
      // event-update). Évite le flash de recompute (« reload » perçu) à chaque
      // sélection/frappe.
      this.editedEvent = { ...this.editedEvent, [field]: value };
      this.hasChanges = true;
    },
    /**
     * Changement de configuration = changement STRUCTURANT (layout + scope
     * shops + hard filter du scoring). DRAFT-LOCAL : on met juste à jour le
     * draft ; le re-scope + recompute + PATCH ne se font qu'au « Save »
     * (handleSave → event-update, pickEventOverride inclut configurationId).
     * Plus de configuration-change ni event-live en pleine saisie (évite le
     * flash de recompute perçu comme un reload).
     */
    onConfigurationChange(v) {
      if (!this.editedEvent) return;
      this.editedEvent = { ...this.editedEvent, configurationId: v };
      this.hasChanges = true;
    },
    onEventTypeChange(v) {
      if (!this.editedEvent) return;
      // Reset cat + subcat (mirror React :265-268)
      this.editedEvent = {
        ...this.editedEvent,
        eventTypeId: v,
        eventCategoryId: "",
        eventSubcategoryId: undefined,
      };
      this.hasChanges = true;
    },
    onCategoryChange(v) {
      if (!this.editedEvent) return;
      this.editedEvent = {
        ...this.editedEvent,
        eventCategoryId: v,
        eventSubcategoryId: undefined,
      };
      this.hasChanges = true;
    },
    onSubcategoryChange(v) {
      this.handleFieldChange("eventSubcategoryId", v === "none" ? undefined : v);
    },
    onVisitingTeamChange(v) {
      // « Créer une nouvelle équipe » → dialog (cible visiting), pas d'assignation.
      if (v === "__create__") {
        this.openCreateTeamDialog("visiting");
        return;
      }
      this.handleFieldChange("visitingTeamId", v === "none" ? undefined : v);
    },
    onHomeTeamChange(v) {
      // « Créer » → dialog cible home ; sinon dénormalise le nom dans homeTeamName
      // (compat/affichage/fallback). Catalogue partagé home/visiting.
      if (v === "__create__") {
        this.openCreateTeamDialog("home");
        return;
      }
      const id = v === "none" ? undefined : v;
      this.handleFieldChange("homeTeamId", id);
      const t = this.allTeams.find((x) => x.id === id);
      this.handleFieldChange("homeTeamName", t ? t.name : "");
    },
    teamFilter(value, query, item) {
      // Garde « + Créer une nouvelle équipe » TOUJOURS visible, même en recherchant
      // un nom absent du catalogue (sinon impossible de créer depuis la recherche).
      if (item?.raw?.id === "__create__") return true;
      return String(value || "").toLowerCase().includes(String(query || "").toLowerCase());
    },
    openCreateTeamDialog(target = "visiting") {
      this.teamDialogTarget = target;
      this.teamCreateError = "";
      this.teamDialogOpen = true;
    },
    async handleCreateTeam() {
      const name = (this.newTeamName || "").trim();
      if (!name || this.isCreatingTeam) return;
      // Shape backend validée sur /events (DTO forbidNonWhitelisted) :
      // eventCategoryId / eventSubcategoryId, jamais sportCategoryId/subcategory.
      const payload = {
        name,
        eventCategoryId: this.editedEvent?.eventCategoryId,
        ...(this.editedEvent?.eventSubcategoryId
          ? { eventSubcategoryId: this.editedEvent.eventSubcategoryId }
          : {}),
      };
      this.isCreatingTeam = true;
      try {
        const created = await restCreateTeam(payload);
        const team = created && created.id ? created : { id: `team-${Date.now()}`, ...payload };
        this.localTeams = [...this.localTeams, team];
        // Assigne selon la cible du dialog (home vs visiting).
        if (this.teamDialogTarget === "home") {
          this.handleFieldChange("homeTeamId", team.id);
          this.handleFieldChange("homeTeamName", team.name);
        } else {
          this.handleFieldChange("visitingTeamId", team.id);
        }
        this.$emit("team-created", team);
        this.newTeamName = "";
        this.teamDialogOpen = false;
      } catch (e) {
        this.teamCreateError =
          e?.response?.data?.message || e?.message || this.t("edeCreateTeamError");
      } finally {
        this.isCreatingTeam = false;
      }
    },
    handleSessionChange(index, field, value) {
      if (!this.editedEvent) return;
      const sessions = [...(this.editedEvent.sessions || [])];
      sessions[index] = { ...sessions[index], [field]: value };
      this.editedEvent = { ...this.editedEvent, sessions };
      this.hasChanges = true;
    },
    handleAddSession() {
      if (!this.editedEvent) return;
      const sessions = [...(this.editedEvent.sessions || [])];
      sessions.push({ doorsOpening: "", showTime: "" });
      this.editedEvent = {
        ...this.editedEvent,
        numberOfSessions: (this.editedEvent.numberOfSessions || sessions.length - 1) + 1,
        sessions,
      };
      this.hasChanges = true;
    },
    handleRemoveSession(index) {
      if (!this.editedEvent) return;
      const sessions = [...(this.editedEvent.sessions || [])];
      if (sessions.length <= 1) return;
      sessions.splice(index, 1);
      this.editedEvent = {
        ...this.editedEvent,
        numberOfSessions: Math.max(1, (this.editedEvent.numberOfSessions || sessions.length + 1) - 1),
        sessions,
      };
      this.hasChanges = true;
    },
    async handleSave() {
      if (!this.editedEvent || !this.hasChanges) return;
      // Contrôle billets : scannés ne peuvent pas dépasser vendus.
      if (this.ticketsInvalid) return;
      this.isSaving = true;
      try {
        // Mode mock : pas d'appel API, juste émission locale (l'event sera
        // mis à jour dans le store / liste in-memory du parent).
        if (this.fromMock) {
          this.hasChanges = false;
          this.$emit("event-update", { ...this.editedEvent });
        } else if (!this.editedEvent.id) {
          // Draft de prédiction (pas d'`id` → pas encore un event en base) :
          // on délègue au parent qui crée l'event futur via POST /events (REST).
          this.hasChanges = false;
          this.$emit("event-create", { ...this.editedEvent });
        } else {
          // Event existant : la PERSISTANCE est déléguée au parent
          // (EventPredictView.handleEventUpdate → PATCH /events/{id} avec payload
          // curé + reload). On émet juste l'évènement édité (l'ancien PUT
          // objet-entier échouait silencieusement → "rien modifié" en base).
          this.hasChanges = false;
          this.$emit("event-update", { ...this.editedEvent });
        }
        this.drawerSnapshot = null;
        this.drawerOpen = false;
      } finally {
        this.isSaving = false;
      }
    },
  },
};
</script>

<style scoped>
.ede-empty {
  background: var(--muted, #f9fafb);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 24px;
}
.ede-empty-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}
.ede-summary-pills {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}
.ede-summary-pill,
.ede-dirty-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 4px 9px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
}
.ede-dirty-pill {
  flex-shrink: 0;
  border-color: rgba(255, 237, 213, 0.8);
  background: #fff7ed;
  color: #c2410c;
}
/* EventPredict summary — bandeau ROUGE, même dégradé que la barre Space Menus
   (.smv-header : linear-gradient #ff3131 → #ff3131). */
.ede-summary {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 18px;
  padding: 16px 18px;
  border: none;
  border-radius: var(--fb-radius-card, 16px);
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.3);
}

/* Contrat visuel Space Menus / Events. */
.ede-summary {
  padding: 18px 28px;
  border-radius: 16px;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.3);
}

.ede-summary-title {
  font-size: 20px;
  font-weight: 800;
}

.ede-summary-pills {
  gap: 7px;
}

.ede-summary-pill,
.ede-dirty-pill {
  min-height: 28px;
  padding: 5px 11px;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  font-weight: 600;
}

.ede-dirty-pill {
  border-color: rgba(255, 255, 255, 0.68);
  background: #fff;
  color: #ff3131;
}

.ede-summary-edit {
  min-height: 34px;
  height: 34px;
  width: 34px;
  padding: 0;
  border: 1.5px solid rgba(255, 255, 255, 0.62);
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 12.5px;
  font-weight: 650;
}

.ede-summary-edit:hover {
  border-color: #fff;
  background: #fff;
  color: #ff3131;
  transform: translateY(-1px);
}
.ede-summary-main {
  min-width: 0;
}
.ede-summary-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.ede-summary-title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #fff;
  font-size: 1.125rem;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ede-summary-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
  justify-content: flex-end;
  margin-left: auto;
}
.ede-summary-datetime {
  margin: 0;
  max-width: 300px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.25;
  text-align: right;
}
.ede-summary-action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.ede-summary-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  height: 34px;
  width: 34px;
  padding: 0;
  border: 1.5px solid rgba(255, 255, 255, 0.62);
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1;
  white-space: nowrap;
  box-shadow: none;
  transition: border-color 0.2s, background-color 0.2s, color 0.2s, transform 0.15s;
}
.ede-summary-edit:hover {
  border-color: #fff;
  background: #fff;
  color: #ff3131;
  transform: translateY(-1px);
}
.ede-summary-edit:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
.ede-summary-edit:active {
  transform: translateY(1px);
}

/* Drawer shell copied from Events/EventFormDrawer. */
.ede-drawer {
  /* Component lives inside EventPredict's centre column. Teleport + fixed
     viewport coordinates prevent Vuetify from inheriting that column bounds. */
  position: fixed !important;
  inset: 0 0 0 auto !important;
  width: min(560px, 100vw) !important;
  height: 100dvh !important;
  max-height: 100dvh !important;
  z-index: 1200 !important;
}
.ede-drawer:not(.v-navigation-drawer--active) {
  display: none !important;
}
.ede-drawer :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
}
.ede-drawer-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  flex-shrink: 0;
}
.ede-drawer-header__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.18);
  flex-shrink: 0;
}
.ede-drawer-header__text {
  min-width: 0;
  flex: 1;
}
.ede-drawer-header__title {
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
}
.ede-drawer-header__sub {
  margin-top: 2px;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.75);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ede-drawer-header__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s;
}
.ede-drawer-header__close:hover {
  background: rgba(255, 255, 255, 0.25);
}
.ede-drawer-header__close:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}
.ede-drawer-body {
  padding: 0;
  overflow: visible;
  background: transparent;
}
.ede-section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 20px 0 12px;
  color: var(--fb-faint, #9ca3af);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.ede-section-label:first-child {
  margin-top: 0;
}
.ede-section-label--action {
  justify-content: space-between;
}
.ede-section-label__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ede-field-space {
  margin-bottom: 16px;
}
.ede-select-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ede-select-label {
  color: var(--fb-text, #212121);
  font-size: 12.5px;
  font-weight: 600;
}
.ede-input :deep(.v-field),
.ede-select :deep(.v-field) {
  border: 1.5px solid var(--fb-border, #E5E7EB);
  border-radius: 11px;
  background: var(--fb-surface, #FFFFFF);
  box-shadow: none;
}
.ede-input :deep(.v-field--focused),
.ede-select :deep(.v-field--focused) {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1);
}
.ede-input :deep(.v-field__outline),
.ede-select :deep(.v-field__outline) {
  display: none;
}
.ede-input :deep(.v-label.v-field-label--floating) {
  color: #ff3131;
  font-size: 11px;
}
.ede-select :deep(.v-field__input) {
  font-size: 14px;
}
.ede-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.ede-add-session {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 0;
  border-radius: 7px;
  background: #fee2e2;
  color: #ff3131;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
}
.ede-add-session:hover {
  background: #fecaca;
}
.ede-session-card {
  margin-bottom: 10px;
  padding: 14px 16px;
  border: 1.5px solid var(--fb-border, #E5E7EB);
  border-radius: 14px;
  background: var(--fb-surface, #FFFFFF);
}
.ede-session-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.ede-session-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--fb-text, #212121);
  font-size: 13px;
  font-weight: 600;
}
.ede-session-card__num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ff3131;
  color: #ffffff;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
}
.ede-session-card__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--fb-faint, #9ca3af);
  cursor: pointer;
}
.ede-session-card__remove:hover {
  background: #fef2f2;
  color: #dc2626;
}
.ede-session-label {
  margin-bottom: 6px;
  color: var(--fb-muted, #6B7280);
  font-size: 11.5px;
  font-weight: 600;
}
.ede-field-error {
  margin: -8px 0 16px;
  color: #ff3131;
  font-size: 0.75rem;
  font-weight: 600;
}
.ede-drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 22px;
  border-top: 1px solid var(--fb-border, #E5E7EB);
  background: var(--fb-surface, #FFFFFF);
  flex-shrink: 0;
}
.ede-footer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 42px;
  padding: 0 22px;
  border: 0;
  border-radius: 50px;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 500;
  transition: all 0.2s;
}
.ede-footer-btn--cancel {
  border: 1.5px solid var(--fb-border, #e5e7eb);
  background: var(--fb-border, #f3f4f6);
  color: #374151;
}
.ede-footer-btn--cancel:hover {
  background: #e9ecef;
}
.ede-footer-btn--primary {
  background: #ff3131;
  box-shadow: 0 4px 14px rgba(255, 49, 49, 0.35);
  color: #ffffff;
}
.ede-footer-btn--primary:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(255, 49, 49, 0.45);
  transform: translateY(-1px);
}
.ede-footer-btn:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
.ede-footer-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 640px) {
  .ede-summary {
    align-items: stretch;
    flex-direction: column;
  }
  .ede-summary-actions,
  .ede-summary-datetime {
    align-items: stretch;
    max-width: none;
    text-align: left;
    width: 100%;
  }
  .ede-summary-action-row {
    justify-content: flex-start;
    width: 100%;
  }
  .ede-summary-edit {
    width: 34px;
  }
  .ede-row {
    grid-template-columns: 1fr;
  }
}

/* Priorité finale : boutons/badges identiques aux bandeaux Space Menus. */
.ede-summary {
  padding: 18px 20px;
  border-radius: 16px;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.3);
}

.ede-summary-title {
  color: #fff;
  font-size: 20px;
  font-weight: 800;
}

.ede-summary-pill {
  min-height: 28px;
  padding: 5px 11px;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  font-weight: 600;
}

.ede-dirty-pill {
  border-color: #fff;
  border-radius: 999px;
  background: #fff;
  color: #ff3131;
}

.ede-summary-edit {
  min-height: 34px;
  height: 34px;
  width: 34px;
  padding: 0;
  border: 1.5px solid rgba(255, 255, 255, 0.62);
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 12.5px;
  font-weight: 650;
}

.ede-summary-edit:hover {
  border-color: #fff;
  background: #fff;
  color: #ff3131;
  transform: translateY(-1px);
}

/* Option « + Créer une nouvelle équipe » dans les menus d'équipes. */
:deep(.ede-create-option) {
  color: #ff3131;
  font-weight: 600;
}

/* Dialog de création d'équipe (parité EventFormDrawer). */
.ede-team-dialog {
  padding: 20px;
  border-radius: 12px;
  background: var(--card, #fff);
}

.ede-team-dialog-title {
  margin-bottom: 12px;
  font-weight: 700;
}

.ede-team-dialog-error {
  margin: 10px 0 0;
  color: #ff3131;
  font-size: 12.5px;
}

.ede-team-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

/* ===================== DARK MODE — compléments =====================
   L'éditeur vit dans l'overlay .event-predict-overlay (drawer NON téléporté) :
   surfaces/bordures/textes suivent les `--fb-*` hérités. Le bandeau résumé rouge
   #ff3131 et sa pastille/bouton blancs sont conservés. Ne reste que le bouton
   « ajouter une session » (rouge très pâle) → voile rouge sur fond sombre. */
.dark .ede-add-session {
  background: rgba(220, 38, 38, 0.16);
}
.dark .ede-add-session:hover {
  background: rgba(220, 38, 38, 0.26);
}
</style>
