<template>
  <!-- Dialog création d'événement depuis date non couverte -->
  <v-dialog :model-value="modelValue" max-width="560" persistent @update:model-value="$emit('update:modelValue', $event)">
    <!-- Classe --dark sur la racine PROPRE : contenu v-dialog téléporté hors du v-app (BUG-198/199, BUG-247-01). -->
    <div class="ced-card" :class="{ 'ced-card--dark': isDark }">

      <!-- Header -->
      <div class="ced-header">
        <div class="ced-header-icon">
          <v-icon color="white" size="18">mdi-calendar-plus</v-icon>
        </div>
        <div>
          <div class="ced-header-title">{{ t('intgCreateEvtHeaderTitle') }}</div>
          <div class="ced-header-sub">{{ t('intgCreateEvtHeaderSub') }}</div>
        </div>
      </div>

      <!-- Scrollable body -->
      <div class="ced-body">

        <!-- Informations -->
        <div class="ced-section-label">
          <v-icon size="12" color="#ff3131">mdi-information-outline</v-icon>
          {{ t('intgCreateEvtSectionInfo') }}
        </div>
        <div class="ced-field-group mb-4">
          <label class="ced-label" for="ced-event-name">{{ t('intgCreateEvtNameLabel') }} <span class="ced-required">*</span></label>
          <input
            id="ced-event-name"
            v-model="newEventName"
            class="ced-input"
            type="text"
            :placeholder="t('intgCreateEvtNamePlaceholder')"
            autofocus
          />
        </div>

        <!-- Dates -->
        <div class="ced-section-label">
          <v-icon size="12" color="#ff3131">mdi-calendar-range</v-icon>
          {{ t('intgCreateEvtSectionDates') }}
        </div>
        <div class="ced-dates-row mb-4">
          <div class="ced-field-group">
            <label class="ced-label" for="ced-start-date">{{ t('intgCreateEvtStartDate') }} <span class="ced-required">*</span></label>
            <input id="ced-start-date" v-model="newEventDate" class="ced-input" type="date" />
          </div>
          <div class="ced-field-group">
            <label class="ced-label" for="ced-end-date">{{ t('intgCreateEvtEndDate') }}</label>
            <input id="ced-end-date" v-model="newEventEndDate" class="ced-input" type="date" :min="newEventDate" />
          </div>
          <div class="ced-field-group ced-field-group--time">
            <label class="ced-label" for="ced-end-time">{{ t('intgCreateEvtEndTime') }}</label>
            <input id="ced-end-time" v-model="newEventEndTime" class="ced-input" type="time" placeholder="--:--" />
          </div>
        </div>

        <!-- Taxonomie -->
        <div class="ced-section-label">
          <v-icon size="12" color="#ff3131">mdi-tag-multiple-outline</v-icon>
          {{ t('intgCreateEvtSectionTaxonomy') }}
        </div>

        <div class="ced-field-group mb-3">
          <label class="ced-label" for="ced-event-type">{{ t('intgCreateEvtTypeLabel') }}</label>
          <div class="ced-select-wrap">
            <select
              id="ced-event-type"
              class="ced-input ced-select"
              :value="newEventType"
              @change="handleNewEventTypeChange($event)"
            >
              <option value="">{{ t('intgCreateEvtSelectPlaceholder') }}</option>
              <option v-for="item in eventTypesList" :key="item.id" :value="item.id">{{ item.name }}</option>
              <option value="__create_type__">{{ t('intgCreateEvtCreateType') }}</option>
            </select>
          </div>
        </div>

        <div v-if="newEventType" class="ced-field-group mb-3">
          <label class="ced-label" for="ced-event-category">{{ t('intgCreateEvtCategoryLabel') }}</label>
          <div class="ced-select-wrap">
            <select
              id="ced-event-category"
              class="ced-input ced-select"
              :value="newEventCategory"
              @change="handleNewEventCategoryChange($event)"
            >
              <option value="">{{ t('intgCreateEvtSelectPlaceholder') }}</option>
              <option
                v-for="item in eventCategoriesList.filter(c => c.eventTypeId === newEventType)"
                :key="item.id"
                :value="item.id"
              >{{ item.name }}</option>
              <option value="__create_category__">{{ t('intgCreateEvtCreateCategory') }}</option>
            </select>
          </div>
        </div>

        <div v-if="newEventCategory" class="ced-field-group mb-2">
          <label class="ced-label" for="ced-event-subcategory">{{ t('intgCreateEvtSubcategoryLabel') }}</label>
          <div class="ced-select-wrap">
            <select
              id="ced-event-subcategory"
              class="ced-input ced-select"
              :value="newEventSubcategory"
              @change="handleNewEventSubChange($event)"
            >
              <option value="">{{ t('intgCreateEvtSelectPlaceholder') }}</option>
              <option
                v-for="item in eventSubcategoriesList.filter(s => { const id = s.eventCategoryId ?? s.categoryId ?? s.category_id; return String(id) === String(newEventCategory) })"
                :key="item.id"
                :value="item.id"
              >{{ item.name }}</option>
              <option value="__create_sub__">{{ t('intgCreateEvtCreateSubcategory') }}</option>
            </select>
          </div>
        </div>

        <!-- Plus d'options toggle -->
        <div class="ced-options-toggle" @click="newEventOptionalOpen = !newEventOptionalOpen">
          <div class="ced-options-line" />
          <div class="ced-options-btn">
            <span>{{ newEventOptionalOpen ? t('intgCreateEvtHideOptions') : t('intgCreateEvtMoreOptions') }}</span>
            <v-icon size="13">{{ newEventOptionalOpen ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
          </div>
          <div class="ced-options-line" />
        </div>

        <v-expand-transition>
          <div v-if="newEventOptionalOpen" class="ced-options-body">

            <!-- Billetterie -->
            <div class="ced-section-label">
              <v-icon size="12" color="#ff3131">mdi-ticket-outline</v-icon>
              {{ t('intgCreateEvtSectionTicketing') }}
            </div>
            <div class="ced-row mb-4">
              <div class="ced-field-group">
                <label class="ced-label" for="ced-tickets-sold">{{ t('intgCreateEvtTicketsSold') }}</label>
                <input id="ced-tickets-sold" v-model.number="newEventTicketsSold" class="ced-input" type="number" min="0" placeholder="0" />
              </div>
              <div class="ced-field-group">
                <label class="ced-label" for="ced-tickets-scanned">{{ t('intgCreateEvtTicketsScanned') }}</label>
                <input id="ced-tickets-scanned" v-model.number="newEventTicketsScanned" class="ced-input" type="number" min="0" placeholder="0" />
              </div>
            </div>

            <!-- Déroulement -->
            <div class="ced-section-label">
              <v-icon size="12" color="#ff3131">mdi-calendar-clock</v-icon>
              {{ t('intgCreateEvtSectionFlow') }}
            </div>
            <div class="ced-row mb-4">
              <div
                class="ced-toggle-chip"
                :class="{ 'ced-toggle-chip--active': newEventHasOpeningAct }"
                @click="newEventHasOpeningAct = !newEventHasOpeningAct"
              >
                <v-icon size="14">mdi-music-note</v-icon>
                {{ t('intgCreateEvtOpeningAct') }}
              </div>
              <div
                class="ced-toggle-chip"
                :class="{ 'ced-toggle-chip--active': newEventHasIntermission }"
                @click="newEventHasIntermission = !newEventHasIntermission"
              >
                <v-icon size="14">mdi-pause-circle-outline</v-icon>
                {{ t('intgCreateEvtIntermission') }}
              </div>
            </div>

            <!-- Artistes / Sponsoring -->
            <div class="ced-section-label">
              <v-icon size="12" color="#ff3131">mdi-account-star-outline</v-icon>
              {{ t('intgCreateEvtSectionEntertainment') }}
            </div>
            <div class="ced-row mb-3">
              <div class="ced-field-group">
                <label class="ced-label" for="ced-performer">{{ t('intgCreateEvtPerformerLabel') }}</label>
                <input id="ced-performer" v-model="newEventPerformerName" class="ced-input" type="text" :placeholder="t('intgCreateEvtPerformerPlaceholder')" />
              </div>
              <div class="ced-field-group">
                <label class="ced-label" for="ced-sponsor">{{ t('intgCreateEvtSponsorLabel') }}</label>
                <input id="ced-sponsor" v-model="newEventSponsor" class="ced-input" type="text" :placeholder="t('intgCreateEvtSponsorPlaceholder')" />
              </div>
            </div>
            <div v-if="newEventHasOpeningAct" class="ced-field-group mb-4">
              <label class="ced-label" for="ced-opening-act-name">{{ t('intgCreateEvtOpeningActNameLabel') }}</label>
              <input id="ced-opening-act-name" v-model="newEventOpeningActName" class="ced-input" type="text" :placeholder="t('intgCreateEvtOpeningActNamePlaceholder')" />
            </div>

            <!-- Sessions -->
            <div class="ced-section-label">
              <v-icon size="12" color="#ff3131">mdi-counter</v-icon>
              {{ t('intgCreateEvtSectionSessions') }}
            </div>
            <div class="ced-field-group mb-3">
              <label class="ced-label" for="ced-session-count">{{ t('intgCreateEvtSessionCount') }}</label>
              <input
                id="ced-session-count"
                :value="newEventSessionCount"
                class="ced-input"
                type="number"
                min="1"
                max="10"
                style="max-width: 100px;"
                @input="e => {
                  const n = Math.max(1, Math.min(10, Number(e.target.value) || 1))
                  newEventSessionCount = n
                  while (newEventSessions.length < n) newEventSessions.push({ doorsOpening: '', showTime: '' })
                  newEventSessions.length = n
                }"
              />
            </div>
            <div
              v-for="(session, i) in newEventSessions.slice(0, newEventSessionCount)"
              :key="i"
              class="ced-session-card mb-3"
            >
              <div class="ced-session-title">{{ t('intgCreateEvtSessionTitle') }} {{ i + 1 }}</div>
              <div class="ced-row">
                <div class="ced-field-group">
                  <label class="ced-label" :for="`ced-session-${i}-doors`">{{ t('intgCreateEvtDoorsOpening') }}</label>
                  <input :id="`ced-session-${i}-doors`" v-model="session.doorsOpening" class="ced-input" type="time" />
                </div>
                <div class="ced-field-group">
                  <label class="ced-label" :for="`ced-session-${i}-show`">{{ t('intgCreateEvtKickoff') }}</label>
                  <input :id="`ced-session-${i}-show`" v-model="session.showTime" class="ced-input" type="time" />
                </div>
              </div>
            </div>

          </div>
        </v-expand-transition>

      </div>

      <!-- BUG-273 : erreur rendue hors zone scrollable, juste au-dessus du footer (pas en haut
           du corps, invisible une fois scrollé). -->
      <v-alert v-if="createEventError" type="error" variant="tonal" density="compact" class="ced-error">{{ createEventError }}</v-alert>

      <!-- Footer -->
      <div class="ced-footer">
        <button class="ced-btn ced-btn--ghost" type="button" @click="$emit('update:modelValue', false)">{{ t('intgCreateEvtCancel') }}</button>
        <button
          class="ced-btn ced-btn--primary"
          type="button"
          :disabled="!newEventName || !newEventDate || creatingEvent"
          @click="submitCreateEvent"
        >
          <v-icon v-if="!creatingEvent" size="15" color="white">mdi-check</v-icon>
          <v-progress-circular v-else size="15" width="2" indeterminate color="white" />
          {{ t('intgCreateEvtSubmit') }}
        </button>
      </div>

    </div>
  </v-dialog>

  <!-- Sub-dialog: Créer un type d'événement -->
  <v-dialog v-model="evtTypeCreateOpen" max-width="440" persistent>
    <div class="ced-mini" :class="{ 'ced-mini--dark': isDark }">
      <div class="ced-mini__header">
        <div class="ced-mini__icon"><v-icon size="18" color="white">mdi-tag-outline</v-icon></div>
        <div class="ced-mini__title">{{ t('intgCreateEvtTypeDialogTitle') }}</div>
        <button type="button" class="ced-mini__close" :disabled="evtTypeCreateLoading" @click="evtTypeCreateOpen = false"><v-icon size="18">mdi-close</v-icon></button>
      </div>
      <div class="ced-mini__body">
        <div v-if="evtTypeCreateError" class="ced-mini__error"><v-icon size="14" color="#ff3131">mdi-alert-circle</v-icon><span>{{ evtTypeCreateError }}</span></div>
        <div class="ced-field-group">
          <label class="ced-label" for="ced-type-name">{{ t('intgCreateEvtTypeNameLabel') }}</label>
          <input id="ced-type-name" v-model="evtTypeCreateName" class="ced-input" type="text" :placeholder="t('intgCreateEvtTypeNamePlaceholder')" @keyup.enter="submitEvtTypeCreate" />
        </div>
      </div>
      <div class="ced-mini__footer">
        <button class="ced-btn ced-btn--ghost" type="button" :disabled="evtTypeCreateLoading" @click="evtTypeCreateOpen = false">{{ t('intgCreateEvtCancel') }}</button>
        <button class="ced-btn ced-btn--primary" type="button" :disabled="evtTypeCreateLoading" @click="submitEvtTypeCreate">
          <v-progress-circular v-if="evtTypeCreateLoading" size="14" width="2" indeterminate color="white" />
          <v-icon v-else size="14" color="white">mdi-plus</v-icon>
          {{ t('intgCreateEvtCreate') }}
        </button>
      </div>
    </div>
  </v-dialog>

  <!-- Sub-dialog: Créer une catégorie d'événement -->
  <v-dialog v-model="evtCategoryCreateOpen" max-width="440" persistent>
    <div class="ced-mini" :class="{ 'ced-mini--dark': isDark }">
      <div class="ced-mini__header">
        <div class="ced-mini__icon"><v-icon size="18" color="white">mdi-shape-outline</v-icon></div>
        <div class="ced-mini__title">{{ t('intgCreateEvtCategoryDialogTitle') }}</div>
        <button type="button" class="ced-mini__close" :disabled="evtCategoryCreateLoading" @click="evtCategoryCreateOpen = false"><v-icon size="18">mdi-close</v-icon></button>
      </div>
      <div class="ced-mini__body">
        <p v-if="newEventTypeName" class="ced-mini__hint">{{ t('intgCreateEvtLinkedToType') }} <strong>{{ newEventTypeName }}</strong></p>
        <div v-if="evtCategoryCreateError" class="ced-mini__error"><v-icon size="14" color="#ff3131">mdi-alert-circle</v-icon><span>{{ evtCategoryCreateError }}</span></div>
        <div class="ced-field-group">
          <label class="ced-label" for="ced-cat-name">{{ t('intgCreateEvtCategoryNameLabel') }}</label>
          <input id="ced-cat-name" v-model="evtCategoryCreateName" class="ced-input" type="text" :placeholder="t('intgCreateEvtCategoryNamePlaceholder')" @keyup.enter="submitEvtCategoryCreate" />
        </div>
      </div>
      <div class="ced-mini__footer">
        <button class="ced-btn ced-btn--ghost" type="button" :disabled="evtCategoryCreateLoading" @click="evtCategoryCreateOpen = false">{{ t('intgCreateEvtCancel') }}</button>
        <button class="ced-btn ced-btn--primary" type="button" :disabled="evtCategoryCreateLoading" @click="submitEvtCategoryCreate">
          <v-progress-circular v-if="evtCategoryCreateLoading" size="14" width="2" indeterminate color="white" />
          <v-icon v-else size="14" color="white">mdi-plus</v-icon>
          {{ t('intgCreateEvtCreate') }}
        </button>
      </div>
    </div>
  </v-dialog>

  <!-- Sub-dialog: Créer une sous-catégorie d'événement -->
  <v-dialog v-model="evtSubCreateOpen" max-width="440" persistent>
    <div class="ced-mini" :class="{ 'ced-mini--dark': isDark }">
      <div class="ced-mini__header">
        <div class="ced-mini__icon"><v-icon size="18" color="white">mdi-shape-plus-outline</v-icon></div>
        <div class="ced-mini__title">{{ t('intgCreateEvtSubDialogTitle') }}</div>
        <button type="button" class="ced-mini__close" :disabled="evtSubCreateLoading" @click="evtSubCreateOpen = false"><v-icon size="18">mdi-close</v-icon></button>
      </div>
      <div class="ced-mini__body">
        <p v-if="newEventCategoryName" class="ced-mini__hint">{{ t('intgCreateEvtLinkedToCategory') }} <strong>{{ newEventCategoryName }}</strong></p>
        <div v-if="evtSubCreateError" class="ced-mini__error"><v-icon size="14" color="#ff3131">mdi-alert-circle</v-icon><span>{{ evtSubCreateError }}</span></div>
        <div class="ced-field-group">
          <label class="ced-label" for="ced-sub-name">{{ t('intgCreateEvtSubNameLabel') }}</label>
          <input id="ced-sub-name" v-model="evtSubCreateName" class="ced-input" type="text" :placeholder="t('intgCreateEvtSubNamePlaceholder')" @keyup.enter="submitEvtSubCreate" />
        </div>
      </div>
      <div class="ced-mini__footer">
        <button class="ced-btn ced-btn--ghost" type="button" :disabled="evtSubCreateLoading" @click="evtSubCreateOpen = false">{{ t('intgCreateEvtCancel') }}</button>
        <button class="ced-btn ced-btn--primary" type="button" :disabled="evtSubCreateLoading" @click="submitEvtSubCreate">
          <v-progress-circular v-if="evtSubCreateLoading" size="14" width="2" indeterminate color="white" />
          <v-icon v-else size="14" color="white">mdi-plus</v-icon>
          {{ t('intgCreateEvtCreate') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { createEvent, getEventTypes, getEventCategories, getEventSubcategories, createEventType, createEventCategory, createEventSubcategory } from '@/api/endpoints/event.api'
import { useI18n } from '@/i18n/useI18n'
import { useTheme } from 'vuetify'

export default {
  name: 'CreateEventDialog',
  setup() {
    const { t } = useI18n()
    const { global } = useTheme()
    return { t, theme: global }
  },
  props: {
    modelValue: { type: Boolean, default: false },
    spaceId: { type: String, required: true },
    prefill: { type: Object, default: null },
  },
  emits: ['update:modelValue', 'created'],
  data() {
    return {
      newEventName: '',
      newEventDate: '',
      newEventEndDate: '',
      newEventEndTime: '',
      newEventTicketsSold: null,
      newEventTicketsScanned: null,
      newEventHasOpeningAct: false,
      newEventHasIntermission: false,
      newEventPerformerName: '',
      newEventSponsor: '',
      newEventOpeningActName: '',
      newEventType: '',
      newEventCategory: '',
      newEventSubcategory: '',
      newEventSessionCount: 1,
      newEventSessions: [{ doorsOpening: '', showTime: '' }],
      newEventOptionalOpen: false,
      // listes pour les selects
      eventTypesList: [],
      eventCategoriesList: [],
      eventSubcategoriesList: [],
      creatingEvent: false,
      // État d'erreur pour le chemin de soumission principal (symétrique aux
      // sous-dialogs type/catégorie/sous-catégorie ci-dessous)
      createEventError: '',
      // inline create: type
      evtTypeCreateOpen: false,
      evtTypeCreateName: '',
      evtTypeCreateLoading: false,
      evtTypeCreateError: '',
      // inline create: catégorie
      evtCategoryCreateOpen: false,
      evtCategoryCreateName: '',
      evtCategoryCreateLoading: false,
      evtCategoryCreateError: '',
      // inline create: sous-catégorie
      evtSubCreateOpen: false,
      evtSubCreateName: '',
      evtSubCreateLoading: false,
      evtSubCreateError: '',
    }
  },
  computed: {
    isDark() {
      return this.theme.current.value.dark
    },
    newEventTypeName() {
      return this.eventTypesList.find(t => t.id === this.newEventType)?.name || ''
    },
    newEventCategoryName() {
      return this.eventCategoriesList.find(c => c.id === this.newEventCategory)?.name || ''
    },
  },
  watch: {
    modelValue(val) {
      if (val) {
        this.newEventName = this.prefill?.name || ''
        this.newEventDate = this.prefill?.date || ''
        this.newEventEndDate = this.prefill?.endDate || ''
        this.newEventEndTime = this.prefill?.endTime || ''
        this.newEventTicketsSold = null
        this.newEventTicketsScanned = null
        this.newEventHasOpeningAct = false
        this.newEventHasIntermission = false
        this.newEventPerformerName = ''
        this.newEventSponsor = ''
        this.newEventOpeningActName = ''
        this.newEventType = ''
        this.newEventCategory = ''
        this.newEventSubcategory = ''
        this.newEventSessionCount = 1
        this.newEventSessions = [{ doorsOpening: '', showTime: '' }]
        this.newEventOptionalOpen = false
        this.createEventError = ''
      }
    },
  },
  mounted() {
    this.loadEventLists()
  },
  methods: {
    async loadEventLists() {
      try {
        const [types, cats, subs] = await Promise.all([
          getEventTypes(),
          getEventCategories(),
          getEventSubcategories(),
        ])
        this.eventTypesList = Array.isArray(types) ? types : (types?.data ?? [])
        this.eventCategoriesList = Array.isArray(cats) ? cats : (cats?.data ?? [])
        this.eventSubcategoriesList = Array.isArray(subs) ? subs : (subs?.data ?? [])
      } catch {
        // Silencieux — les selects resteront vides
      }
    },
    handleNewEventTypeChange(e) {
      const val = e.target.value
      if (val === '__create_type__') {
        // Choisir « Créer… » ne sélectionne PAS l'option : on remet le <select> sur la valeur
        // réelle (Vue ne re-patche pas le DOM car le modèle n'a pas changé) et on ouvre le dialog.
        // Si l'utilisateur le ferme sans créer, le champ reste donc vide/inchangé.
        e.target.value = this.newEventType
        this.evtTypeCreateName = ''
        this.evtTypeCreateError = ''
        this.evtTypeCreateOpen = true
        return
      }
      this.newEventType = val || ''
      this.newEventCategory = ''
      this.newEventSubcategory = ''
    },
    handleNewEventCategoryChange(e) {
      const val = e.target.value
      if (val === '__create_category__') {
        e.target.value = this.newEventCategory
        this.evtCategoryCreateName = ''
        this.evtCategoryCreateError = ''
        this.evtCategoryCreateOpen = true
        return
      }
      this.newEventCategory = val || ''
      this.newEventSubcategory = ''
    },
    handleNewEventSubChange(e) {
      const val = e.target.value
      if (val === '__create_sub__') {
        e.target.value = this.newEventSubcategory
        this.evtSubCreateName = ''
        this.evtSubCreateError = ''
        this.evtSubCreateOpen = true
        return
      }
      this.newEventSubcategory = val || ''
    },
    async submitEvtTypeCreate() {
      const name = this.evtTypeCreateName.trim()
      if (!name) { this.evtTypeCreateError = this.t('intgCreateEvtNameRequired'); return }
      this.evtTypeCreateLoading = true
      this.evtTypeCreateError = ''
      try {
        const res = await createEventType({ name })
        const created = res?.data || res
        const id = created?.id || created?._id
        if (!id) throw new Error(this.t('intgCreateEvtCannotCreateType'))
        this.eventTypesList.push({ ...created, id })
        this.newEventType = id
        this.newEventCategory = ''
        this.newEventSubcategory = ''
        this.evtTypeCreateOpen = false
      } catch (err) {
        this.evtTypeCreateError = err?.response?.data?.message || err?.message || this.t('intgCreateEvtCreateFailed')
      } finally {
        this.evtTypeCreateLoading = false
      }
    },
    async submitEvtCategoryCreate() {
      const name = this.evtCategoryCreateName.trim()
      if (!name) { this.evtCategoryCreateError = this.t('intgCreateEvtNameRequired'); return }
      this.evtCategoryCreateLoading = true
      this.evtCategoryCreateError = ''
      try {
        const res = await createEventCategory({ name, eventTypeId: this.newEventType })
        const created = res?.data || res
        const id = created?.id || created?._id
        if (!id) throw new Error(this.t('intgCreateEvtCannotCreateCategory'))
        this.eventCategoriesList.push({ ...created, id, eventTypeId: created?.eventTypeId || this.newEventType })
        this.newEventCategory = id
        this.newEventSubcategory = ''
        this.evtCategoryCreateOpen = false
      } catch (err) {
        this.evtCategoryCreateError = err?.response?.data?.message || err?.message || this.t('intgCreateEvtCreateFailed')
      } finally {
        this.evtCategoryCreateLoading = false
      }
    },
    async submitEvtSubCreate() {
      const name = this.evtSubCreateName.trim()
      if (!name) { this.evtSubCreateError = this.t('intgCreateEvtNameRequired'); return }
      this.evtSubCreateLoading = true
      this.evtSubCreateError = ''
      try {
        const res = await createEventSubcategory({ name, categoryId: this.newEventCategory })
        const created = res?.data || res
        const id = created?.id || created?._id
        if (!id) throw new Error(this.t('intgCreateEvtCannotCreateSub'))
        this.eventSubcategoriesList.push({ ...created, id, categoryId: created?.categoryId || this.newEventCategory })
        this.newEventSubcategory = id
        this.evtSubCreateOpen = false
      } catch (err) {
        this.evtSubCreateError = err?.response?.data?.message || err?.message || this.t('intgCreateEvtCreateFailed')
      } finally {
        this.evtSubCreateLoading = false
      }
    },
    async submitCreateEvent() {
      if (!this.newEventName || !this.newEventDate) return
      if (this.newEventEndDate && this.newEventEndDate < this.newEventDate) {
        this.createEventError = this.t('intgCreateEvtEndBeforeStart')
        return
      }
      this.creatingEvent = true
      this.createEventError = ''
      try {
        const created = await createEvent({
          name: this.newEventName,
          eventDate: this.newEventDate,
          eventStartDate: this.newEventDate,
          eventEndDate: this.newEventEndDate || this.newEventDate,
          eventEndTime: this.newEventEndTime || undefined,
          spaceId: this.spaceId,
          ticketsSold: this.newEventTicketsSold ?? undefined,
          ticketsScanned: this.newEventTicketsScanned ?? undefined,
          hasOpeningAct: this.newEventHasOpeningAct,
          hasIntermission: this.newEventHasIntermission,
          performerName: this.newEventPerformerName || undefined,
          sponsor: this.newEventSponsor || undefined,
          openingActName: this.newEventOpeningActName || undefined,
          eventTypeId: this.newEventType || undefined,
          eventCategoryId: this.newEventCategory || undefined,
          eventSubcategoryId: this.newEventSubcategory || undefined,
          numberOfSessions: this.newEventSessionCount || 1,
          sessions: this.newEventSessions.slice(0, this.newEventSessionCount),
        })
        const newEvent = created?.data ?? created
        this.$emit('created', { event: newEvent, pendingWeezEventLink: this.prefill?.pendingWeezEventLink || null })
        this.$emit('update:modelValue', false)
      } catch (err) {
        console.error('[CreateEventDialog] Failed to create event:', err)
        // Afficher un état d'erreur visible (comme les sous-dialogs) au lieu d'avaler
        // l'erreur silencieusement ; le dialog reste ouvert, formulaire conservé.
        this.createEventError = err?.response?.data?.message || err?.message || this.t('intgCreateEvtCreateFailed')
      } finally {
        this.creatingEvent = false
      }
    },
  },
}
</script>

<style scoped>
/* ══ Card shell ══════════════════════════════════════════ */
.ced-card {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

/* ══ Header ══════════════════════════════════════════════ */
.ced-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 22px 18px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}
.ced-header-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: #ff3131;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ced-header-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
}
.ced-header-sub {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 1px;
}

/* ══ Scrollable body ═════════════════════════════════════ */
.ced-body {
  padding: 20px 22px 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* ══ Section labels ══════════════════════════════════════ */
.ced-section-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 800;
  color: #ff3131;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 10px;
}

/* ══ Field groups ════════════════════════════════════════ */
.ced-field-group {
  display: flex;
  flex-direction: column;
}
.ced-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 5px;
}
.ced-required {
  color: #ff3131;
}

/* ══ Native inputs ═══════════════════════════════════════ */
.ced-input {
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid #e5e7eb;
  border-radius: 9px;
  font-size: 13.5px;
  color: #111827;
  background-color: #fff;
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
  font-family: inherit;
  box-sizing: border-box;
}
.ced-input:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.10);
}
.ced-input::placeholder {
  color: #c0c5cc;
}
.ced-input:disabled {
  /* background-color (pas le raccourci `background`) : sinon background-image/-repeat/-position
     du chevron .ced-select sont réinitialisés → chevron répété en mosaïque sur un select désactivé. */
  background-color: #f9fafb;
  color: #9ca3af;
  border-color: #f0f0f0;
  cursor: not-allowed;
}
.ced-input[type="date"],
.ced-input[type="time"] {
  cursor: pointer;
}
.ced-input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
}
.ced-input[type="number"]::-webkit-outer-spin-button,
.ced-input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* ══ Select ══════════════════════════════════════════════ */
.ced-select-wrap {
  position: relative;
}
.ced-select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 32px;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
.ced-select:disabled {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath fill='%23d1d5db' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
}

