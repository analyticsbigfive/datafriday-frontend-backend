<template>
  <v-navigation-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    location="right"
    temporary
    width="560"
    class="efd-drawer"
    :class="{ 'efd--dark': isDark }"
  >
    <!-- Gradient header -->
    <div class="efd-grad-header">
      <div class="efd-grad-header__icon">
        <Calendar :size="20" color="white" />
      </div>
      <div class="efd-grad-header__text">
        <div class="efd-grad-header__title">
          {{ mode === 'edit' ? t('eventsList.drawerEditTitle') : t('eventsList.drawerCreateTitle') }}
        </div>
        <div class="efd-grad-header__sub">
          {{ mode === 'edit' ? t('eventsList.drawerEditSubtitle') : t('eventsList.drawerCreateSubtitle') }}
        </div>
      </div>
      <button class="efd-grad-header__close" @click="$emit('update:modelValue', false)">
        <X :size="18" />
      </button>
    </div>

    <!-- Scrollable body -->
    <div class="efd-body">

      <!-- Error -->
      <div v-if="formError" class="efd-error">
        <AlertCircle :size="14" /> {{ formError }}
      </div>

      <!-- ── Section: Informations générales ── -->
      <div class="efd-section-label">
        <Building2 :size="12" />
        <span>Informations générales</span>
      </div>

      <div class="efd-select-wrap mb-4">
        <label class="efd-select-label">{{ t('eventsList.labelName') }} <span class="efd-star">*</span></label>
        <v-text-field
          v-model="newEvent.name"
          :placeholder="t('eventsList.namePlaceholder')"
          variant="outlined"
          density="comfortable"
          hide-details
          class="efd-input"
        />
      </div>

      <div class="efd-select-wrap mb-4">
        <label class="efd-select-label">{{ t('eventsList.labelSpace') }} <span class="efd-star">*</span></label>
        <v-select
          v-model="newEvent.spaceId"
          :items="spaces"
          item-title="name"
          item-value="id"
          :placeholder="t('eventsList.selectSpace')"
          variant="outlined"
          density="comfortable"
          hide-details
          class="efd-select"
        />
      </div>

      <div v-if="newEvent.spaceId" class="efd-select-wrap mb-4">
        <label class="efd-select-label">Configuration <span class="efd-star">*</span></label>
        <v-select
          v-model="newEvent.configurationId"
          :items="configurationsForSpace"
          item-title="name"
          item-value="id"
          placeholder="Sélectionner une configuration"
          variant="outlined"
          density="comfortable"
          hide-details
          clearable
          class="efd-select"
        />
      </div>

      <!-- ── Section: Dates & horaires ── -->
      <div class="efd-section-label">
        <Calendar :size="12" />
        <span>Dates & horaires</span>
      </div>

      <div class="efd-row mb-4">
        <div class="efd-select-wrap">
          <label class="efd-select-label">{{ t('eventsList.labelStartDate') }} <span class="efd-star">*</span></label>
          <v-text-field
            v-model="newEvent.eventStartDate"
            type="date"
            variant="outlined"
            density="comfortable"
            hide-details
            class="efd-input"
          />
        </div>
        <div class="efd-select-wrap">
          <label class="efd-select-label">{{ t('eventsList.labelEndDate') }} <span class="efd-star">*</span></label>
          <v-text-field
            v-model="newEvent.eventEndDate"
            type="date"
            variant="outlined"
            density="comfortable"
            hide-details
            class="efd-input"
          />
        </div>
      </div>

      <div class="efd-row mb-4">
        <div class="efd-select-wrap">
          <label class="efd-select-label">{{ t('eventsList.labelEndTime') }} <span class="efd-star">*</span></label>
          <v-text-field
            v-model="newEvent.eventEndTime"
            type="time"
            variant="outlined"
            density="comfortable"
            hide-details
            placeholder="--:--"
            class="efd-input"
          />
        </div>
        <div class="efd-select-wrap">
          <label class="efd-select-label">Statut</label>
          <v-text-field
            v-model="newEvent.status"
            variant="outlined"
            density="comfortable"
            hide-details
            placeholder="Ex: confirmed…"
            class="efd-input"
          />
        </div>
      </div>

      <!-- ── Section: Taxonomy ── -->
      <div class="efd-section-label">
        <Tag :size="12" />
        <span>Taxonomie</span>
      </div>

      <div class="efd-select-wrap mb-4">
        <label class="efd-select-label">{{ t('eventsList.labelEventType') }} <span class="efd-star">*</span></label>
        <v-select
          v-model="newEvent.eventTypeId"
          :items="eventTypesWithCreate"
          item-title="name"
          item-value="id"
          :placeholder="t('eventsList.selectType')"
          variant="outlined"
          density="comfortable"
          hide-details
          class="efd-select"
          @update:modelValue="handleEventTypeChange"
        >
          <template #item="{ props, item }">
            <v-list-item
              v-bind="props"
              :class="item.raw.id === '__create__' ? 'efd-create-option' : ''"
              :style="item.raw.id === '__create__' ? 'color:#ff3131;font-weight:600;' : ''"
              @click="item.raw.id === '__create__' ? handleCreateTypeClick() : null"
            >
              <template #prepend v-if="item.raw.id === '__create__'">
                <Plus :size="16" class="mr-2" />
              </template>
            </v-list-item>
          </template>
        </v-select>
      </div>

      <div v-if="newEvent.eventTypeId" class="efd-select-wrap mb-4">
        <label class="efd-select-label">{{ t('eventsList.labelCategory') }} <span class="efd-star">*</span></label>
        <v-select
          v-model="newEvent.eventCategoryId"
          :items="categoriesWithCreate"
          item-title="name"
          item-value="id"
          :placeholder="t('eventsList.selectCategory')"
          variant="outlined"
          density="comfortable"
          hide-details
          class="efd-select"
          @update:modelValue="handleCategorySelectChange"
        >
          <template #item="{ props, item }">
            <v-list-item
              v-bind="props"
              :class="item.raw.id === '__create__' ? 'efd-create-option' : ''"
              :style="item.raw.id === '__create__' ? 'color:#ff3131;font-weight:600;' : ''"
              @click="item.raw.id === '__create__' ? handleCreateCategoryClick() : null"
            >
              <template #prepend v-if="item.raw.id === '__create__'">
                <Plus :size="16" class="mr-2" />
              </template>
            </v-list-item>
          </template>
        </v-select>
      </div>

      <div v-if="newEvent.eventCategoryId" class="efd-select-wrap mb-4">
        <label class="efd-select-label">{{ t('eventsList.labelSubcategory') }} <span class="efd-star">*</span></label>
        <v-select
          v-model="newEvent.eventSubcategoryId"
          :items="subcategoriesWithCreate"
          item-title="name"
          item-value="id"
          :placeholder="t('eventsList.selectSubcategory')"
          variant="outlined"
          density="comfortable"
          hide-details
          class="efd-select"
          @update:modelValue="handleSubcategorySelectChange"
        >
          <template #item="{ props, item }">
            <v-list-item
              v-bind="props"
              :class="item.raw.id === '__create__' ? 'efd-create-option' : ''"
              :style="item.raw.id === '__create__' ? 'color:#ff3131;font-weight:600;' : ''"
              @click="item.raw.id === '__create__' ? handleCreateSubcategoryClick() : null"
            >
              <template #prepend v-if="item.raw.id === '__create__'">
                <Plus :size="16" class="mr-2" />
              </template>
            </v-list-item>
          </template>
        </v-select>
      </div>

      <!-- ── Équipes (Home / Visiting) — events sport ── -->
      <div v-if="newEvent.eventCategoryId" class="efd-select-wrap mb-4">
        <label class="efd-select-label">Home Team</label>
        <!-- Autocomplete : MÊME catalogue que Visiting (une équipe peut être domicile
             OU visiteuse — cas lieu neutre / Coupe du Monde). Enregistre homeTeamId ;
             homeTeamName dénormalisé pour compat (défaut Space, CSV, affichage). -->
        <v-autocomplete
          v-model="newEvent.homeTeamId"
          :items="teamsWithCreate"
          item-title="name"
          item-value="id"
          placeholder="Rechercher / sélectionner l'équipe à domicile"
          variant="outlined"
          density="comfortable"
          hide-details
          clearable
          auto-select-first
          :custom-filter="teamFilter"
          class="efd-select"
          @update:modelValue="handleHomeTeamSelectChange"
        >
          <template #item="{ props, item }">
            <v-list-item
              v-bind="props"
              :class="item.raw.id === '__create__' ? 'efd-create-option' : ''"
              :style="item.raw.id === '__create__' ? 'color:#ff3131;font-weight:600;' : ''"
              @click="item.raw.id === '__create__' ? handleCreateTeamClick('home') : null"
            >
              <template #prepend v-if="item.raw.id === '__create__'">
                <Plus :size="16" class="mr-2" />
              </template>
            </v-list-item>
          </template>
        </v-autocomplete>
      </div>

      <div v-if="newEvent.eventCategoryId" class="efd-select-wrap mb-4">
        <label class="efd-select-label">Visiting Team</label>
        <!-- Autocomplete : recherche + autosuggestions des équipes sauvegardées. -->
        <v-autocomplete
          v-model="newEvent.visitingTeamId"
          :items="teamsWithCreate"
          item-title="name"
          item-value="id"
          placeholder="Rechercher / sélectionner l'équipe visiteuse"
          variant="outlined"
          density="comfortable"
          hide-details
          clearable
          auto-select-first
          :custom-filter="teamFilter"
          class="efd-select"
          @update:modelValue="handleTeamSelectChange"
        >
          <template #item="{ props, item }">
            <v-list-item
              v-bind="props"
              :class="item.raw.id === '__create__' ? 'efd-create-option' : ''"
              :style="item.raw.id === '__create__' ? 'color:#ff3131;font-weight:600;' : ''"
              @click="item.raw.id === '__create__' ? handleCreateTeamClick() : null"
            >
              <template #prepend v-if="item.raw.id === '__create__'">
                <Plus :size="16" class="mr-2" />
              </template>
            </v-list-item>
          </template>
        </v-autocomplete>
      </div>

      <!-- ── Section: Séances ── -->
      <div class="efd-section-label">
        <List :size="12" />
        <span>Séances</span>
      </div>

      <div class="efd-select-wrap mb-4">
        <label class="efd-select-label">{{ t('eventsList.labelSessions') }} <span class="efd-star">*</span></label>
        <v-text-field
          v-model.number="newEvent.numberOfSessions"
          type="number"
          min="0"
          variant="outlined"
          density="comfortable"
          hide-details
          class="efd-input"
        />
      </div>

      <div v-if="newEvent.numberOfSessions > 0" class="mb-4">
        <div v-for="(session, index) in sessionsList" :key="index" class="efd-session-card">
          <div class="efd-session-card__title">
            <span class="efd-session-card__num">{{ index + 1 }}</span>
            Session {{ index + 1 }}
          </div>
          <div class="efd-row">
            <div class="efd-col">
              <div class="efd-session-label">{{ t('eventsList.labelDoorsOpening') }}</div>
              <v-text-field v-model="session.doorsOpening" type="time" variant="outlined" density="comfortable" hide-details placeholder="--:--" class="efd-input" />
            </div>
            <div class="efd-col">
              <div class="efd-session-label">{{ t('eventsList.labelShowTime') }}</div>
              <v-text-field v-model="session.showTime" type="time" variant="outlined" density="comfortable" hide-details placeholder="--:--" class="efd-input" />
            </div>
          </div>
        </div>
      </div>

      <!-- ── Section: Billetterie ── -->
      <div class="efd-section-label">
        <Ticket :size="12" />
        <span>Billetterie</span>
      </div>

      <div class="efd-row mb-4">
        <div class="efd-select-wrap">
          <label class="efd-select-label">Tickets sold <span class="efd-star">*</span></label>
          <v-text-field
            v-model.number="newEvent.ticketsSold"
            type="number"
            min="0"
            step="1"
            variant="outlined"
            density="comfortable"
            hide-details
            placeholder="0"
            class="efd-input"
          />
        </div>
        <div class="efd-select-wrap">
          <label class="efd-select-label">Tickets scanned <span class="efd-star">*</span></label>
          <v-text-field
            v-model.number="newEvent.ticketsScanned"
            type="number"
            min="0"
            step="1"
            variant="outlined"
            density="comfortable"
            hide-details
            placeholder="0"
            class="efd-input"
          />
        </div>
      </div>

      <!-- ── Section: Options ── -->
      <div class="efd-section-label">
        <Settings :size="12" />
        <span>{{ t('eventsList.labelOptions') }}</span>
      </div>

      <div class="efd-options-card mb-4">
        <div class="efd-option-row">
          <div class="efd-option-text">
            <div class="efd-option-label">{{ t('eventsList.labelOpeningAct') }}</div>
            <div class="efd-option-desc">{{ t('eventsList.labelOpeningActDesc') }}</div>
          </div>
          <v-switch v-model="newEvent.hasOpeningAct" color="#ff3131" hide-details inset density="compact" />
        </div>
        <div class="efd-option-divider"></div>
        <div class="efd-option-row">
          <div class="efd-option-text">
            <div class="efd-option-label">{{ t('eventsList.labelIntermission') }}</div>
            <div class="efd-option-desc">{{ t('eventsList.labelIntermissionDesc') }}</div>
          </div>
          <v-switch v-model="newEvent.hasIntermission" color="#ff3131" hide-details inset density="compact" />
        </div>
      </div>

      <!-- ── Section: Données financières ── -->
      <div class="efd-section-label">
        <CircleDollarSign :size="12" />
        <span>Données financières</span>
      </div>

      <div class="efd-fin-grid mb-4">
        <div class="efd-select-wrap">
          <label class="efd-select-label">Revenue (€)</label>
          <v-text-field v-model.number="newEvent.revenue" type="number" min="0" step="0.01" variant="outlined" density="comfortable" hide-details placeholder="0.00" class="efd-input" />
        </div>
        <div class="efd-select-wrap">
          <label class="efd-select-label">Transactions</label>
          <v-text-field v-model.number="newEvent.transactionCount" type="number" min="0" variant="outlined" density="comfortable" hide-details placeholder="0" class="efd-input" />
        </div>
        <div class="efd-select-wrap">
          <label class="efd-select-label">Avg Spend / Tx</label>
          <v-text-field v-model.number="newEvent.avgSpendPerTx" type="number" min="0" step="0.01" variant="outlined" density="comfortable" hide-details placeholder="0.00" class="efd-input" />
        </div>
        <div class="efd-select-wrap">
          <label class="efd-select-label">Per Capita</label>
          <v-text-field v-model.number="newEvent.perCapita" type="number" min="0" step="0.01" variant="outlined" density="comfortable" hide-details placeholder="0.00" class="efd-input" />
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="efd-footer">
      <button class="efd-fbtn efd-fbtn--cancel" @click="$emit('update:modelValue', false)">
        {{ t('eventsList.cancel') }}
      </button>
      <button class="efd-fbtn efd-fbtn--primary" :disabled="formLoading" @click="submit">
        <Save :size="14" />
        {{ formLoading ? 'Enregistrement…' : t('eventsList.save') }}
      </button>
    </div>
  </v-navigation-drawer>

  <EventTypeDialog v-model="typeDialogOpen" @created="handleTypeCreated" />

  <EventCategoryDialog
    v-model="categoryDialogOpen"
    :event-types="eventTypes"
    :preselected-type-id="newEvent.eventTypeId"
    @created="handleCategoryCreated"
  />

  <EventSubcategoryDialog
    v-model="subcategoryDialogOpen"
    :categories="filteredCategories"
    :preselected-category-id="newEvent.eventCategoryId"
    @created="handleSubcategoryCreated"
  />

  <!-- Création d'équipe inline (scopée à la compétition de l'event). -->
  <v-dialog v-model="teamDialogOpen" max-width="420">
    <div style="background: var(--card, #fff); padding: 20px; border-radius: 12px;">
      <h3 style="font-weight: 700; margin-bottom: 12px;">Créer une équipe</h3>
      <v-text-field
        v-model="teamName"
        label="Nom de l'équipe"
        placeholder="Ex. Olympique Lyonnais"
        variant="outlined"
        density="comfortable"
        hide-details
        @keyup.enter="handleCreateTeam"
      />
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
        <v-btn variant="text" @click="teamDialogOpen = false">Annuler</v-btn>
        <v-btn color="primary" :disabled="!teamName.trim()" @click="handleCreateTeam">Créer</v-btn>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { t as translate, getCurrentLocale } from '@/i18n/translations';
