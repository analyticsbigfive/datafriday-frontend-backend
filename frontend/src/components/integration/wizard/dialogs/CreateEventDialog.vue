<template>
  <!-- Dialog création d'événement depuis date non couverte -->
  <v-dialog :model-value="modelValue" max-width="560" persistent @update:model-value="$emit('update:modelValue', $event)">
    <div class="ced-card">

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

        <v-alert v-if="createEventError" type="error" variant="tonal" density="compact" class="mb-4">{{ createEventError }}</v-alert>

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
          <div class="ced-label-row">
            <label class="ced-label" for="ced-event-type">{{ t('intgCreateEvtTypeLabel') }}</label>
            <button class="ced-create-link" type="button" @click="evtTypeCreateOpen = true">{{ t('intgCreateEvtCreateType') }}</button>
          </div>
          <div class="ced-select-wrap">
            <select
              id="ced-event-type"
              class="ced-input ced-select"
              :value="newEventType"
              @change="handleNewEventTypeChange($event.target.value)"
            >
              <option value="">{{ t('intgCreateEvtSelectPlaceholder') }}</option>
              <option v-for="item in eventTypesList" :key="item.id" :value="item.id">{{ item.name }}</option>
            </select>
          </div>
        </div>

        <div class="ced-field-group mb-3">
          <div class="ced-label-row">
            <label class="ced-label" for="ced-event-category" :class="{ 'ced-label--disabled': !newEventType }">{{ t('intgCreateEvtCategoryLabel') }}</label>
            <button v-if="newEventType" class="ced-create-link" type="button" @click="evtCategoryCreateOpen = true">{{ t('intgCreateEvtCreateCategory') }}</button>
          </div>
          <div class="ced-select-wrap">
            <select
              id="ced-event-category"
              class="ced-input ced-select"
              :value="newEventCategory"
              :disabled="!newEventType"
              @change="handleNewEventCategoryChange($event.target.value)"
            >
              <option value="">{{ t('intgCreateEvtSelectPlaceholder') }}</option>
              <option
                v-for="item in eventCategoriesList.filter(c => c.eventTypeId === newEventType)"
                :key="item.id"
                :value="item.id"
              >{{ item.name }}</option>
            </select>
          </div>
        </div>

        <div class="ced-field-group mb-2">
          <div class="ced-label-row">
            <label class="ced-label" for="ced-event-subcategory" :class="{ 'ced-label--disabled': !newEventCategory }">{{ t('intgCreateEvtSubcategoryLabel') }}</label>
            <button v-if="newEventCategory" class="ced-create-link" type="button" @click="evtSubCreateOpen = true">{{ t('intgCreateEvtCreateSubcategory') }}</button>
          </div>
          <div class="ced-select-wrap">
            <select
              id="ced-event-subcategory"
              class="ced-input ced-select"
              :value="newEventSubcategory"
              :disabled="!newEventCategory"
              @change="handleNewEventSubChange($event.target.value)"
            >
              <option value="">{{ t('intgCreateEvtSelectPlaceholder') }}</option>
              <option
                v-for="item in eventSubcategoriesList.filter(s => { const id = s.eventCategoryId ?? s.categoryId ?? s.category_id; return String(id) === String(newEventCategory) })"
                :key="item.id"
                :value="item.id"
              >{{ item.name }}</option>
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
    <v-card rounded="xl">
      <v-card-title class="text-subtitle-1 font-weight-bold pt-5 px-5">{{ t('intgCreateEvtTypeDialogTitle') }}</v-card-title>
      <v-card-text class="px-5 pb-2">
        <v-alert v-if="evtTypeCreateError" type="error" variant="tonal" density="compact" class="mb-4">{{ evtTypeCreateError }}</v-alert>
        <v-text-field v-model="evtTypeCreateName" :label="t('intgCreateEvtTypeNameLabel')" variant="outlined" density="comfortable" hide-details :placeholder="t('intgCreateEvtTypeNamePlaceholder')" color="#ff3131" @keyup.enter="submitEvtTypeCreate" />
      </v-card-text>
      <v-card-actions class="px-5 pb-5 pt-3">
        <v-spacer />
        <v-btn variant="text" :disabled="evtTypeCreateLoading" @click="evtTypeCreateOpen = false">{{ t('intgCreateEvtCancel') }}</v-btn>
        <v-btn color="#ff3131" variant="flat" rounded="lg" :loading="evtTypeCreateLoading" @click="submitEvtTypeCreate">{{ t('intgCreateEvtCreate') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Sub-dialog: Créer une catégorie d'événement -->
  <v-dialog v-model="evtCategoryCreateOpen" max-width="440" persistent>
    <v-card rounded="xl">
      <v-card-title class="text-subtitle-1 font-weight-bold pt-5 px-5">{{ t('intgCreateEvtCategoryDialogTitle') }}</v-card-title>
      <v-card-text class="px-5 pb-2">
        <p v-if="newEventTypeName" class="text-body-2 text-medium-emphasis mb-3">{{ t('intgCreateEvtLinkedToType') }} <strong>{{ newEventTypeName }}</strong></p>
        <v-alert v-if="evtCategoryCreateError" type="error" variant="tonal" density="compact" class="mb-4">{{ evtCategoryCreateError }}</v-alert>
        <v-text-field v-model="evtCategoryCreateName" :label="t('intgCreateEvtCategoryNameLabel')" variant="outlined" density="comfortable" hide-details :placeholder="t('intgCreateEvtCategoryNamePlaceholder')" color="#ff3131" @keyup.enter="submitEvtCategoryCreate" />
      </v-card-text>
      <v-card-actions class="px-5 pb-5 pt-3">
        <v-spacer />
        <v-btn variant="text" :disabled="evtCategoryCreateLoading" @click="evtCategoryCreateOpen = false">{{ t('intgCreateEvtCancel') }}</v-btn>
        <v-btn color="#ff3131" variant="flat" rounded="lg" :loading="evtCategoryCreateLoading" @click="submitEvtCategoryCreate">{{ t('intgCreateEvtCreate') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Sub-dialog: Créer une sous-catégorie d'événement -->
  <v-dialog v-model="evtSubCreateOpen" max-width="440" persistent>
    <v-card rounded="xl">
      <v-card-title class="text-subtitle-1 font-weight-bold pt-5 px-5">{{ t('intgCreateEvtSubDialogTitle') }}</v-card-title>
      <v-card-text class="px-5 pb-2">
        <p v-if="newEventCategoryName" class="text-body-2 text-medium-emphasis mb-3">{{ t('intgCreateEvtLinkedToCategory') }} <strong>{{ newEventCategoryName }}</strong></p>
        <v-alert v-if="evtSubCreateError" type="error" variant="tonal" density="compact" class="mb-4">{{ evtSubCreateError }}</v-alert>
        <v-text-field v-model="evtSubCreateName" :label="t('intgCreateEvtSubNameLabel')" variant="outlined" density="comfortable" hide-details :placeholder="t('intgCreateEvtSubNamePlaceholder')" color="#ff3131" @keyup.enter="submitEvtSubCreate" />
      </v-card-text>
      <v-card-actions class="px-5 pb-5 pt-3">
        <v-spacer />
        <v-btn variant="text" :disabled="evtSubCreateLoading" @click="evtSubCreateOpen = false">{{ t('intgCreateEvtCancel') }}</v-btn>
        <v-btn color="#ff3131" variant="flat" rounded="lg" :loading="evtSubCreateLoading" @click="submitEvtSubCreate">{{ t('intgCreateEvtCreate') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { createEvent, getEventTypes, getEventCategories, getEventSubcategories, createEventType, createEventCategory, createEventSubcategory } from '@/api/endpoints/event.api'
import { useI18n } from '@/i18n/useI18n'

export default {
  name: 'CreateEventDialog',
  setup() {
    const { t } = useI18n()
    return { t }
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
    newEventTypeSelectItems() {
      return [...this.eventTypesList, { id: '__create_type__', name: '+ Créer un type…' }]
    },
    newEventCategorySelectItems() {
      const filtered = this.eventCategoriesList.filter(c => !this.newEventType || c.eventTypeId === this.newEventType)
      return [...filtered, { id: '__create_category__', name: '+ Créer une catégorie…' }]
    },
    newEventSubSelectItems() {
      const filtered = this.eventSubcategoriesList.filter(s => {
        if (!this.newEventCategory) return true
        const catId = s.eventCategoryId ?? s.categoryId ?? s.category_id ?? s.category?.id
        return String(catId) === String(this.newEventCategory)
      })
      return [...filtered, { id: '__create_sub__', name: '+ Créer une sous-catégorie…' }]
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
    handleNewEventTypeChange(val) {
      if (val === '__create_type__') {
        this.evtTypeCreateName = ''
        this.evtTypeCreateError = ''
        this.evtTypeCreateOpen = true
        return
      }
      this.newEventType = val || ''
      this.newEventCategory = ''
      this.newEventSubcategory = ''
    },
    handleNewEventCategoryChange(val) {
      if (val === '__create_category__') {
        this.evtCategoryCreateName = ''
        this.evtCategoryCreateError = ''
        this.evtCategoryCreateOpen = true
        return
      }
      this.newEventCategory = val || ''
      this.newEventSubcategory = ''
    },
    handleNewEventSubChange(val) {
      if (val === '__create_sub__') {
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
.ced-label--disabled {
  color: #d1d5db;
}
.ced-required {
  color: #ff3131;
}
.ced-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
}
.ced-create-link {
  font-size: 11px;
  font-weight: 600;
  color: #ff3131;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  line-height: 1;
}
.ced-create-link:hover {
  text-decoration: underline;
}

/* ══ Native inputs ═══════════════════════════════════════ */
.ced-input {
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid #e5e7eb;
  border-radius: 9px;
  font-size: 13.5px;
  color: #111827;
  background: #fff;
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
  background: #f9fafb;
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
</style>