/* ══ Dates row ═══════════════════════════════════════════ */
.ced-dates-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.ced-dates-row .ced-field-group {
  flex: 1;
}
.ced-dates-row .ced-field-group--time {
  flex: 0 0 116px;
}

/* ══ Generic row ═════════════════════════════════════════ */
.ced-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.ced-row .ced-field-group {
  flex: 1;
}

/* ══ Plus d'options toggle ═══════════════════════════════ */
.ced-options-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0 6px;
  cursor: pointer;
}
.ced-options-line {
  flex: 1;
  height: 1px;
  background: #f0f0f0;
}
.ced-options-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  padding: 4px 12px;
  border-radius: 20px;
  border: 1.5px solid #e5e7eb;
  transition: color 0.15s, border-color 0.15s;
  user-select: none;
}
.ced-options-toggle:hover .ced-options-btn {
  color: #ff3131;
  border-color: rgba(255, 49, 49, 0.35);
}
.ced-options-body {
  padding-top: 4px;
}

/* ══ Toggle chips ════════════════════════════════════════ */
.ced-toggle-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 9px;
  border: 1.5px solid #e5e7eb;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.18s ease;
  user-select: none;
  font-family: inherit;
}
.ced-toggle-chip:hover {
  border-color: rgba(255, 49, 49, 0.4);
  color: #ff3131;
}
.ced-toggle-chip--active {
  border-color: #ff3131;
  background: rgba(255, 49, 49, 0.07);
  color: #ff3131;
  font-weight: 600;
}