import { Plus, Save, X, Calendar, Building2, Tag, List, Ticket, Settings, CircleDollarSign, AlertCircle } from 'lucide-vue-next';
import { createEvent, updateEvent } from '@/api/endpoints/event.api';
import { getTeams as restGetTeams, createTeam as restCreateTeam } from '@/api/endpoints/team.api';
import EventTypeDialog from '../dialogs/EventTypeDialog.vue';
import EventCategoryDialog from '../dialogs/EventCategoryDialog.vue';
import EventSubcategoryDialog from '../dialogs/EventSubcategoryDialog.vue';

const EMPTY_EVENT = () => ({
  name: '',
  eventDate: '',
  eventStartDate: '',
  eventEndDate: '',
  eventEndTime: '',
  spaceId: '',
  configurationId: '',
  eventTypeId: '',
  eventCategoryId: '',
  eventSubcategoryId: '',
  homeTeamName: '',
  homeTeamId: '',
  visitingTeamId: '',
  location: '',
  spaceName: '',
  sessions: [],
  numberOfSessions: 0,
  hasOpeningAct: true,
  hasIntermission: true,
  status: '',
  ticketsSold: null,
  ticketsScanned: null,
  revenue: null,
  transactionCount: null,
  avgSpendPerTx: null,
  perCapita: null,
});

