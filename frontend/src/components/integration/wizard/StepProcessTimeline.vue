<template>
  <div class="spt-root" :class="{ 'spt--dark': isDark }">

    <!-- ── Gradient Header ── -->
    <div class="spt-header">
      <div class="spt-header__icon">
        <v-icon color="white" size="22">mdi-calendar-alert</v-icon>
      </div>
      <div class="spt-header__body">
        <p class="spt-header__title">
          {{ t('intgTimelineHeaderTitle') }}
          <span class="spt-header__step">{{ t('intgTimelineHeaderStep') }}</span>
        </p>
        <p class="spt-header__sub">
          {{ t('intgTimelineHeaderSub') }}
        </p>
      </div>
      <span
        class="spt-prog-badge"
        :class="!unregisteredDates || unregisteredDates.length === 0 ? 'spt-prog-badge--green' : 'spt-prog-badge--gray'"
      >
        <v-icon size="11">{{ !unregisteredDates || unregisteredDates.length === 0 ? 'mdi-check-circle' : 'mdi-alert' }}</v-icon>
        {{ unregisteredDates ? unregisteredDates.length : 0 }} {{ t('intgTimelineUncoveredDatesCount') }}
      </span>
    </div>

    <div class="spt-content">

      <!-- ── Transaction stats banner ── -->
      <div
        v-if="transactionStats"
        class="spt-stats-banner"
        :style="isDark ? 'background: rgba(124,58,237,0.1); border-color: rgba(124,58,237,0.3);' : ''"
      >
        <div class="spt-stats-banner__top">
          <v-icon color="deep-purple" size="16">mdi-swap-horizontal</v-icon>
          <span class="spt-stats-banner__total">
            {{ transactionStats.total.toLocaleString('fr-FR') }} {{ t('intgTimelineWeezeventTransactions') }}
          </span>
        </div>
        <div class="spt-stats-banner__chips">
          <span class="spt-chip spt-chip--green">
            <v-icon size="11">mdi-check-circle</v-icon>
            {{ transactionStats.matched.toLocaleString('fr-FR') }} {{ t('intgTimelineLinkedToEvent') }}
          </span>
          <span
            class="spt-chip"
            :class="transactionStats.unmatched > 0 ? 'spt-chip--red' : 'spt-chip--green'"
          >
            <v-icon size="11">{{ transactionStats.unmatched > 0 ? 'mdi-alert-circle' : 'mdi-check-circle' }}</v-icon>
            {{ transactionStats.unmatched.toLocaleString('fr-FR') }} {{ t('intgTimelineWithoutEvent') }}
          </span>
          <span
            v-if="transactionStats.unmappedLocationIds?.length > 0"
            class="spt-chip spt-chip--amber"
          >
            <v-icon size="11">mdi-store-alert</v-icon>
            {{ transactionStats.unmappedLocationIds.length }} {{ t('intgTimelineUnmappedLocations') }}
          </span>
        </div>
      </div>

      <!-- ── Loading ── -->
      <div v-if="loading" class="spt-skeletons">
        <div v-for="i in 5" :key="i" class="spt-skeleton-row"></div>
      </div>

      <template v-else>

        <!-- ── Bulk create banner ── -->
        <div
          v-if="(unmappedCount > 0 || patchableEventsCount > 0) && !bulkCreateEventsRunning"
          class="spt-banner spt-banner--blue"
        >
          <div class="spt-banner__left">
            <v-icon size="16" color="#2563eb">mdi-calendar-plus</v-icon>
            <span>
              <template v-if="unmappedCount > 0">
                <strong>{{ unmappedCount }}</strong> {{ t('intgTimelineEvent') }}{{ unmappedCount > 1 ? 's' : '' }} {{ t('intgTimelineWeezeventUnlinked') }}{{ unmappedCount > 1 ? 's' : '' }}
                <template v-if="patchableEventsCount > 0"> · <strong>{{ patchableEventsCount }}</strong> {{ t('intgTimelineWithoutSpace') }}</template>
                {{ t('intgTimelineCreateAndAttachAuto') }}
              </template>
              <template v-else>
                <strong>{{ patchableEventsCount }}</strong> {{ t('intgTimelineEvent') }}{{ patchableEventsCount > 1 ? 's' : '' }} {{ t('intgTimelineLinked') }}{{ patchableEventsCount > 1 ? 's' : '' }} {{ t('intgTimelineWithoutSpaceAttachAuto') }}
              </template>
            </span>
          </div>
          <button class="spt-banner-btn spt-banner-btn--blue" @click="bulkCreateEvents">
            <v-icon size="14">mdi-creation</v-icon>
            {{ t('intgTimelineCreateAndLinkAll') }}
          </button>
        </div>

        <!-- ── Tabs ── -->
        <div class="spt-toolbar">
          <div class="spt-tabs">
            <button
              class="spt-tab"
              :class="{ 'spt-tab--active': activeTab === 'covered' }"
              @click="activeTab = 'covered'"
            >
              <v-icon size="12" :color="activeTab === 'covered' ? '#16a34a' : '#9ca3af'">mdi-check-circle</v-icon>
              {{ t('intgTimelineTabCovered') }}
              <span class="spt-tab__count spt-tab__count--green">{{ registeredEvents.length }}</span>
            </button>
            <button
              class="spt-tab"
              :class="{ 'spt-tab--active': activeTab === 'uncovered' }"
              @click="activeTab = 'uncovered'"
            >
              <v-icon size="12" :color="activeTab === 'uncovered' ? '#f59e0b' : '#9ca3af'">mdi-calendar-alert</v-icon>
              {{ t('intgTimelineTabUncovered') }}
              <span
                class="spt-tab__count"
                :class="(unregisteredDates?.length || 0) > 0 ? 'spt-tab__count--amber' : 'spt-tab__count--gray'"
              >{{ unregisteredDates ? unregisteredDates.length : 0 }}</span>
            </button>
            <button
              class="spt-tab"
              :class="{ 'spt-tab--active': activeTab === 'all' }"
              @click="activeTab = 'all'"
            >
              {{ t('intgTimelineTabAll') }}
              <span class="spt-tab__count spt-tab__count--gray">{{ (unregisteredDates ? unregisteredDates.length : 0) + registeredEvents.length }}</span>
            </button>
          </div>
        </div>

        <!-- ── Tab: Non couvertes ── -->
        <template v-if="activeTab === 'uncovered' || activeTab === 'all'">
          <p v-if="activeTab === 'all' && unregisteredDates && unregisteredDates.length > 0" class="spt-section-label spt-section-label--amber">
            <v-icon size="13" color="#f59e0b">mdi-alert</v-icon>
            {{ t('intgTimelineDatesWithoutDfEvent') }}
          </p>

          <template v-if="unregisteredDates && unregisteredDates.length > 0">
            <!-- Column headers -->
            <div class="spt-list__header">
              <div class="spt-list__header-col">{{ t('intgTimelineColDate') }}</div>
              <div class="spt-list__header-col">{{ t('intgTimelineColTransactions') }}</div>
              <div class="spt-list__header-col spt-list__header-col--right">{{ t('intgTimelineColActions') }}</div>
            </div>

            <!-- Uncovered rows -->
            <div class="spt-list spt-list--uncovered">
              <div
                v-for="item in unregisteredDates.slice((uncoveredPage - 1) * pageSize, uncoveredPage * pageSize)"
                :key="item.date || item.start"
                class="spt-row spt-row--uncovered"
              >
                <div class="spt-row__date">
                  <span class="spt-row__date-dot spt-row__date-dot--amber"></span>
                  <span class="spt-row__date-text">{{ formatDate(item.date || item.start) }}</span>
                </div>
                <div class="spt-row__transactions">
                  <span class="spt-chip spt-chip--gray">{{ item.transactionCount ?? item.transactions ?? 0 }} tx</span>
                </div>
                <div class="spt-row__actions">
                  <button class="spt-act-btn spt-act-btn--blue" @click="handleMapToEvent(item)">
                    <v-icon size="12">mdi-link-variant</v-icon>
                    {{ t('intgTimelineBtnMap') }}
                  </button>
                  <button class="spt-act-btn spt-act-btn--amber" @click="handleCreateEventFromDate(item)">
                    <v-icon size="12">mdi-plus</v-icon>
                    {{ t('intgTimelineBtnCreate') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Pagination -->
            <div v-if="unregisteredDates.length > pageSize" class="spt-pagination">
              <button
                class="spt-page-btn"
                :disabled="uncoveredPage === 1"
                @click="uncoveredPage--"
              >&#8249;</button>
              <span class="spt-page-info">
                {{ uncoveredPage }} / {{ Math.ceil(unregisteredDates.length / pageSize) }}
              </span>
              <button
                class="spt-page-btn"
                :disabled="uncoveredPage >= Math.ceil(unregisteredDates.length / pageSize)"
                @click="uncoveredPage++"
              >&#8250;</button>
            </div>
          </template>

          <div v-else-if="activeTab === 'uncovered'" class="spt-infobar spt-infobar--success">
            <v-icon size="16" color="#166534">mdi-check-circle</v-icon>
            <span><strong>{{ t('intgTimelineAllCoveredTitle') }}</strong> {{ t('intgTimelineAllCoveredSub') }}</span>
          </div>
        </template>

        <!-- ── Tab: Couvertes ── -->
        <template v-if="activeTab === 'covered' || activeTab === 'all'">
          <p v-if="activeTab === 'all' && registeredEvents.length > 0" class="spt-section-label spt-section-label--green">
            <v-icon size="13" color="#16a34a">mdi-check-circle</v-icon>
            {{ t('intgTimelineDfEventsCreated') }}
          </p>

          <template v-if="registeredEvents.length > 0">
            <!-- Column headers -->
            <div class="spt-list__header spt-list__header--covered">
              <div class="spt-list__header-col">{{ t('intgTimelineColDateName') }}</div>
              <div class="spt-list__header-col">
                {{ t('intgTimelineColDataPoints') }}
                <v-tooltip location="top" max-width="300">
                  <template #activator="{ props }">
                    <v-icon v-bind="props" size="11" class="ml-1" color="#9ca3af">mdi-information-outline</v-icon>
                  </template>
                  {{ t('intgTimelineDataPointTooltip') }}
                </v-tooltip>
              </div>
              <div class="spt-list__header-col">{{ t('intgTimelineColStatus') }}</div>
              <div class="spt-list__header-col spt-list__header-col--right">{{ t('intgTimelineColActions') }}</div>
            </div>

            <!-- Covered rows -->
            <div class="spt-list">
              <div
                v-for="item in registeredEvents.slice((coveredPage - 1) * pageSize, coveredPage * pageSize)"
                :key="item.id"
                class="spt-row spt-row--covered"
                :class="{ 'spt-row--aggregated': item.aggregationStatus === 'completed' }"
              >
                <!-- Date / Name -->
                <div class="spt-row__event-info">
                  <span class="spt-row__date-dot" :class="item.aggregationStatus === 'completed' ? 'spt-row__date-dot--green' : 'spt-row__date-dot--gray'"></span>
                  <div style="min-width: 0;">
                    <span class="spt-row__date-text">
                      {{ formatDate(item.startDate || item.eventDate || item.date) }}
                      <span v-if="item.endDate && item.endDate !== (item.startDate || item.eventDate || item.date)"> — {{ formatDate(item.endDate) }}</span>
                    </span>
                    <div v-if="item.name || item.eventName" class="spt-row__event-name">
                      {{ item.name || item.eventName }}
                    </div>
                  </div>
                </div>

                <!-- Data points -->
                <div class="spt-row__datapoints">
                  <span v-if="item.dataPoints" class="spt-chip spt-chip--green">{{ item.dataPoints }}</span>
                  <span v-else class="spt-row__empty">—</span>
                </div>

                <!-- Status -->
                <div class="spt-row__status">
                  <span
                    class="spt-badge"
                    :class="item.aggregationStatus === 'completed' ? 'spt-badge--green' : 'spt-badge--gray'"
                  >
                    {{ item.aggregationStatus === 'completed' ? t('intgTimelineStatusAggregated') : t('intgTimelineStatusUnprocessed') }}
                  </span>
                </div>

                <!-- Actions -->
                <div class="spt-row__actions spt-row__actions--col">
                  <div class="spt-row__actions-row">
                    <button
                      v-if="item.aggregationStatus === 'completed'"
                      class="spt-act-btn spt-act-btn--teal"
                      :title="t('intgTimelineViewAnalysisTooltip')"
                      @click="handleToggleBreakdown(item)"
                    >
                      <v-icon size="12">mdi-chart-bar</v-icon>
                      {{ t('intgTimelineBtnAnalysis') }}
                    </button>
                    <button
                      class="spt-act-btn"
                      :class="item.aggregationStatus === 'completed' ? 'spt-act-btn--gray' : 'spt-act-btn--purple'"
                      :disabled="processingEventId === item.id"
                      :title="item.aggregationStatus === 'completed' ? t('intgTimelineRerunAggTooltip') : t('intgTimelineRunAggTooltip')"
                      @click="handleProcessSingle(item.id)"
                    >
                      <v-progress-circular v-if="processingEventId === item.id" indeterminate size="11" width="2" color="currentColor" />
                      <v-icon v-else size="12">mdi-cog-play</v-icon>
                      {{ item.aggregationStatus === 'completed' ? t('intgTimelineBtnRerun') : t('intgTimelineBtnAggregate') }}
                    </button>
                    <button
                      class="spt-act-btn spt-act-btn--red"
                      :disabled="deletingEventId === item.id"
                      @click="handleDeleteEvent(item)"
                    >
                      <v-progress-circular v-if="deletingEventId === item.id" indeterminate size="11" width="2" color="currentColor" />
                      <v-icon v-else size="12">mdi-delete-outline</v-icon>
                      {{ t('intgTimelineBtnDelete') }}
                    </button>
                  </div>

                  <!-- Inline progress bar when aggregating -->
                  <div v-if="processingEventId === item.id && currentEventProgress" class="spt-inline-progress">
                    <v-progress-linear
                      :model-value="currentEventProgress.percentage"
                      color="#7c3aed"
                      height="3"
                      rounded
                    />
                    <div class="spt-inline-progress__labels">
                      <span>{{ currentEventProgress.phase }}</span>
                      <span>{{ currentEventProgress.percentage }}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Pagination -->
            <div v-if="registeredEvents.length > pageSize" class="spt-pagination">
              <button
                class="spt-page-btn"
                :disabled="coveredPage === 1"
                @click="coveredPage--"
              >&#8249;</button>
              <span class="spt-page-info">
                {{ coveredPage }} / {{ Math.ceil(registeredEvents.length / pageSize) }}
              </span>
              <button
                class="spt-page-btn"
                :disabled="coveredPage >= Math.ceil(registeredEvents.length / pageSize)"
                @click="coveredPage++"
              >&#8250;</button>
            </div>
          </template>

          <div v-if="registeredEvents.length === 0 && activeTab === 'covered'" class="spt-infobar spt-infobar--blue">
            <v-icon size="16" color="#2563eb">mdi-information-outline</v-icon>
            <span>{{ t('intgTimelineNoDfEvents') }}</span>
          </div>
        </template>

      </template>

      <!-- ── Error ── -->
      <div v-if="error" class="spt-infobar spt-infobar--error" style="margin-top: 4px;">
        <v-icon size="16" color="#ff3131">mdi-alert-circle</v-icon>
        <span>{{ error }}</span>
      </div>

      <!-- ── Divider ── -->
      <div class="spt-divider"></div>

      <!-- ── Sync section heading ── -->
      <div class="spt-sync-heading">
        <div class="spt-sync-heading__left">
          <div class="spt-sync-heading__icon">
            <v-icon color="white" size="16">mdi-sync</v-icon>
          </div>
          <span class="spt-sync-heading__title">{{ syncBlockTitle }}</span>
        </div>
        <span v-if="syncPhase === 'done'" class="spt-badge spt-badge--green">{{ t('intgTimelineSyncDoneBadge') }}</span>
      </div>

      <!-- Sync: Idle -->
      <div
        v-if="syncPhase === 'idle'"
        class="spt-sync-card"
        :style="isDark ? 'background: rgba(255, 49, 49,0.08); border-color: rgba(255, 49, 49,0.25);' : ''"
      >
        <div class="spt-sync-card__icon">
          <v-icon color="#ff3131" size="26">mdi-lightning-bolt</v-icon>
        </div>
        <div class="spt-sync-card__body">
          <p class="spt-sync-card__title">{{ syncPrimaryText }}</p>
          <p class="spt-sync-card__sub">{{ syncSecondaryText }}</p>
          <button class="spt-btn spt-btn--primary" style="margin-top: 12px;" @click="handleSync">
            <v-icon size="15">{{ syncActionIcon }}</v-icon>
            {{ syncActionLabel }}
          </button>
        </div>
      </div>

      <!-- Sync: Running -->
      <div v-else-if="syncPhase === 'syncing'" class="spt-sync-running">
        <div class="spt-sync-running__top">
          <span class="spt-sync-running__label">{{ syncingLabel }}</span>
          <span class="spt-sync-running__elapsed">{{ elapsedFormatted }}</span>
        </div>

        <div v-if="syncExecutionMode === 'full'" class="spt-sync-steps">
          <div v-for="(step, idx) in syncSteps" :key="step.key" class="spt-sync-step">
            <v-progress-circular v-if="step.status === 'running'" indeterminate size="16" width="2" color="#ff3131" />
            <v-icon v-else-if="step.status === 'done'" size="16" color="#16a34a">mdi-check-circle</v-icon>
            <v-icon v-else size="16" color="#d1d5db">mdi-circle-outline</v-icon>
            <span class="spt-sync-step__label" :class="step.status === 'pending' ? 'spt-sync-step__label--dim' : ''">
              {{ t('intgTimelinePhase') }} {{ idx + 1 }}/4 : {{ step.label }}
            </span>
          </div>
        </div>

        <div v-else class="spt-sync-verify">
          <v-progress-circular indeterminate size="16" width="2" color="#ff3131" />
          <span>{{ t('intgTimelineVerifyingStatuses') }}</span>
        </div>

        <v-progress-linear :model-value="overallSyncProgress" color="#ff3131" height="4" rounded class="mt-3" />
        <p class="spt-sync-running__pct">{{ overallSyncProgress }}%</p>
      </div>

      <!-- Sync: Done -->
      <div v-else-if="syncPhase === 'done'" class="spt-infobar spt-infobar--success">
        <v-icon size="16" color="#16a34a">mdi-check-circle</v-icon>
        <div style="flex: 1;">
          <strong>{{ syncDoneTitle }}</strong>
          <span style="margin-left: 8px; font-size: 12px; color: #6b7280;">{{ syncDoneSummary }}</span>
        </div>
        <button class="spt-act-btn spt-act-btn--green" @click="handleRetry">
          <v-icon size="12">mdi-refresh</v-icon>
          {{ t('intgTimelineBtnRerun') }}
        </button>
      </div>

      <!-- Sync: Error -->
      <div v-else-if="syncPhase === 'error'" class="spt-infobar spt-infobar--error">
        <v-icon size="16" color="#ff3131">mdi-alert-circle</v-icon>
        <span style="flex: 1;">{{ syncError || t('intgTimelineSyncError') }}</span>
        <button class="spt-act-btn spt-act-btn--red" @click="handleRetry">{{ t('intgTimelineBtnRetry') }}</button>
      </div>

      <!-- ── Footer actions (teleported) ── -->
      <Teleport :to="footerTarget" :disabled="!footerTarget">
        <div class="spt-footer-actions">
          <span></span>
          <button class="spt-btn spt-btn--primary" @click="$emit('completed', { events: processedCount })">
            {{ t('intgTimelineFinishConfig') }}
            <v-icon size="16">mdi-check</v-icon>
          </button>
        </div>
      </Teleport>

    </div><!-- end spt-content -->

    <!-- ── Dialog: Bulk create events ── -->
    <v-dialog v-model="bulkCreateEventsDialog" max-width="420" :persistent="bulkCreateEventsRunning">
      <div class="spt-dialog">
        <div class="spt-dialog-header">
          <div class="spt-dialog-header__icon">
            <v-icon color="white" size="20">mdi-creation</v-icon>
          </div>
          <div>
            <p class="spt-dialog-header__title">{{ t('intgTimelineBulkTitle') }}</p>
            <p class="spt-dialog-header__sub">{{ t('intgTimelineBulkSub') }}</p>
          </div>
        </div>

        <div class="spt-dialog-body" style="text-align: center;">
          <div style="display: flex; justify-content: center; margin-bottom: 20px;">
            <v-progress-circular
              v-if="bulkCreateEventsRunning"
              indeterminate color="#ff3131" size="56" width="4"
            />
            <v-icon v-else-if="bulkCreateEventsPhase === 'done'" color="#16a34a" size="56">mdi-check-circle</v-icon>
            <v-icon v-else color="#ff3131" size="56">mdi-alert-circle</v-icon>
          </div>

          <p class="spt-dialog-result__title">
            <template v-if="bulkCreateEventsPhase === 'patching'">{{ t('intgTimelineBulkPatchingTitle') }}</template>
            <template v-else-if="bulkCreateEventsPhase === 'creating'">{{ t('intgTimelineBulkCreatingTitle') }}</template>
            <template v-else-if="bulkCreateEventsPhase === 'done'">{{ t('intgTimelineBulkDoneTitle') }}</template>
            <template v-else>{{ t('intgTimelineBulkInterruptedTitle') }}</template>
          </p>
          <p class="spt-dialog-result__sub">
            <template v-if="bulkCreateEventsPhase === 'patching'">
              {{ t('intgTimelineBulkPatchingSub') }}
            </template>
            <template v-else-if="bulkCreateEventsPhase === 'creating'">
              {{ bulkCreateEventsProgress }} / {{ bulkCreateEventsTotal }} {{ t('intgTimelineBulkEventsProcessed') }}
            </template>
            <template v-else>{{ bulkCreateEventsMessage }}</template>
          </p>
          <div v-if="bulkCreateEventsErrors > 0" class="spt-infobar spt-infobar--error" style="margin-top: 12px; text-align: left;">
            <v-icon size="13" color="#ff3131">mdi-alert-circle</v-icon>
            <span>{{ bulkCreateEventsErrors }} {{ t('intgTimelineBulkEventsFailed') }}</span>
          </div>
        </div>

        <div v-if="!bulkCreateEventsRunning" class="spt-dialog-footer">
          <button class="spt-btn spt-btn--primary" @click="bulkCreateEventsDialog = false">{{ t('intgTimelineBtnClose') }}</button>
        </div>
      </div>
    </v-dialog>

    <!-- ── Dialog: mapper date → événement existant ── -->
    <MapEventToExistingDialog
      v-model="mapToEventDialog"
      :item="mapToEventItem"
      :formatted-date="mapToEventItem ? formatDate(mapToEventItem.date || mapToEventItem.start) : ''"
      :events="registeredEvents"
      :loading="mappingEventLoading"
      @confirm="confirmMapToEvent"
    />

    <!-- ── Dialog: création d'événement depuis date non couverte ── -->
    <CreateEventDialog
      v-model="createEventDialog"
      :space-id="spaceId"
      :prefill="createEventPrefill"
      @created="handleEventCreated"
    />

    <!-- ── Dialog: enrichissement metadata ── -->
    <EnrichEventDialog
      v-model="enrichDialog"
      :event="enrichingEvent"
      :saving="enrichSaving"
      @save="saveEnrichment"
    />

    <!-- ── Snackbar feedback ── -->
    <v-snackbar v-model="feedbackSnackbar" :color="feedbackSnackbarColor" timeout="3000" location="bottom right">
      {{ feedbackSnackbarText }}
    </v-snackbar>

    <!-- ── Breakdown drawer ── -->
    <EventBreakdownDrawer
      v-model="breakdownDrawer"
      :data="breakdownData"
      :loading="breakdownLoading"
      :error="breakdownError"
      :formatted-date="breakdownData ? formatDate(breakdownData.eventDate) : ''"
      :chart-rows="minuteChartData[expandedEventId]?.data || []"
      :chart-loading="!!minuteChartLoading[expandedEventId]"
      @load-chart="handleBreakdownChartTabClick({ id: expandedEventId })"
    />

  </div>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'
import { useTimelineProcessing } from '@/composables/useTimelineProcessing'
import { useSynchronization } from '@/composables/useSynchronization'
import { getJobProgress, getEventBreakdown, getEventMinuteChart } from '@/api/endpoints/aggregation.api'
import { createEvent, updateEvent, deleteEvent } from '@/api/endpoints/event.api'
import { updateWeezeventEventMetadata, syncWeezeventEventAttendees, getWeezeventEventsForSpace, getSpaceEventTimeline } from '@/api/endpoints/space.api'
import EventTimelineProgressIndicator from '@/components/EventTimelineProgressIndicator.vue'
import MapEventToExistingDialog from './dialogs/MapEventToExistingDialog.vue'
import CreateEventDialog from './dialogs/CreateEventDialog.vue'
import EnrichEventDialog from './dialogs/EnrichEventDialog.vue'
import EventBreakdownDrawer from './dialogs/EventBreakdownDrawer.vue'

export default {
  name: 'StepProcessTimeline',
  components: {
    EventTimelineProgressIndicator,
    MapEventToExistingDialog,
    CreateEventDialog,
    EnrichEventDialog,
    EventBreakdownDrawer,
  },
  props: {
    location: { type: Object, required: true },
    spaceId: { type: String, required: true },
    isDark: { type: Boolean, default: false },
    footerTarget: { type: [Object, String], default: null },
  },
  emits: ['completed'],
  setup() {
    const { t } = useI18n()
    const {
      events, unregisteredDates, weezeventEvents,
      transactionStats, hasMappings,
      loading, processing, error,
      loadTimeline, processAllEvents, processSingleEvent,
      getProgressPercent,
      cancelProcessing: composableCancelProcessing,
    } = useTimelineProcessing()
    const {
      loading: syncing, error: syncError, result: syncResult,
      phase: syncComposablePhase,
      startSync, checkProgress, reset: resetSync,
    } = useSynchronization()
    return {
      t,
      events, unregisteredDates, weezeventEvents,
      transactionStats, hasMappings,
      loading, processing, error,
      loadTimeline, processAllEvents, processSingleEvent,
      getProgressPercent,
      composableCancelProcessing,
      syncing, syncError, syncResult, syncComposablePhase, startSync, checkProgress, resetSync,
    }
  },
  data() {
    return {
      activeTab: 'covered',
      showRegisteredEvents: true,
      processingEventId: null,
      // §2 — progress indicator
      currentEventProgress: null,
      // §1.2 — skip
      skippedEventIds: [],
      // §6b — dialog mapping date → événement existant
      mapToEventDialog: false,
      mapToEventItem: null,
      mappingEventLoading: false,
      // §6 — dialog création event
      createEventDialog: false,
      createEventPrefill: null,
      // Sync
      syncPhase: 'idle',
      syncExecutionMode: 'full',
      elapsedSeconds: 0,
      timerInterval: null,
      // Enrichissement metadata events Weezevent
      enrichDialog: false,
      enrichingEvent: null,
      enrichSaving: false,
      // Sync attendees par event { eventId: boolean }
      syncingAttendees: {},
      // Résultats sync attendees { eventId: number }
      attendeesSynced: {},
      // Snackbar feedback
      feedbackSnackbar: false,
      feedbackSnackbarText: '',
      feedbackSnackbarColor: 'success',
      // Timeline minute par minute (tab 3)
      expandedTimelines: {},
      timelineData: {},
      timelineLoading: {},
      timelineFilterShop: {},
      timelineFilterArticle: {},
      // Minute chart (pré-agrégé depuis SpaceRevenueMinuteAgg)
      minuteChartData: {},      // { [eventId]: { data: [{ minute, revenueHt, ... }] } }
      minuteChartLoading: {},   // { [eventId]: boolean }
      syncingAllAttendees: false,
      // Mapping WeezeventEvent → DataFriday Event { weezEventId: dfEventId }
      weezEventMappings: {},
      weezEventMappingLoading: {},
      deletingEventId: null,
      // §breakdown
      expandedEventId: null,
      breakdownDrawer: false,
      breakdownData: null,
      breakdownLoading: false,
      breakdownError: null,
      coveredPage: 1,
      uncoveredPage: 1,
      pageSize: 20,
      // Bulk create events
      bulkCreateEventsDialog: false,
      bulkCreateEventsRunning: false,
      bulkCreateEventsPhase: '', // 'patching' | 'creating' | 'done' | 'error'
      bulkCreateEventsProgress: 0,
      bulkCreateEventsTotal: 0,
      bulkCreateEventsErrors: 0,
      bulkCreateEventsMessage: '',
    }
  },
  computed: {
    // §3 — tous les events enregistrés (les futurs sont signalés en info mais restent listés)
    registeredEvents() {
      return this.events || []
    },
    // Items pour le select de mapping WeezeventEvent → DataFriday Event
    dfEventSelectItems() {
      return (this.events || []).map(e => ({
        id: e.id,
        label: `${e.name || e.eventName || e.id} — ${this.formatDate(e.startDate || e.eventDate || e.date)}`,
      }))
    },
    futureEventsCount() {
      const now = new Date()
      return (this.events || []).filter(e => {
        const raw = e.startDate || e.start_date || e.date || e.eventDate || e.event_date
        if (!raw) return false
        const date = new Date(raw)
        return !isNaN(date.getTime()) && date > now
      }).length
    },
    // §1.2 — exclusion des events ignorés
    unprocessedEvents() {
      return this.registeredEvents.filter(
        e => e.aggregationStatus !== 'completed' && !this.skippedEventIds.includes(e.id)
      )
    },
    mappedCount() {
      return (this.weezeventEvents || []).filter(e => this.weezEventMappings[e.id]).length
    },
    unmappedCount() {
      return (this.weezeventEvents || []).filter(e => !this.weezEventMappings[e.id]).length
    },
    patchableEventsCount() {
      if (!this.spaceId) return 0
      const currentSpaceIds = new Set((this.events || []).map(e => String(e.id)))
      return Object.values(this.weezEventMappings)
        .filter(dfId => dfId && !currentSpaceIds.has(String(dfId)))
        .length
    },
    filteredWeezEvents() {
      const events = this.weezeventEvents || []
      if (this.activeTab === 'registered') return events.filter(e => this.weezEventMappings[e.id])
      if (this.activeTab === 'unregistered') return events.filter(e => !this.weezEventMappings[e.id])
      return events
    },
    uncoveredDateHeaders() {
      return [
        { title: this.t('intgTimelineColDate'), key: 'date', sortable: false },
        { title: this.t('intgTimelineColTransactions'), key: 'transactions', sortable: false },
        { title: '', key: 'action', sortable: false, align: 'end' },
      ]
    },
    registeredEventHeaders() {
      return [
        { title: this.t('intgTimelineColDate'), key: 'dates', sortable: false },
        { title: this.t('intgTimelineColDataPoints'), key: 'dataPoints', sortable: false },
        { title: this.t('intgTimelineColStatus'), key: 'status', sortable: false },
        { title: '', key: 'actions', sortable: false },
      ]
    },
    // §7 — condition de passage: aucune date non couverte
    canProceed() {
      return !this.unregisteredDates || this.unregisteredDates.length === 0
    },
    // §8 — allProcessed
    allProcessed() {
      return this.unprocessedEvents.length === 0 && this.registeredEvents.length > 0
    },
    processedCount() {
      return this.registeredEvents.filter(e => e.aggregationStatus === 'completed').length
    },
    totalEvents() {
      return this.registeredEvents.length
    },
    progressPercent() {
      return this.getProgressPercent()
    },
    elapsedFormatted() {
      const m = Math.floor(this.elapsedSeconds / 60)
      const s = this.elapsedSeconds % 60
      return `${m}:${String(s).padStart(2, '0')}`
    },
    syncSteps() {
      return [
        { key: 'cleanup', label: this.t('intgTimelineStepCleanup'), status: this.getSyncStepStatus(0) },
        { key: 'processing', label: this.t('intgTimelineStepProcessing'), status: this.getSyncStepStatus(1) },
        { key: 'aggregating', label: this.t('intgTimelineStepAggregating'), status: this.getSyncStepStatus(2) },
        { key: 'summaries', label: this.t('intgTimelineStepSummaries'), status: this.getSyncStepStatus(3) },
      ]
    },
    overallSyncProgress() {
      if (this.syncExecutionMode === 'verify') {
        return this.syncPhase === 'done' ? 100 : (this.syncPhase === 'syncing' ? 60 : 0)
      }
      if (this.syncPhase === 'done') return 100
      if (this.syncPhase !== 'syncing') return 0
      const currentIdx = this.syncComposablePhase - 1
      if (currentIdx < 0) return 0
      return Math.round(((currentIdx + 0.5) / 4) * 100)
    },
    shouldRunVerificationOnly() {
      return this.canProceed && this.allProcessed
    },
    syncBlockTitle() {
      return this.shouldRunVerificationOnly ? this.t('intgTimelineFinalVerification') : this.t('intgTimelineFinalSync')
    },
    syncPrimaryText() {
      return this.shouldRunVerificationOnly
        ? this.t('intgTimelineSyncPrimaryVerify')
        : this.t('intgTimelineSyncPrimaryFull')
    },
    syncSecondaryText() {
      return this.shouldRunVerificationOnly
        ? this.t('intgTimelineSyncSecondaryVerify')
        : this.t('intgTimelineSyncSecondaryFull')
    },
    syncActionLabel() {
      return this.shouldRunVerificationOnly ? this.t('intgTimelineRunVerification') : this.t('intgTimelineRunSync')
    },
    syncActionIcon() {
      return this.shouldRunVerificationOnly ? 'mdi-shield-check-outline' : 'mdi-rocket-launch'
    },
    syncingLabel() {
      return this.syncExecutionMode === 'verify' ? this.t('intgTimelineVerifyingLabel') : this.t('intgTimelineSyncingLabel')
    },
    syncDoneTitle() {
      return this.syncExecutionMode === 'verify' ? this.t('intgTimelineVerifyDoneTitle') : this.t('intgTimelineSyncDoneTitle')
    },
    syncDoneSummary() {
      if (this.syncExecutionMode === 'verify') {
        return `${this.registeredEvents.length} ${this.t('intgTimelineEventsVerified')}`
      }
      const processed = this.events.filter(e => e.aggregationStatus === 'completed').length
      const matched = this.transactionStats?.matched ?? 0
      return `${processed} ${this.t('intgTimelineEvent')}${processed !== 1 ? 's' : ''} ${this.t('intgTimelineAggregatedWord')}${processed !== 1 ? 's' : ''} · ${matched.toLocaleString('fr-FR')} ${this.t('intgTimelineTransactionsMatched')}`
    },
  },
  mounted() {
    if (this.spaceId) {
      // #10 — loadTimeline utilise step4-context (timeline + weezEvents + hasMappings en 1 appel)
      this.loadTimeline(this.spaceId, this.location.id)
    }
  },
  unmounted() {
    if (this.timerInterval) clearInterval(this.timerInterval)
  },
  watch: {
    spaceId(val) {
      if (val) {
        this.coveredPage = 1
        this.uncoveredPage = 1
        this.loadTimeline(val, this.location.id)
      }
    },
    activeTab() {
      this.coveredPage = 1
      this.uncoveredPage = 1
    },
  },
  methods: {
    toIsoDateBoundary(dateValue, boundary = 'start') {
      if (!dateValue) return null
      return boundary === 'end'
        ? `${dateValue}T23:59:59.999Z`
        : `${dateValue}T00:00:00.000Z`
    },
    formatDate(dateStr) {
      if (!dateStr) return '—'
      // Date-only strings (YYYY-MM-DD) must be parsed with time to avoid UTC timezone shift
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))
        ? new Date(`${dateStr}T00:00:00`)
        : new Date(dateStr)
      return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    },
    // A19 : méthode checkMappings() supprimée — code mort jamais appelé, superseded par
    // step4-context (hasMappings fourni par loadTimeline). hasMappings reste exposé.
    // §8 — Traiter tout / Tout retraiter
    async handleProcessAll() {
      this.processingEventId = null
      this.skippedEventIds = []
      if (this.allProcessed) {
        // Réinitialise les statuts locaux pour que processAllEvents les reprenne
        this.events = (this.events || []).map(e => ({ ...e, aggregationStatus: 'pending' }))
      }
      await this.processAllEvents(this.spaceId, this.location.id)
      await this.loadTimeline(this.spaceId, this.location.id)
    },
    // §9 — cancelProcessing délègue au composable
    cancelProcessing() {
      this.processingEventId = null
      this.currentEventProgress = null
      this.composableCancelProcessing()
    },
    // §2 — polling progress pendant le traitement d'un event
    async handleProcessSingle(eventId) {
      this.processingEventId = eventId
      this.currentEventProgress = { phase: this.t('intgTimelineInitializing'), percentage: 0, status: 'initializing' }
      try {
        const result = await this.processSingleEvent(this.spaceId, eventId, this.location.id)
        const jobId = result?.jobId
        let reachedTerminal = false

        // Backend queue-based: attendre l'état terminal du job avant de rafraîchir la timeline.
        if (jobId) {
          const TERMINAL = ['completed', 'failed', 'skipped']
          const MAX_POLLS = 120 // ~2 min
          for (let i = 0; i < MAX_POLLS; i++) {
            try {
              const progress = await getJobProgress(jobId)
              if (progress) {
                this.currentEventProgress = progress
                if (TERMINAL.includes(progress.status)) { reachedTerminal = true; break }
              }
            } catch {
              // Erreur de polling non critique: continuer
            }

            if (i < MAX_POLLS - 1) {
              await new Promise((resolve) => setTimeout(resolve, 1000))
            }
          }
        } else {
          // Pas de job à suivre (agrégation synchrone) → considéré comme terminé.
          reachedTerminal = true
        }

        // Distinguer le timeout du polling d'un vrai succès (l'état est resynchronisé
        // ensuite par loadTimeline ; ne pas afficher un faux "terminé").
        if (reachedTerminal) {
          this.feedbackSnackbarText = this.t('intgTimelineAggDone')
          this.feedbackSnackbarColor = 'success'
        } else {
          this.feedbackSnackbarText = this.t('intgTimelineAggSlow')
          this.feedbackSnackbarColor = 'warning'
        }
        this.feedbackSnackbar = true

        // Enrichissement Weezevent : récupérer les données de fréquentation (attendees,
        // précision, capacité, etc.) pour alimenter le dashboard analytics.
        // Appelé de façon non-bloquante après l'agrégation.
        try {
          // Chercher l'événement agrégé pour obtenir le WeezeventEvent lié
          const event = (this.events || []).find(e => e.id === eventId)
          // Utiliser le weezeventEventId s'il est disponible sur l'event DataFriday
          const weezEventId = event?.weezeventEventId
            || Object.entries(this.weezEventMappings).find(([, dfId]) => dfId === eventId)?.[0]
          if (weezEventId && this.spaceId) {
            await syncWeezeventEventAttendees(this.spaceId, weezEventId)
          }
        } catch (enrichErr) {
          // Non bloquant — l'enrichissement échoue silencieusement
          console.warn('[StepProcessTimeline] attendees enrichment failed (non-blocking):', enrichErr?.response?.data ?? enrichErr.message)
        }
      } catch (err) {
        // Network error = backend still running (timeout côté frontend)
        const isNetworkOrTimeout = !err.response || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED'
        if (isNetworkOrTimeout) {
          this.feedbackSnackbarText = this.t('intgTimelineProcessingBackground')
          this.feedbackSnackbarColor = 'info'
          this.feedbackSnackbar = true
          setTimeout(() => this.loadTimeline(this.spaceId, this.location.id), 5000)
        } else {
          this.feedbackSnackbarText = `${this.t('intgTimelineAggErrorPrefix')} ${err.message}`
          this.feedbackSnackbarColor = 'error'
          this.feedbackSnackbar = true
        }
      } finally {
        this.currentEventProgress = null
        this.processingEventId = null
      }
      await this.loadTimeline(this.spaceId, this.location.id)
    },
    // §1.2 — ignorer un event
    handleSkipEvent(eventId) {
      if (!this.skippedEventIds.includes(eventId)) {
        this.skippedEventIds.push(eventId)
      }
    },
    getSyncStepStatus(stepIdx) {
      const currentIdx = this.syncComposablePhase - 1
      if (this.syncPhase === 'done') return 'done'
      if (this.syncPhase !== 'syncing') return 'pending'
      if (stepIdx < currentIdx) return 'done'
      if (stepIdx === currentIdx && this.syncing) return 'running'
      return 'pending'
    },
    async handleSync() {
      this.syncExecutionMode = this.shouldRunVerificationOnly ? 'verify' : 'full'
      this.syncPhase = 'syncing'
      this.elapsedSeconds = 0
      this.timerInterval = setInterval(() => this.elapsedSeconds++, 1000)
      try {
        if (this.syncExecutionMode === 'verify') {
          await this.loadTimeline(this.spaceId, this.location.id)
        } else {
          await this.startSync(this.spaceId, this.location.id)
          // Le backend met le job en file d'attente et retourne immédiatement.
          // On attend la fin réelle du job, puis on met à jour les données localement
          // sans refaire d'appel API — les données sont déjà chargées en mémoire.
          await this.waitForSyncJob()
          this.applyLocalSyncResult()
        }
        this.syncPhase = 'done'
      } catch {
        this.syncPhase = 'error'
      } finally {
        clearInterval(this.timerInterval)
        this.timerInterval = null
      }
    },

    applyLocalSyncResult() {
      // Mise à jour locale : les événements en cours/en attente passent à "completed".
      // Évite un appel API supplémentaire — les données de base sont déjà en mémoire.
      this.events = this.events.map(e =>
        ['running', 'pending', 'queued'].includes(e.aggregationStatus)
          ? { ...e, aggregationStatus: 'completed' }
          : e,
      )
    },

    async waitForSyncJob() {
      const INTERVAL_MS = 2500
      const MAX_WAIT_MS = 10 * 60 * 1000 // 10 min max
      const start = Date.now()
      while (Date.now() - start < MAX_WAIT_MS) {
        await new Promise(resolve => setTimeout(resolve, INTERVAL_MS))
        const progress = await this.checkProgress()
        if (!progress) continue
        const status = (progress.status || progress.state || '').toLowerCase()
        if (['completed', 'done', 'finished', 'success'].includes(status)) return
        if (['failed', 'error', 'cancelled'].includes(status)) {
          throw new Error(progress.error || progress.message || this.t('intgTimelineSyncFailed'))
        }
      }
      // Timeout dépassé — on reload quand même la timeline
    },
    handleRetry() {
      this.resetSync()
      this.syncPhase = 'idle'
      this.syncExecutionMode = 'full'
      this.elapsedSeconds = 0
    },
    // §6 — ouvrir le dialog
    handleCreateEventFromWeez(weezEvent) {
      this.createEventPrefill = {
        name: weezEvent.name || '',
        date: weezEvent.startDate || weezEvent.start_date || '',
        endDate: weezEvent.endDate || weezEvent.end_date || '',
        pendingWeezEventLink: weezEvent,
      }
      this.createEventDialog = true
    },
    async handleDeleteEvent(event) {
      const label = event.name || event.eventName || event.id
      if (!confirm(`${this.t('intgTimelineDeleteConfirmPrefix')} « ${label} » ? ${this.t('intgTimelineDeleteConfirmSuffix')}`)) return
      this.deletingEventId = event.id
      try {
        await deleteEvent(event.id)
        this.$store.dispatch('events/removeEvent', event.id)
        await this.loadTimeline(this.spaceId, this.location.id)
        this.feedbackSnackbarText = `${this.t('intgTimelineEvent')} « ${label} » ${this.t('intgTimelineDeletedSuffix')}`
        this.feedbackSnackbarColor = 'success'
        this.feedbackSnackbar = true
      } catch (err) {
        console.error('[StepProcessTimeline] Failed to delete event:', err)
        this.feedbackSnackbarText = this.t('intgTimelineDeleteError')
        this.feedbackSnackbarColor = 'error'
        this.feedbackSnackbar = true
      } finally {
        this.deletingEventId = null
      }
    },
    async handleToggleBreakdown(event) {
      this.expandedEventId = event.id
      this.breakdownDrawer = true
      this.breakdownData = null
      this.breakdownError = null
      this.breakdownLoading = true
      try {
        this.breakdownData = await getEventBreakdown(this.spaceId, event.id)
      } catch (err) {
        this.breakdownError = this.t('intgTimelineBreakdownError')
      } finally {
        this.breakdownLoading = false
      }
    },
    handleMapToEvent(item) {
      this.mapToEventItem = item
      this.mapToEventDialog = true
    },
    async confirmMapToEvent(eventId) {
      if (!eventId || !this.mapToEventItem) return
      this.mappingEventLoading = true
      try {
        const newDate = this.mapToEventItem.date || this.mapToEventItem.start
        await updateEvent(eventId, { eventDate: newDate })
        this.mapToEventDialog = false
        await this.loadTimeline(this.spaceId, this.location.id)
        this.feedbackSnackbarText = this.t('intgTimelineMapSuccess')
        this.feedbackSnackbarColor = 'success'
        this.feedbackSnackbar = true
      } catch (err) {
        this.feedbackSnackbarText = this.t('intgTimelineMapErrorPrefix') + ' ' + (err?.response?.data?.message || err.message)
        this.feedbackSnackbarColor = 'error'
        this.feedbackSnackbar = true
      } finally {
        this.mappingEventLoading = false
      }
    },
    handleCreateEventFromDate(dateRange) {
      const toInputDate = d => d ? String(d).slice(0, 10) : ''
      const baseEndDate = toInputDate(dateRange.endDate || dateRange.end || dateRange.date || dateRange.start || '')

      const rawLastTx =
        dateRange.lastTransactionTime ??
        dateRange.lastTransactionAt ??
        dateRange.last_transaction_time ??
        dateRange.last_transaction_at ??
        dateRange.lastTransaction ??
        null

      let endDate = baseEndDate
      let endTime = ''

      if (rawLastTx) {
        const { time, addDay } = this.roundUpToQuarterHour(rawLastTx)
        endTime = time
        if (addDay && baseEndDate) {
          const d = new Date(baseEndDate + 'T00:00:00')
          d.setDate(d.getDate() + 1)
          endDate = toInputDate(d.toISOString())
        }
      }

      this.createEventPrefill = {
        name: '',
        date: toInputDate(dateRange.date || dateRange.start || ''),
        endDate,
        endTime,
        pendingWeezEventLink: null,
      }
      this.createEventDialog = true
    },

    roundUpToQuarterHour(datetimeStr) {
      const d = new Date(datetimeStr)
      if (isNaN(d.getTime())) return { time: '', addDay: false }
      const quarterMs = 15 * 60 * 1000
      const rounded = new Date(Math.ceil(d.getTime() / quarterMs) * quarterMs)
      const origMidnight = new Date(d)
      origMidnight.setHours(0, 0, 0, 0)
      const nextMidnight = new Date(origMidnight)
      nextMidnight.setDate(origMidnight.getDate() + 1)
      const addDay = rounded.getTime() >= nextMidnight.getTime()
      const h = rounded.getHours()
      const m = rounded.getMinutes()
      return {
        time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        addDay,
      }
    },
    // §6 — création d'event terminée dans CreateEventDialog
    async bulkCreateEvents() {
      if (!this.spaceId) return

      // Phase 0 : events liés (weezEventMappings) mais sans le spaceId courant
      const currentSpaceIds = new Set((this.events || []).map(e => String(e.id)))
      const toPatch = Object.values(this.weezEventMappings)
        .filter(dfId => dfId && !currentSpaceIds.has(String(dfId)))

      // Phase 1 : events Weezevent non liés à un event DF
      const toCreate = (this.weezeventEvents || []).filter(e => !this.weezEventMappings[e.id])

      if (!toPatch.length && !toCreate.length) return

      this.bulkCreateEventsDialog = true
      this.bulkCreateEventsRunning = true
      this.bulkCreateEventsPhase = 'patching'
      this.bulkCreateEventsProgress = 0
      this.bulkCreateEventsTotal = toCreate.length
      this.bulkCreateEventsErrors = 0
      this.bulkCreateEventsMessage = ''

      let patchedCount = 0

      try {
        // ── Phase 0 : rattacher les events DF existants au Space ──
        if (toPatch.length > 0) {
          const PATCH_BATCH = 10
          for (let i = 0; i < toPatch.length; i += PATCH_BATCH) {
            const batch = toPatch.slice(i, i + PATCH_BATCH)
            const results = await Promise.allSettled(
              batch.map(dfId => updateEvent(dfId, { spaceId: this.spaceId }))
            )
            for (const result of results) {
              if (result.status === 'fulfilled') patchedCount++
              else {
                console.warn('[bulkCreateEvents] patch error:', result.reason)
                this.bulkCreateEventsErrors++
              }
            }
          }
        }

        if (!toCreate.length) {
          this.bulkCreateEventsPhase = 'done'
          this.bulkCreateEventsMessage = `${patchedCount} ${this.t('intgTimelineBulkEventsAttached')}`
          await this.loadTimeline(this.spaceId, this.location.id)
          return
        }

        // ── Phase 1 : créer les events DF et les lier au Weezevent ──
        this.bulkCreateEventsPhase = 'creating'
        let createdCount = 0
        let skippedCount = 0
        const BATCH = 5

        for (let i = 0; i < toCreate.length; i += BATCH) {
          const chunk = toCreate.slice(i, i + BATCH)
          const results = await Promise.allSettled(
            chunk.map(async (weezEvent) => {
              const toDate = d => (d ? String(d).slice(0, 10) : null)
              const startDate = toDate(weezEvent.startDate || weezEvent.start_date || weezEvent.date || weezEvent.start || weezEvent.eventDate || weezEvent.event_date)
              const endDate = toDate(weezEvent.endDate || weezEvent.end_date || weezEvent.end) || startDate
              if (!startDate) {
                console.warn('[bulkCreateEvents] champs disponibles sur le weezEvent sans date:', JSON.stringify(weezEvent))
                return { __skipped: true }
              }
              const res = await createEvent({
                name: weezEvent.name || `${this.t('intgTimelineEventFallbackName')} ${weezEvent.id}`,
                eventDate: startDate,
                eventStartDate: startDate,
                eventEndDate: endDate,
                spaceId: this.spaceId,
              })
              const newEvent = res?.data || res
              if (!newEvent?.id) throw new Error('No id returned')
              await this.$store.dispatch('events/addEvent', newEvent)
              await updateWeezeventEventMetadata(this.spaceId, weezEvent.id, { dfEventId: newEvent.id })
              const updated = { ...this.weezEventMappings }
              updated[weezEvent.id] = newEvent.id
              this.weezEventMappings = updated
              return newEvent
            })
          )
          for (const result of results) {
            if (result.status === 'fulfilled') {
              if (result.value?.__skipped) skippedCount++
              else createdCount++
            } else {
              console.warn('[bulkCreateEvents] create error:', result.reason)
              this.bulkCreateEventsErrors++
            }
          }
          this.bulkCreateEventsProgress = Math.min(i + BATCH, toCreate.length)
        }

        const patchSummary = patchedCount > 0 ? `${patchedCount} ${this.t('intgTimelineBulkEventsAttached')} ` : ''
        const skipSummary = skippedCount > 0 ? ` ${skippedCount} ${this.t('intgTimelineBulkSkippedNoDate')}` : ''
        if (this.bulkCreateEventsErrors > 0) {
          this.bulkCreateEventsPhase = 'error'
          this.bulkCreateEventsMessage = `${patchSummary}${createdCount} ${this.t('intgTimelineBulkCreatedOn')} ${toCreate.length - skippedCount}. ${this.bulkCreateEventsErrors} ${this.t('intgTimelineBulkFailedShort')}${skipSummary}`
        } else {
          this.bulkCreateEventsPhase = 'done'
          this.bulkCreateEventsMessage = `${patchSummary}${createdCount} ${this.t('intgTimelineBulkCreatedLinked')}${skipSummary}`
        }
        await this.loadTimeline(this.spaceId, this.location.id)
      } catch (err) {
        console.error('[bulkCreateEvents] fatal error:', err)
        this.bulkCreateEventsPhase = 'error'
        this.bulkCreateEventsMessage = err?.response?.data?.message || err?.message || this.t('intgTimelineGenericError')
      } finally {
        this.bulkCreateEventsRunning = false
      }
    },

    async handleEventCreated({ event, pendingWeezEventLink }) {
      this.$store.dispatch('events/addEvent', event)
      if (pendingWeezEventLink && event?.id) {
        await this.saveWeezEventMapping(pendingWeezEventLink, event.id)
      }
      await this.loadTimeline(this.spaceId, this.location.id)
    },

    // Enrichissement metadata events Weezevent
    async loadWeezeventEvents() {
      try {
        const data = await getWeezeventEventsForSpace(this.spaceId)
        const list = Array.isArray(data) ? data : (data?.data ?? [])
        // Always restore dfEventId mappings regardless of composable state
        const newMappings = { ...this.weezEventMappings }
        list.forEach(enriched => {
          if (!enriched.id) return
          // Merge metadata into composable weezeventEvents if already loaded
          if (this.weezeventEvents?.length) {
            const idx = this.weezeventEvents.findIndex(e => e.id === enriched.id)
            if (idx !== -1) Object.assign(this.weezeventEvents[idx], enriched)
          }
          // Restore or clear saved dfEventId
          if (enriched.dfEventId) {
            newMappings[enriched.id] = enriched.dfEventId
          } else {
            delete newMappings[enriched.id]
          }
        })
        this.weezEventMappings = newMappings
      } catch (err) {
        console.error('[StepProcessTimeline] Failed to load weezevent events:', err)
      }
    },
    async saveWeezEventMapping(weezEvent, dfEventId) {
      this.weezEventMappingLoading = { ...this.weezEventMappingLoading, [weezEvent.id]: true }
      try {
        await updateWeezeventEventMetadata(this.spaceId, weezEvent.id, { dfEventId: dfEventId || null })
        // Delete key when unmapping so mappedCount stays accurate
        const updated = { ...this.weezEventMappings }
        if (dfEventId) {
          updated[weezEvent.id] = dfEventId
        } else {
          delete updated[weezEvent.id]
        }
        this.weezEventMappings = updated
        this.feedbackSnackbarText = dfEventId ? this.t('intgTimelineWeezLinked') : this.t('intgTimelineLinkRemoved')
        this.feedbackSnackbarColor = 'success'
        this.feedbackSnackbar = true
      } catch (err) {
        console.error('[StepProcessTimeline] Failed to save weez event mapping:', err)
        this.feedbackSnackbarText = this.t('intgTimelineLinkSaveError')
        this.feedbackSnackbarColor = 'error'
        this.feedbackSnackbar = true
      } finally {
        this.weezEventMappingLoading = { ...this.weezEventMappingLoading, [weezEvent.id]: false }
      }
    },
    openEnrichDialog(event) {
      this.enrichingEvent = event
      this.enrichDialog = true
    },
    async saveEnrichment(formData) {
      if (!this.enrichingEvent) return
      this.enrichSaving = true
      try {
        const updated = await updateWeezeventEventMetadata(
          this.spaceId,
          this.enrichingEvent.id,
          formData,
        )
        // Update local event data
        Object.assign(this.enrichingEvent, updated)
        this.enrichDialog = false
        this.feedbackSnackbarText = this.t('intgTimelineEnrichSuccess')
        this.feedbackSnackbarColor = 'success'
        this.feedbackSnackbar = true
      } catch (err) {
        console.error('[StepProcessTimeline] Failed to save enrichment:', err)
        this.feedbackSnackbarText = this.t('intgTimelineSaveError')
        this.feedbackSnackbarColor = 'error'
        this.feedbackSnackbar = true
      } finally {
        this.enrichSaving = false
      }
    },
    // ── Timeline minute par minute ─────────────────────────────────────
    async toggleTimeline(event) {
      const id = event.id
      if (this.expandedTimelines[id]) {
        this.expandedTimelines = { ...this.expandedTimelines, [id]: false }
        return
      }
      if (!this.timelineData[id]) {
        await this.loadEventTimeline(event)
      }
      this.expandedTimelines = { ...this.expandedTimelines, [id]: true }
    },
    async loadEventTimeline(event) {
      const id = event.id
      this.timelineLoading = { ...this.timelineLoading, [id]: true }
      try {
        const rows = await getSpaceEventTimeline(this.spaceId, id)
        this.timelineData = { ...this.timelineData, [id]: Array.isArray(rows) ? rows : [] }
      } catch (err) {
        console.error('[StepProcessTimeline] Failed to load timeline:', err)
        this.timelineData = { ...this.timelineData, [id]: [] }
      } finally {
        this.timelineLoading = { ...this.timelineLoading, [id]: false }
      }
    },
    timelineShops(eventId) {
      const rows = this.timelineData[eventId] || []
      const seen = new Set()
      return rows.filter(r => {
        if (!r.shopId || seen.has(r.shopId)) return false
        seen.add(r.shopId)
        return true
      }).map(r => ({ shopId: r.shopId, shopName: r.shopName }))
    },
    timelineArticles(eventId) {
      const rows = this.timelineData[eventId] || []
      const seen = new Set()
      return rows.filter(r => {
        const key = r.menuItemId || r.weezeventProductId
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      }).map(r => ({
        menuItemId: r.menuItemId || r.weezeventProductId,
        menuItemName: r.menuItemName || r.weezeventProductId || '—',
      }))
    },
    filteredTimeline(eventId) {
      let rows = this.timelineData[eventId] || []
      const shopFilter = this.timelineFilterShop[eventId]
      const articleFilter = this.timelineFilterArticle[eventId]
      if (shopFilter) rows = rows.filter(r => r.shopId === shopFilter)
      if (articleFilter) rows = rows.filter(r => (r.menuItemId || r.weezeventProductId) === articleFilter)
      return rows
    },
    timelineSummary(eventId) {
      const rows = this.timelineData[eventId]
      if (!rows || !rows.length) return null
      const shops = new Set(rows.map(r => r.shopId))
      return {
        revenueHt:         rows.reduce((sum, r) => sum + Number(r.revenueHt || 0), 0),
        shopCount:         shops.size,
        totalQty:          rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0),
        totalTransactions: rows.reduce((sum, r) => sum + Number(r.transactionCount || 0), 0),
      }
    },
    async handleBreakdownChartTabClick(event) {
      const eventId = event.id
      if (this.minuteChartData[eventId] !== undefined) return // already loaded
      this.minuteChartLoading = { ...this.minuteChartLoading, [eventId]: true }
      try {
        const result = await getEventMinuteChart(this.spaceId, eventId)
        this.minuteChartData = { ...this.minuteChartData, [eventId]: result }
      } catch (e) {
        console.error('[CHART] Error loading minute chart:', e)
        this.minuteChartData = { ...this.minuteChartData, [eventId]: { data: [] } }
      } finally {
        this.minuteChartLoading = { ...this.minuteChartLoading, [eventId]: false }
      }
    },
    exportTimelineCsv(event) {
      const rows = this.filteredTimeline(event.id)
      if (!rows.length) return
      const headers = [
        this.t('intgTimelineCsvMinute'),
        this.t('intgTimelineCsvShop'),
        this.t('intgTimelineCsvShopType'),
        this.t('intgTimelineCsvArticle'),
        this.t('intgTimelineCsvCategory'),
        this.t('intgTimelineCsvQuantity'),
        this.t('intgTimelineCsvTransactions'),
        this.t('intgTimelineCsvRevenueHt'),
      ]
      const lines = rows.map(r => [
        r.minute,
        r.shopName || '',
        r.shopType || '',
        r.menuItemName || r.weezeventProductId || '',
        r.menuItemCategory || '',
        r.quantity,
        r.transactionCount,
        Number(r.revenueHt || 0).toFixed(2),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      const csv = [headers.join(','), ...lines].join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `timeline-${(event.name || event.id).replace(/\s+/g, '-')}.csv`
      a.click()
      URL.revokeObjectURL(url)
    },
    async syncAllAttendees() {
      this.syncingAllAttendees = true
      let total = 0
      try {
        for (const event of this.weezeventEvents) {
          try {
            this.syncingAttendees = { ...this.syncingAttendees, [event.id]: true }
            const result = await syncWeezeventEventAttendees(this.spaceId, event.id)
            this.attendeesSynced = { ...this.attendeesSynced, [event.id]: result?.synced ?? 0 }
            total += result?.synced ?? 0
          } catch {
            // continue on individual failure
          } finally {
            this.syncingAttendees = { ...this.syncingAttendees, [event.id]: false }
          }
        }
        this.feedbackSnackbarText = `${total} ${this.t('intgTimelineAttendeesSyncedTotal')}`
        this.feedbackSnackbarColor = 'success'
        this.feedbackSnackbar = true
      } finally {
        this.syncingAllAttendees = false
      }
    },
    // ─────────────────────────────────────────────────────────────────────
    async syncAttendees(event) {
      this.syncingAttendees = { ...this.syncingAttendees, [event.id]: true }
      try {
        const result = await syncWeezeventEventAttendees(this.spaceId, event.id)
        this.attendeesSynced = { ...this.attendeesSynced, [event.id]: result?.synced ?? 0 }
        this.feedbackSnackbarText = `${result?.synced ?? 0} ${this.t('intgTimelineAttendeesSynced')}`
        this.feedbackSnackbarColor = 'success'
        this.feedbackSnackbar = true
      } catch (err) {
        console.error('[StepProcessTimeline] Failed to sync attendees:', err)
        this.feedbackSnackbarText = this.t('intgTimelineAttendeesSyncError')
        this.feedbackSnackbarColor = 'error'
        this.feedbackSnackbar = true
      } finally {
        this.syncingAttendees = { ...this.syncingAttendees, [event.id]: false }
      }
    },
  },
}
</script>

<style scoped>
/* ── Root ── */
.spt-root {
  padding: 20px 24px;
  min-height: 100%;
  background: #f9fafb;
  display: flex;
  flex-direction: column;
}
.spt--dark { background: #111827; color: #e5e7eb; }

/* ── Gradient Header ── */
.spt-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 24px; border-radius: 18px; margin-bottom: 16px;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
}
.spt-header__icon {
  width: 46px; height: 46px; border-radius: 12px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.spt-header__body { flex: 1; min-width: 0; }
.spt-header__title { font-size: 16px; font-weight: 700; color: #fff; margin: 0 0 3px; }
.spt-header__step  { font-size: 13px; font-weight: 400; opacity: .72; }
.spt-header__sub   { font-size: 12.5px; color: rgba(255,255,255,.72); margin: 0; }
.spt-prog-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 14px; border-radius: 100px;
  font-size: 12px; font-weight: 700; white-space: nowrap; flex-shrink: 0;
}
.spt-prog-badge--green { background: rgba(255,255,255,.22); color: #fff; }
.spt-prog-badge--gray  { background: rgba(0,0,0,.15); color: rgba(255,255,255,.85); }

/* ── Content area ── */
.spt-content { display: flex; flex-direction: column; gap: 10px; }

/* ── Stats banner ── */
.spt-stats-banner {
  background: #f3f0ff; border: 1.5px solid rgba(124,58,237,.18);
  border-radius: 14px; padding: 14px 16px;
}
.spt-stats-banner__top {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
}
.spt-stats-banner__total { font-size: 13px; font-weight: 700; color: #4c1d95; }
.spt-stats-banner__chips { display: flex; flex-wrap: wrap; gap: 6px; }

/* ── Chips ── */
.spt-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border-radius: 100px; font-size: 11.5px; font-weight: 600;
}
.spt-chip--green  { background: #dcfce7; color: #16a34a; }
.spt-chip--red    { background: #fee2e2; color: #ff3131; }
.spt-chip--amber  { background: #fef9c3; color: #92400e; }
.spt-chip--gray   { background: #f3f4f6; color: #6b7280; }
.spt-chip--purple { background: #ede9fe; color: #7c3aed; }

/* ── Loading skeletons ── */
.spt-skeletons { display: flex; flex-direction: column; gap: 8px; }
.spt-skeleton-row {
  height: 62px; border-radius: 14px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: spt-shimmer 1.4s infinite;
}
.spt--dark .spt-skeleton-row {
  background: linear-gradient(90deg, #1f2937 25%, #374151 50%, #1f2937 75%);
  background-size: 200% 100%;
}
@keyframes spt-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* ── Banners ── */
.spt-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 12px 16px; border-radius: 14px; font-size: 13px;
}
.spt-banner__left { display: flex; align-items: center; gap: 8px; flex: 1; }
.spt-banner--blue { background: #eff6ff; border: 1.5px solid #bfdbfe; color: #1e40af; }

.spt-banner-btn {
  padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 600;
  border: none; cursor: pointer; white-space: nowrap; flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 5px; transition: all .15s;
}
.spt-banner-btn--blue { background: #2563eb; color: #fff; }
.spt-banner-btn--blue:hover { background: #1d4ed8; }

/* ── Toolbar + pill tabs ── */
.spt-toolbar {
  display: flex; align-items: center;
  padding: 10px 14px; background: #fff; border-radius: 14px;
  border: 1.5px solid #e5e7eb;
}
.spt--dark .spt-toolbar { background: #1f2937; border-color: #374151; }

.spt-tabs { display: flex; gap: 6px; }
.spt-tab {
  padding: 5px 13px; border-radius: 100px; font-size: 12.5px; font-weight: 500;
  border: 1.5px solid #e5e7eb; background: #f9fafb; color: #6b7280;
  cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
  transition: all .15s;
}
.spt-tab:hover { border-color: #d1d5db; background: #f3f4f6; }
.spt-tab--active { background: #fef2f2; border-color: #ff3131; color: #ff3131; font-weight: 700; }
.spt--dark .spt-tab { background: #111827; border-color: #374151; color: #9ca3af; }
.spt--dark .spt-tab--active { background: rgba(255, 49, 49,.15); border-color: #ff3131; color: #f87171; }

.spt-tab__count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 100px; font-size: 10.5px; font-weight: 700;
}
.spt-tab__count--green { background: #dcfce7; color: #16a34a; }
.spt-tab__count--amber { background: #fef9c3; color: #92400e; }
.spt-tab__count--gray  { background: #e5e7eb; color: #6b7280; }
.spt-tab__count--red   { background: #fee2e2; color: #ff3131; }

/* ── Section labels ── */
.spt-section-label {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .5px; margin: 4px 0 2px;
}
.spt-section-label--green { color: #16a34a; }
.spt-section-label--amber { color: #f59e0b; }

/* ── List column headers ── */
.spt-list__header {
  display: grid;
  grid-template-columns: 1.5fr 0.8fr 1fr;
  gap: 12px; padding: 4px 16px;
}
.spt-list__header--covered {
  grid-template-columns: 1.6fr 0.7fr 0.8fr 1.5fr;
}
.spt-list__header-col {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .6px; color: #9ca3af;
  display: flex; align-items: center;
}
.spt-list__header-col--right { justify-content: flex-end; }

/* ── Lists ── */
.spt-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; }

/* ── Rows ── */
.spt-row {
  display: grid; align-items: center; gap: 12px;
  padding: 12px 16px; border-radius: 14px;
  background: #fff; border: 1.5px solid #e5e7eb;
  transition: border-color .18s, box-shadow .18s;
}
.spt-row:hover { border-color: #d1d5db; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.spt--dark .spt-row { background: #1f2937; border-color: #374151; }
.spt--dark .spt-row:hover { border-color: #4b5563; }

.spt-row--uncovered {
  grid-template-columns: 1.5fr 0.8fr 1fr;
  border-color: #fde68a; background: #fffbeb;
}
.spt--dark .spt-row--uncovered { background: #1c1500; border-color: #854d0e; }

.spt-row--covered { grid-template-columns: 1.6fr 0.7fr 0.8fr 1.5fr; }
.spt-row--aggregated { border-color: #bbf7d0; background: #f0fdf4; }
.spt--dark .spt-row--aggregated { background: #052e16; border-color: #166534; }

/* Row internals */
.spt-row__date {
  display: flex; align-items: center; gap: 8px; min-width: 0;
}
.spt-row__date-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.spt-row__date-dot--green { background: #16a34a; }
.spt-row__date-dot--amber { background: #f59e0b; }
.spt-row__date-dot--gray  { background: #d1d5db; }

.spt-row__date-text {
  font-size: 13.5px; font-weight: 600; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.spt--dark .spt-row__date-text { color: #f3f4f6; }

.spt-row__event-info { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
.spt-row__event-name {
  font-size: 11.5px; color: #6b7280; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.spt--dark .spt-row__event-name { color: #9ca3af; }

.spt-row__transactions { display: flex; align-items: center; }
.spt-row__datapoints   { display: flex; align-items: center; }
.spt-row__status       { display: flex; align-items: center; }
.spt-row__empty        { font-size: 13px; color: #9ca3af; }

.spt-row__actions { display: flex; align-items: center; gap: 5px; justify-content: flex-end; }
.spt-row__actions--col { flex-direction: column; align-items: flex-end; gap: 4px; }
.spt-row__actions-row  { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }

/* ── Badges ── */
.spt-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border-radius: 50px; font-size: 11.5px; font-weight: 600;
}
.spt-badge--green { background: #dcfce7; color: #16a34a; border: 1px solid #bbf7d0; }
.spt-badge--gray  { background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; }
.spt-badge--amber { background: #fef9c3; color: #92400e; border: 1px solid #fde68a; }
.spt-badge--red   { background: #fee2e2; color: #ff3131; border: 1px solid #fecaca; }

/* ── Small action buttons (inline in rows) ── */
.spt-act-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 11px; border-radius: 100px; font-size: 12px; font-weight: 600;
  border: none; cursor: pointer; transition: all .15s; white-space: nowrap; flex-shrink: 0;
}
.spt-act-btn:disabled { opacity: .45; cursor: not-allowed; }
.spt-act-btn--blue   { background: #eff6ff; color: #2563eb; }
.spt-act-btn--blue:hover:not(:disabled)   { background: #dbeafe; }
.spt-act-btn--amber  { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.spt-act-btn--amber:hover:not(:disabled)  { background: #fef3c7; }
.spt-act-btn--teal   { background: #f0fdfa; color: #0f766e; }
.spt-act-btn--teal:hover:not(:disabled)   { background: #ccfbf1; }
.spt-act-btn--purple { background: #ede9fe; color: #7c3aed; }
.spt-act-btn--purple:hover:not(:disabled) { background: #ddd6fe; }
.spt-act-btn--gray   { background: #f3f4f6; color: #6b7280; }
.spt-act-btn--gray:hover:not(:disabled)   { background: #e5e7eb; }
.spt-act-btn--red    { background: #fee2e2; color: #ff3131; }
.spt-act-btn--red:hover:not(:disabled)    { background: #fecaca; }
.spt-act-btn--green  { background: #dcfce7; color: #16a34a; }
.spt-act-btn--green:hover:not(:disabled)  { background: #bbf7d0; }

/* ── Inline progress (inside row when aggregating) ── */
.spt-inline-progress { width: 100%; min-width: 140px; }
.spt-inline-progress__labels {
  display: flex; justify-content: space-between; margin-top: 2px;
  font-size: 10px; color: #9ca3af;
}

/* ── Pagination ── */
.spt-pagination {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 8px 0; font-size: 13px; color: #6b7280;
}
.spt-page-btn {
  width: 30px; height: 30px; border-radius: 8px;
  border: 1.5px solid #e5e7eb; background: #fff; color: #374151;
  font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.spt-page-btn:hover:not(:disabled) { border-color: #ff3131; color: #ff3131; }
.spt-page-btn:disabled { opacity: .35; cursor: not-allowed; }
.spt-page-info { font-size: 12.5px; font-weight: 500; }
.spt--dark .spt-page-btn { background: #1f2937; border-color: #374151; color: #d1d5db; }

/* ── Info bars ── */
.spt-infobar {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border-radius: 14px; font-size: 13px;
}
.spt-infobar--success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.spt-infobar--blue    { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
.spt-infobar--error   { background: #fef2f2; border: 1px solid #fecaca; color: #ff3131; }
.spt-infobar--warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }

/* ── Divider ── */
.spt-divider { height: 1px; background: #e5e7eb; margin: 6px 0; }
.spt--dark .spt-divider { background: #374151; }

/* ── Sync section heading ── */
.spt-sync-heading {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;
}
.spt-sync-heading__left { display: flex; align-items: center; gap: 10px; }
.spt-sync-heading__icon {
  width: 30px; height: 30px; border-radius: 8px;
  background: linear-gradient(135deg, #ff3131 0%, #b91c1c 100%);
  display: flex; align-items: center; justify-content: center;
}
.spt-sync-heading__title { font-size: 15px; font-weight: 700; color: #111827; }
.spt--dark .spt-sync-heading__title { color: #f3f4f6; }

/* ── Sync idle card ── */
.spt-sync-card {
  background: #fff7f7; border: 1.5px solid rgba(255, 49, 49,.15);
  border-radius: 16px; padding: 20px;
  display: flex; align-items: flex-start; gap: 16px;
}
.spt--dark .spt-sync-card { background: rgba(255, 49, 49,.08); border-color: rgba(255, 49, 49,.25); }
.spt-sync-card__icon { flex-shrink: 0; margin-top: 2px; }
.spt-sync-card__body { flex: 1; }
.spt-sync-card__title { font-size: 13.5px; font-weight: 600; color: #111827; margin: 0 0 4px; }
.spt-sync-card__sub   { font-size: 12px; color: #6b7280; margin: 0; }
.spt--dark .spt-sync-card__title { color: #f3f4f6; }

/* ── Sync running card ── */
.spt-sync-running {
  background: #fff; border: 1.5px solid #e5e7eb; border-radius: 16px; padding: 18px 20px;
}
.spt--dark .spt-sync-running { background: #1f2937; border-color: #374151; }
.spt-sync-running__top {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
}
.spt-sync-running__label { font-size: 13.5px; font-weight: 700; color: #111827; }
.spt-sync-running__elapsed { font-size: 12px; color: #9ca3af; font-variant-numeric: tabular-nums; }
.spt--dark .spt-sync-running__label { color: #f3f4f6; }
.spt-sync-running__pct { text-align: right; font-size: 11.5px; color: #9ca3af; margin: 4px 0 0; }

.spt-sync-steps { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
.spt-sync-step  { display: flex; align-items: center; gap: 10px; }
.spt-sync-step__label { font-size: 13px; color: #374151; }
.spt-sync-step__label--dim { color: #9ca3af; }
.spt--dark .spt-sync-step__label { color: #d1d5db; }
.spt--dark .spt-sync-step__label--dim { color: #6b7280; }

.spt-sync-verify {
  display: flex; align-items: center; gap: 10px;
  font-size: 12.5px; color: #6b7280; margin-bottom: 4px;
}

/* ── Primary / ghost buttons ── */
.spt-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 20px; border-radius: 100px; font-size: 13px; font-weight: 600;
  cursor: pointer; border: none; transition: all .2s; line-height: 1.4;
}
.spt-btn:disabled { opacity: .45; cursor: not-allowed; transform: none !important; }
.spt-btn--primary {
  background: #ff3131;
  color: #fff; box-shadow: 0 4px 14px rgba(255, 49, 49,.3);
}
.spt-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.spt-btn--ghost {
  background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280;
}
.spt-btn--ghost:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; }

/* ── Footer actions ── */
.spt-footer-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

/* ── Dialog ── */
.spt-dialog {
  background: #fff; border-radius: 18px; overflow: hidden;
  box-shadow: 0 8px 40px rgba(0,0,0,.18);
}

.spt-dialog-header {
  display: flex; align-items: center; gap: 12px; padding: 18px 20px;
  background: #ff3131;
}
.spt-dialog-header__icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.spt-dialog-header__title { font-size: 15px; font-weight: 700; color: #fff; margin: 0 0 2px; }
.spt-dialog-header__sub   { font-size: 12px; color: rgba(255,255,255,.72); margin: 0; }

.spt-dialog-body {
  padding: 28px 24px;
}
.spt-dialog-footer {
  padding: 12px 20px 16px; border-top: 1px solid #f0f0f0;
  display: flex; align-items: center; justify-content: flex-end;
}

.spt-dialog-result__title { font-size: 15px; font-weight: 700; color: #111827; margin: 0 0 6px; }
.spt-dialog-result__sub   { font-size: 13px; color: #6b7280; margin: 0; }

/* ── Vuetify deep overrides ── */
:deep(.v-field--focused) {
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.15) !important;
}
:deep(.v-field--focused .v-field__outline__start),
:deep(.v-field--focused .v-field__outline__notch),
:deep(.v-field--focused .v-field__outline__end) {
  border-color: #ff3131 !important;
}
.spt--dark :deep(.v-field) { background: #1f2937; color: #e5e7eb; }
.spt--dark :deep(.v-field__input) { color: #e5e7eb; caret-color: #ff3131; }
.spt--dark :deep(.v-label) { color: #9ca3af !important; }
.spt--dark :deep(.v-field--variant-outlined .v-field__outline__start),
.spt--dark :deep(.v-field--variant-outlined .v-field__outline__notch),
.spt--dark :deep(.v-field--variant-outlined .v-field__outline__end) {
  border-color: #374151;
}
.spt--dark :deep(.v-select__selection-text) { color: #e5e7eb; }
</style>