/* ══ Session cards ═══════════════════════════════════════ */
.ced-session-card {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1.5px solid #f0f0f0;
  background: #fafafa;
}
.ced-session-title {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

/* BUG-273 : barre d'erreur fixe, entre le corps scrollable et le footer. */
.ced-error {
  flex-shrink: 0;
  margin: 0;
  border-radius: 0 !important;
}

/* ══ Footer ══════════════════════════════════════════════ */
.ced-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 22px;
  border-top: 1px solid #f0f0f0;
  flex-shrink: 0;
}
.ced-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 9px;
  font-size: 13.5px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.18s ease;
  font-family: inherit;
}
.ced-btn--ghost {
  background: transparent;
  color: #6b7280;
  border: 1.5px solid #e5e7eb;
}
.ced-btn--ghost:hover {
  background: #f9fafb;
  border-color: #d1d5db;
}
.ced-btn--primary {
  background: #ff3131;
  color: #fff;
}
.ced-btn--primary:hover:not(:disabled) {
  background: #b52020;
}
.ced-btn--primary:disabled {
  background: #f0a0a0;
  cursor: not-allowed;
}

/* ── Dark (BUG-247-01) — palette slate, overrides uniquement, clair inchangé. ── */
.ced-card--dark {
  background: #1e293b;
}
.ced-card--dark .ced-header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}
.ced-card--dark .ced-header-title {
  color: #f9fafb;
}
.ced-card--dark .ced-header-sub {
  color: #94a3b8;
}
.ced-card--dark .ced-label {
  color: #e2e8f0;
}
.ced-card--dark .ced-input {
  border-color: rgba(255, 255, 255, 0.08);
  color: #f9fafb;
  /* background-color (PAS le raccourci `background`) : sinon background-image/-repeat/-position
     du chevron .ced-select sont réinitialisés → chevron tuilé sur toute la largeur en dark. */
  background-color: #0f172a;
  /* Rend la liste déroulante native du <select> et les pickers date/time en thème sombre. */
  color-scheme: dark;
}
.ced-card--dark .ced-input:focus {
  border-color: #ff3131;
}
.ced-card--dark .ced-input::placeholder {
  color: #64748b;
}
.ced-card--dark .ced-input:disabled {
  background-color: rgba(255, 255, 255, 0.04);
  color: #64748b;
  border-color: rgba(255, 255, 255, 0.08);
}
.ced-card--dark .ced-select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath fill='%2394a3b8' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
}
.ced-card--dark .ced-select:disabled {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath fill='%2364748b' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
}
.ced-card--dark .ced-options-line {
  background: rgba(255, 255, 255, 0.08);
}
.ced-card--dark .ced-options-btn {
  color: #94a3b8;
  border-color: rgba(255, 255, 255, 0.08);
}
.ced-card--dark .ced-options-toggle:hover .ced-options-btn {
  color: #ff3131;
  border-color: rgba(255, 49, 49, 0.35);
}
.ced-card--dark .ced-toggle-chip {
  border-color: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}