export default {
  name: 'EventFormDrawer',

  components: {
    Plus, Save, X, Calendar, Building2, Tag, List, Ticket, Settings, CircleDollarSign, AlertCircle,
    EventTypeDialog, EventCategoryDialog, EventSubcategoryDialog,
  },

  props: {
    modelValue: { type: Boolean, default: false },
    mode: { type: String, default: 'create' },
    initialEvent: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
  },

  emits: ['update:modelValue', 'submitted'],

  data() {
    return {
      locale: getCurrentLocale(),
      newEvent: EMPTY_EVENT(),
      formLoading: false,
      formError: '',
      eventId: null,
      typeDialogOpen: false,
      categoryDialogOpen: false,
      subcategoryDialogOpen: false,
      teams: [],
      teamName: '',
      teamDialogOpen: false,
      teamDialogTarget: 'visiting',
      _initializingEdit: false,
      spaceConfigs: {},
    };
  },

  computed: {
    spaces() {
      return this.$store.getters['spaces/spaces']
        .map((s) => ({ ...s, id: s?.id || s?._id, name: s?.name || s?.spaceName || s?.title || '' }))
        .filter((s) => !!s.id);
    },
    eventTypes() {
      return this.$store.getters['eventTypes/eventTypes']
        .map((t) => ({ ...t, id: t?.id || t?._id }))
        .filter((t) => !!t.id);
    },
    eventCategories() {
      return this.$store.getters['eventCategories/eventCategories']
        .map((c) => ({ ...c, id: c?.id || c?._id, eventTypeId: this.normalizeId(c?.eventTypeId) }))
        .filter((c) => !!c.id);
    },
    eventSubcategories() {
      return this.$store.getters['eventSubcategories/eventSubcategories']
        .map((s) => ({ ...s, id: s?.id || s?._id, categoryId: this.normalizeId(s?.categoryId || s?.eventCategoryId) }))
        .filter((s) => !!s.id);
    },
    sessionsList() {
      const count = Math.max(1, parseInt(this.newEvent.numberOfSessions) || 1);
      const sessions = [];
      for (let i = 0; i < count; i++) {
        sessions.push(this.newEvent.sessions[i] || { doorsOpening: '', showTime: '' });
      }
      return sessions;
    },
    filteredCategories() {
      const typeId = this.newEvent?.eventTypeId;
      if (!typeId || typeId === '__create__') return [];
      return this.eventCategories.filter((c) => String(c?.eventTypeId) === String(typeId));
    },
    filteredSubcategories() {
      const categoryId = this.newEvent?.eventCategoryId;
      if (!categoryId) return [];
      return this.eventSubcategories.filter((s) => String(s?.categoryId || s?.eventCategoryId) === String(categoryId));
    },
    filteredEventCategories() {
      const typeId = this.newEvent?.eventTypeId;
      if (!typeId) return this.eventCategories;
      return this.eventCategories.filter((c) => String(c?.eventTypeId) === String(typeId));
    },
    filteredEventSubcategories() {
      const categoryId = this.newEvent?.eventCategoryId;
      if (!categoryId) return this.eventSubcategories;
      return this.eventSubcategories.filter((s) => String(s?.categoryId) === String(categoryId));
    },
    eventTypesWithCreate() {
      return [{ id: '__create__', name: 'Créer un nouveau type' }, ...this.eventTypes];
    },
    categoriesWithCreate() {
      return [{ id: '__create__', name: 'Créer une nouvelle catégorie' }, ...this.filteredCategories];
    },
    subcategoriesWithCreate() {
      return [{ id: '__create__', name: 'Créer une nouvelle sous-catégorie' }, ...this.filteredSubcategories];
    },
    filteredTeams() {
      // Équipes scopées à la compétition (catégorie + sous-catégorie), tolérant les
      // 2 conventions de nommage backend (sportCategoryId/subcategory OU
      // eventCategoryId/eventSubcategoryId — cf. docs/BACKEND_TEAMS_EVENTS.md).
      const categoryId = this.newEvent?.eventCategoryId;
      const subId = this.newEvent?.eventSubcategoryId;
      const cat = (t) => t.sportCategoryId ?? t.eventCategoryId;
      const sub = (t) => t.subcategory ?? t.eventSubcategoryId;
      return (this.teams || []).filter(
        (t) => (!categoryId || !cat(t) || String(cat(t)) === String(categoryId)) &&
          (!subId || !sub(t) || String(sub(t)) === String(subId)),
      );
    },
    teamsWithCreate() {
      return [{ id: '__create__', name: 'Créer une nouvelle équipe' }, ...this.filteredTeams];
    },
    teamNameSuggestions() {
      // Noms d'équipes (compétition) pour l'autosuggestion du champ Home Team.
      return (this.filteredTeams || []).map((t) => t.name).filter(Boolean);
    },
    configurationsForSpace() {
      if (!this.newEvent.spaceId) return [];
      return (this.spaceConfigs[this.newEvent.spaceId] || [])
        .map((c) => ({ ...c, id: c?.id || c?._id, name: c?.name || c?.configurationName || String(c?.id || '') }))
        .filter((c) => !!c.id);
    },
  },

  watch: {
    async modelValue(isOpen) {
      if (!isOpen) return;
      this.loadTeams();
      if (!this.spaces.length) await this.$store.dispatch('spaces/fetchSpaces').catch(() => {});
      const taxonomyLoads = [];
      if (!this.eventTypes.length) {
        taxonomyLoads.push(
          this.$store.dispatch('eventTypes/fetchEventTypes'),
          this.$store.dispatch('eventCategories/fetchEventCategories'),
          this.$store.dispatch('eventSubcategories/fetchEventSubcategories'),
        );
      }
      if (this.mode === 'edit' && this.initialEvent) {
        const spaceId = this.initialEvent.spaceId;
        if (spaceId) {
          taxonomyLoads.push(
            this.$store.dispatch('spaceConfigurations/fetchForSpace', { spaceId }).catch(() => []).then((rows) => {
              if (Array.isArray(rows)) this.spaceConfigs = { ...this.spaceConfigs, [spaceId]: rows };
            })
          );
        }
        await Promise.allSettled(taxonomyLoads);
        this._initializingEdit = true;
        this.initFormFromEvent(this.initialEvent);
        this.$nextTick(() => { this._initializingEdit = false; });
      } else {
        await Promise.allSettled(taxonomyLoads);
        this.newEvent = EMPTY_EVENT();
        this.formError = '';
      }
    },

    'newEvent.numberOfSessions'(newCount) {
      const count = Math.max(0, parseInt(newCount) || 0);
      const current = this.newEvent.sessions || [];
      if (current.length === count) return;
      if (current.length < count) {
        for (let i = current.length; i < count; i++) current.push({ doorsOpening: '', showTime: '' });
      } else {
        current.splice(count);
      }
      this.newEvent.sessions = [...current];
    },

    'newEvent.spaceId'(next) {
      if (!next) { this.newEvent.spaceName = ''; this.newEvent.configurationId = ''; return; }
      const match = (this.spaces || []).find((s) => String(s.id) === String(next));
      this.newEvent.spaceName = match?.name || '';
      if (!this._initializingEdit) {
        this.newEvent.configurationId = '';
      }
      this.$store.dispatch('spaceConfigurations/fetchForSpace', { spaceId: next }).catch(() => []).then((rows) => {
        if (Array.isArray(rows)) this.spaceConfigs = { ...this.spaceConfigs, [next]: rows };
      });
    },

    'newEvent.eventTypeId'(next) {
      if (!next) {
        this.newEvent.eventCategoryId = '';
        this.newEvent.eventSubcategoryId = '';
        return;
      }
      if (
        this.newEvent.eventCategoryId &&
        !this.filteredEventCategories.some((c) => String(c.id) === String(this.newEvent.eventCategoryId))
      ) {
        this.newEvent.eventCategoryId = '';
        this.newEvent.eventSubcategoryId = '';
      }
    },

    'newEvent.eventCategoryId'(next) {
      if (!next) { this.newEvent.eventSubcategoryId = ''; return; }
      if (
        this.newEvent.eventSubcategoryId &&
        !this.filteredEventSubcategories.some((s) => String(s.id) === String(this.newEvent.eventSubcategoryId))
      ) {
        this.newEvent.eventSubcategoryId = '';
      }
    },
  },

  methods: {
    t(key) { return translate(key, this.locale); },
    handleLocaleChange(event) { this.locale = event.detail.locale; },

    normalizeId(value) {
      if (!value) return null;
      if (typeof value === 'string' || typeof value === 'number') return value;
      if (typeof value === 'object') return value.id || value._id || null;
      return null;
    },

    toDateInputValue(value) {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    toTimeInputValue(value) {
      if (!value) return '';
      const timeMatch = String(value).match(/^(\d{2}):(\d{2})/);
      if (timeMatch) return `${timeMatch[1]}:${timeMatch[2]}`;
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      return '';
    },

    initFormFromEvent(e) {
      this.formError = '';
      this.eventId = e?.id || null;

      let parsedSessions = [];
      let list = [];
      if (Array.isArray(e?.sessions)) {
        list = e.sessions;
      } else if (typeof e?.sessions === 'string' && e.sessions.trim()) {
        try { list = JSON.parse(e.sessions); if (!Array.isArray(list)) list = []; } catch { list = []; }
      }
      parsedSessions = list
        .map((s) => {
          if (typeof s === 'string') { try { return JSON.parse(s); } catch { return null; } }
          return s;
        })
        .filter((s) => s !== null && typeof s === 'object' && !Array.isArray(s))
        .map((s) => ({ ...s, doorsOpening: this.toTimeInputValue(s.doorsOpening), showTime: this.toTimeInputValue(s.showTime) }));

      this.newEvent = {
        name: e?.name || '',
        eventDate: this.toDateInputValue(e?.eventDate),
        eventStartDate: this.toDateInputValue(e?.eventStartDate || e?.eventDate),
        eventEndDate: this.toDateInputValue(e?.eventEndDate),
        eventEndTime: this.toTimeInputValue(e?.eventEndTime),
        spaceId: e?.spaceId || '',
        configurationId: e?.configurationId || '',
        eventTypeId: e?.eventTypeId || '',
        eventCategoryId: e?.eventCategoryId || '',
        eventSubcategoryId: e?.eventSubcategoryId || '',
        homeTeamName: e?.homeTeamName || '',
        homeTeamId: e?.homeTeamId || '',
        visitingTeamId: e?.visitingTeamId || '',
        location: e?.location || '',
        spaceName: e?.spaceName || '',
        sessions: parsedSessions,
        numberOfSessions: Number(e?.numberOfSessions) || parsedSessions.length || 1,
        hasOpeningAct: Boolean(e?.hasOpeningAct),
        hasIntermission: Boolean(e?.hasIntermission),
        status: e?.status || '',
        ticketsSold: e?.ticketsSold ?? null,
        ticketsScanned: e?.ticketsScanned ?? null,
        revenue: e?.revenue ?? null,
        transactionCount: e?.transactionCount ?? null,
        avgSpendPerTx: e?.avgSpendPerTx ?? null,
        perCapita: e?.perCapita ?? null,
      };

      const targetCount = this.newEvent.numberOfSessions;
      while (this.newEvent.sessions.length < targetCount) {
        this.newEvent.sessions.push({ doorsOpening: '', showTime: '' });
      }
    },

    async submit() {
      this.formError = '';

      const requiredChecks = [
        { value: this.newEvent.name?.trim(), label: 'Event name' },
        { value: this.newEvent.spaceId, label: 'Space' },
        { value: this.newEvent.configurationId, label: 'Configuration' },
        { value: this.newEvent.eventStartDate, label: 'Start date' },
        { value: this.newEvent.eventEndDate, label: 'End date' },
        { value: this.newEvent.eventEndTime, label: 'End time' },
        { value: this.newEvent.eventTypeId, label: 'Event type' },
        { value: this.newEvent.eventCategoryId, label: 'Event category' },
        { value: this.newEvent.eventSubcategoryId, label: 'Event subcategory' },
        { value: this.newEvent.numberOfSessions != null && this.newEvent.numberOfSessions !== '' ? String(this.newEvent.numberOfSessions) : '', label: 'Number of sessions' },
        { value: this.newEvent.ticketsSold != null && this.newEvent.ticketsSold !== '' ? String(this.newEvent.ticketsSold) : '', label: 'Tickets sold' },
        { value: this.newEvent.ticketsScanned != null && this.newEvent.ticketsScanned !== '' ? String(this.newEvent.ticketsScanned) : '', label: 'Tickets scanned' },
      ];
      for (const c of requiredChecks) {
        if (!c.value) {
          this.formError = `Le champ "${c.label}" est obligatoire.`;
          return;
        }
      }

      const intFields = [
        { key: 'ticketsSold', label: 'Tickets sold' },
        { key: 'ticketsScanned', label: 'Tickets scanned' },
        { key: 'transactionCount', label: 'Transactions' },
        { key: 'numberOfSessions', label: 'Number of sessions' },
      ];
      for (const f of intFields) {
        const v = this.newEvent[f.key];
        if (v !== null && v !== '' && v !== undefined) {
          const n = Number(v);
          if (!Number.isFinite(n) || !Number.isInteger(n)) {
            this.formError = `"${f.label}" doit être un nombre entier valide.`;
            return;
          }
        }
      }

      const numFields = [
        { key: 'revenue', label: 'Revenue' },
        { key: 'avgSpendPerTx', label: 'Avg Spend / Tx' },
        { key: 'perCapita', label: 'Per Capita' },
      ];
      for (const f of numFields) {
        const v = this.newEvent[f.key];
        if (v !== null && v !== '' && v !== undefined) {
          if (!Number.isFinite(Number(v))) {
            this.formError = `"${f.label}" doit être un nombre valide.`;
            return;
          }
        }
      }

      this.formLoading = true;
      try {
        const payload = {
          name: this.newEvent.name,
          eventDate: this.newEvent.eventStartDate || this.newEvent.eventDate,
          eventStartDate: this.newEvent.eventStartDate,
          eventEndDate: this.newEvent.eventEndDate,
          eventEndTime: this.newEvent.eventEndTime,
          spaceId: this.newEvent.spaceId,
          configurationId: this.newEvent.configurationId,
          eventTypeId: this.newEvent.eventTypeId,
          eventCategoryId: this.newEvent.eventCategoryId,
          eventSubcategoryId: this.newEvent.eventSubcategoryId,
          // homeTeamName persiste dès aujourd'hui (déjà whitelisté). homeTeamId
          // (FK) N'EST PAS encore envoyé : le DTO event a forbidNonWhitelisted →
          // un champ inconnu ferait 400 sur TOUT le save. À réactiver quand la
          // colonne backend homeTeamId existe (docs/BACKEND_HOME_TEAM.md).
          homeTeamName: this.newEvent.homeTeamName || undefined,
          visitingTeamId: this.newEvent.visitingTeamId || undefined,
          location: this.newEvent.location,
          spaceName: this.newEvent.spaceName,
          sessions: this.newEvent.sessions.map((s) => JSON.stringify(s)),
          numberOfSessions: Number(this.newEvent.numberOfSessions) || 1,
          hasOpeningAct: Boolean(this.newEvent.hasOpeningAct),
          hasIntermission: Boolean(this.newEvent.hasIntermission),
          status: this.newEvent.status,
          ticketsSold: this.newEvent.ticketsSold != null ? Math.trunc(Number(this.newEvent.ticketsSold)) : undefined,
          ticketsScanned: this.newEvent.ticketsScanned != null ? Math.trunc(Number(this.newEvent.ticketsScanned)) : undefined,
          revenue: this.newEvent.revenue != null ? Number(this.newEvent.revenue) : undefined,
          transactionCount: this.newEvent.transactionCount != null ? Number(this.newEvent.transactionCount) : undefined,
          avgSpendPerTx: this.newEvent.avgSpendPerTx != null ? Number(this.newEvent.avgSpendPerTx) : undefined,
          perCapita: this.newEvent.perCapita != null ? Number(this.newEvent.perCapita) : undefined,
        };

        if (this.mode === 'edit') {
          if (!this.eventId) throw new Error('Missing event id');
          const updated = await updateEvent(this.eventId, payload);
          this.$store.dispatch('events/updateEvent', updated?.data ?? updated);
        } else {
          const created = await createEvent(payload);
          this.$store.dispatch('events/addEvent', created?.data ?? created);
        }

        this.$emit('submitted');
        this.$emit('update:modelValue', false);
        this.newEvent = EMPTY_EVENT();
      } catch (e) {
        this.formError = e?.response?.data?.message || e?.message || 'Impossible de sauvegarder l\'événement';
      } finally {
        this.formLoading = false;
      }
    },

    handleEventTypeChange(value) {
      if (value === '__create__') { this.newEvent.eventTypeId = ''; this.typeDialogOpen = true; }
      else { this.newEvent.eventCategoryId = ''; this.newEvent.eventSubcategoryId = ''; }
    },
    handleCreateTypeClick() {
      this.newEvent.eventTypeId = '';
      this.newEvent.eventCategoryId = '';
      this.newEvent.eventSubcategoryId = '';
      this.typeDialogOpen = true;
    },
    handleTypeCreated(created) {
      this.newEvent.eventTypeId = created.id;
    },

    handleCategorySelectChange(value) {
      if (value === '__create__') { this.newEvent.eventCategoryId = ''; this.categoryDialogOpen = true; }
      else { this.newEvent.eventSubcategoryId = ''; }
    },
    handleCreateCategoryClick() {
      this.newEvent.eventCategoryId = '';
      this.newEvent.eventSubcategoryId = '';
      this.categoryDialogOpen = true;
    },
    handleCategoryCreated(created) {
      if (String(created.eventTypeId) === String(this.newEvent.eventTypeId)) {
        this.newEvent.eventCategoryId = created.id;
      }
    },

    handleSubcategorySelectChange(value) {
      if (value === '__create__') { this.newEvent.eventSubcategoryId = ''; this.subcategoryDialogOpen = true; }
    },
    handleCreateSubcategoryClick() {
      this.newEvent.eventSubcategoryId = '';
      this.subcategoryDialogOpen = true;
    },
    handleSubcategoryCreated(created) {
      if (String(created.categoryId) === String(this.newEvent.eventCategoryId)) {
        this.newEvent.eventSubcategoryId = created.id;
      }
    },
    async loadTeams() {
      try {
        const t = await restGetTeams();
        this.teams = Array.isArray(t) ? t : [];
      } catch (_) {
        this.teams = [];
      }
      this.resolveHomeTeamId();
    },
    resolveHomeTeamId() {
      // Reverse-lookup : l'event persiste `homeTeamName` (pas encore d'`homeTeamId`
      // envoyé) → retrouver l'id du catalogue par nom pour que l'autocomplete Home
      // reflète l'équipe sauvée après reload. Mirror de la dérivation visiting.
      if (this.newEvent.homeTeamId || !this.newEvent.homeTeamName) return;
      const t = (this.teams || []).find((x) => x.name === this.newEvent.homeTeamName);
      if (t) this.newEvent.homeTeamId = t.id;
    },
    handleTeamSelectChange(value) {
      // « Créer une nouvelle équipe » (visiteuse) → dialog cible visiting.
      if (value === '__create__') {
        this.newEvent.visitingTeamId = '';
        this.handleCreateTeamClick('visiting');
      }
    },
    handleHomeTeamSelectChange(value) {
      // « Créer » → dialog cible home ; sinon dénormalise le nom (homeTeamName =
      // libellé conservé pour compat/affichage/fallback à côté de homeTeamId).
      if (value === '__create__') {
        this.newEvent.homeTeamId = '';
        this.handleCreateTeamClick('home');
        return;
      }
      const t = (this.teams || []).find((x) => x.id === value);
      this.newEvent.homeTeamName = t ? t.name : (this.newEvent.homeTeamName || '');
    },
    teamFilter(value, query, item) {
      // Garde « + Créer une nouvelle équipe » TOUJOURS visible, même en recherchant
      // un nom absent du catalogue (sinon impossible de créer depuis la recherche).
      if (item?.raw?.id === '__create__') return true;
      return String(value || '').toLowerCase().includes(String(query || '').toLowerCase());
    },
    handleCreateTeamClick(target = 'visiting') {
      this.teamDialogTarget = target;
      this.teamDialogOpen = true;
    },
    async handleCreateTeam() {
      const name = (this.teamName || '').trim();
      if (!name) return;
      // Shape ACCEPTÉE par le backend (body 400 confirmé : sportCategoryId/subcategory
      // « should not exist » → DTO forbidNonWhitelisted attend eventCategoryId/
      // eventSubcategoryId). On réutilise l'équipe RENVOYÉE (id backend) → visitingTeamId
      // valide après reload. eventSubcategoryId omis si absent.
      const payload = {
        name,
        eventCategoryId: this.newEvent.eventCategoryId,
        ...(this.newEvent.eventSubcategoryId
          ? { eventSubcategoryId: this.newEvent.eventSubcategoryId }
          : {}),
      };
      try {
        const created = await restCreateTeam(payload);
        const team = created && created.id ? created : { id: `team-${Date.now()}`, ...payload };
        this.teams = [...this.teams, team];
        // Assigne selon la cible du dialog (home vs visiting). Catalogue partagé.
        if (this.teamDialogTarget === 'home') {
          this.newEvent.homeTeamId = team.id;
          this.newEvent.homeTeamName = team.name;
        } else {
          this.newEvent.visitingTeamId = team.id;
        }
        this.teamName = '';
        this.teamDialogOpen = false;
      } catch (e) {
        this.formError = e?.response?.data?.message || e?.message || "Impossible de créer l'équipe";
      }
    },
  },

  mounted() {
    window.addEventListener('locale-changed', this.handleLocaleChange);
  },
  beforeUnmount() {
    window.removeEventListener('locale-changed', this.handleLocaleChange);
  },
};
</script>

<style scoped>
.efd-drawer :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
}