.ced-card--dark .ced-toggle-chip:hover {
  border-color: rgba(255, 49, 49, 0.4);
  color: #ff3131;
}
.ced-card--dark .ced-toggle-chip--active {
  border-color: #ff3131;
  background: rgba(255, 49, 49, 0.12);
  color: #ff3131;
}
.ced-card--dark .ced-session-card {
  border-color: rgba(255, 255, 255, 0.08);
  background: #0f172a;
}
.ced-card--dark .ced-session-title {
  color: #94a3b8;
}
.ced-card--dark .ced-footer {
  border-top-color: rgba(255, 255, 255, 0.08);
}
.ced-card--dark .ced-btn--ghost {
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.08);
}
.ced-card--dark .ced-btn--ghost:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.14);
}
.ced-card--dark .ced-btn--primary:disabled {
  background: rgba(255, 49, 49, 0.35);
  color: rgba(255, 255, 255, 0.6);
}

/* ══ Sous-dialogs Type / Catégorie / Sous-catégorie (charte) ═════════════ */
.ced-mini { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.18); }
.ced-mini__header { display: flex; align-items: center; gap: 12px; padding: 16px 18px; background: #ff3131; }
.ced-mini__icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ced-mini__title { flex: 1; min-width: 0; color: #fff; font-size: 14px; font-weight: 700; }
.ced-mini__close { width: 30px; height: 30px; border: none; border-radius: 8px; background: rgba(255,255,255,.18); color: rgba(255,255,255,.9); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background .18s; flex-shrink: 0; }
.ced-mini__close:hover:not(:disabled) { background: rgba(255,255,255,.3); }
.ced-mini__close:disabled { opacity: .5; cursor: not-allowed; }
.ced-mini__body { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.ced-mini__hint { font-size: 12.5px; color: #6b7280; margin: 0; }
.ced-mini__hint strong { color: #111827; }
.ced-mini__error { display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 9px; font-size: 12.5px; }
.ced-mini__footer { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 18px; border-top: 1px solid #f0f0f0; background: #fafafa; }

/* Dark */
.ced-mini--dark { background: #1e293b; }
.ced-mini--dark .ced-mini__body { background: #1e293b; }
.ced-mini--dark .ced-label { color: #e2e8f0; }
.ced-mini--dark .ced-input { border-color: rgba(255,255,255,.08); color: #f9fafb; background-color: #0f172a; color-scheme: dark; }
.ced-mini--dark .ced-input:focus { border-color: #ff3131; }
.ced-mini--dark .ced-input::placeholder { color: #64748b; }
.ced-mini--dark .ced-mini__hint { color: #94a3b8; }
.ced-mini--dark .ced-mini__hint strong { color: #f3f4f6; }
.ced-mini--dark .ced-mini__error { background: rgba(255,49,49,.12); border-color: rgba(255,49,49,.3); color: #fca5a5; }
.ced-mini--dark .ced-mini__footer { background: #0f172a; border-top-color: rgba(255,255,255,.08); }
.ced-mini--dark .ced-btn--ghost { color: #e2e8f0; border-color: rgba(255,255,255,.08); }
.ced-mini--dark .ced-btn--ghost:hover { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.14); }
</style>