/* Gradient header */
.efd-grad-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  flex-shrink: 0;
}
.efd-grad-header__icon {
  width: 44px; height: 44px;
  border-radius: 13px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.efd-grad-header__text { flex: 1; }
.efd-grad-header__title { font-size: 16px; font-weight: 700; color: #fff; }
.efd-grad-header__sub { font-size: 12.5px; color: rgba(255,255,255,.75); margin-top: 2px; }
.efd-grad-header__close {
  width: 32px; height: 32px;
  border-radius: 9px; border: none;
  background: rgba(255,255,255,.15);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: rgba(255,255,255,.85); flex-shrink: 0;
  transition: background .2s;
}
.efd-grad-header__close:hover { background: rgba(255,255,255,.25); }

/* Body */
.efd-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 22px 16px;
  background: #f9fafb;
}
.efd--dark .efd-body { background: #111827; }

/* Error */
.efd-error {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 12px; padding: 12px 16px; font-size: 13.5px; margin-bottom: 20px;
}

/* Section labels */
.efd-section-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: #9ca3af;
  margin-bottom: 12px; margin-top: 20px;
}
.efd-section-label:first-of-type { margin-top: 0; }
.efd--dark .efd-section-label { color: #6b7280; }

/* Styled v-text-field */
.efd-input :deep(.v-field) {
  border: 1.5px solid #e5e7eb;
  border-radius: 11px;
  box-shadow: none;
  background: #fff;
}
.efd-input :deep(.v-field--focused) {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.10);
}
.efd-input :deep(.v-field__outline) { display: none; }
.efd-input :deep(.v-label.v-field-label--floating) { color: #ff3131; font-size: 11px; }
.efd--dark .efd-input :deep(.v-field) { background: #1f2937; border-color: #4b5563; }
.efd--dark .efd-input :deep(.v-field input),
.efd--dark .efd-input :deep(.v-field__input) { color: #f3f4f6 !important; }

/* v-select wrapper */
.efd-select-wrap { display: flex; flex-direction: column; gap: 6px; }
.efd-select-label { font-size: 12.5px; font-weight: 600; color: #374151; }
.efd-star { color: #ff3131; }
.efd--dark .efd-select-label { color: #d1d5db; }

/* Styled v-select */
.efd-select :deep(.v-field) {
  border: 1.5px solid #e5e7eb;
  border-radius: 11px;
  box-shadow: none;
  background: #fff;
}
.efd-select :deep(.v-field--focused) {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.10);
}
.efd-select :deep(.v-field__outline) { display: none; }
.efd-select :deep(.v-field__input) { font-size: 14px; }
.efd--dark .efd-select :deep(.v-field) { background: #1f2937; border-color: #4b5563; }

/* Create option in dropdowns (« Créer une nouvelle… ») en rouge */
:deep(.efd-create-option),
:deep(.efd-create-option) .v-list-item-title {
  color: #ff3131 !important;
  font-weight: 600;
}

/* Row layouts */
.efd-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* Sessions */
.efd-session-card {
  background: #fff;
  border: 1.5px solid #e5e7eb;
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 10px;
}
.efd--dark .efd-session-card { background: #1f2937; border-color: #374151; }
.efd-session-card__title {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: #374151;
  margin-bottom: 12px;
}
.efd--dark .efd-session-card__title { color: #d1d5db; }
.efd-session-card__num {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff3131 0%, #b91c1c 100%);
  color: #fff; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.efd-session-label { font-size: 11.5px; font-weight: 600; color: #6b7280; margin-bottom: 6px; }
.efd-col { display: flex; flex-direction: column; }

/* Options card */
.efd-options-card {
  background: #fff;
  border: 1.5px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
}
.efd--dark .efd-options-card { background: #1f2937; border-color: #374151; }
.efd-option-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
}
.efd-option-text { flex: 1; }
.efd-option-label { font-size: 13.5px; font-weight: 500; color: #111827; }
.efd-option-desc { font-size: 12px; color: #9ca3af; margin-top: 2px; }
.efd-option-divider { height: 1px; background: #f3f4f6; margin: 0 16px; }
.efd--dark .efd-option-label { color: #f3f4f6; }
.efd--dark .efd-option-divider { background: #374151; }

/* Financial grid */
.efd-fin-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* Footer */
.efd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 22px;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.efd--dark .efd-footer { background: #1f2937; border-color: #374151; }
.efd-fbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 22px; height: 42px;
  border-radius: 50px; font-size: 13.5px; font-weight: 500;
  border: none; cursor: pointer; transition: all .2s;
}
.efd-fbtn:disabled { opacity: .5; cursor: not-allowed; }
.efd-fbtn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.efd-fbtn--cancel:hover { background: #e9ecef; }
.efd-fbtn--primary {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 14px rgba(255, 49, 49,.35);
}
.efd-fbtn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.45); transform: translateY(-1px); }
</style>
