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
            {{ formatNumber(transactionStats.total) }} {{ t('intgTimelineWeezeventTransactions') }}
          </span>
        </div>
        <div class="spt-stats-banner__chips">
          <span class="spt-chip spt-chip--green">
            <v-icon size="11">mdi-check-circle</v-icon>
            {{ formatNumber(transactionStats.matched) }} {{ t('intgTimelineLinkedToEvent') }}
          </span>
          <span
            class="spt-chip"
            :class="transactionStats.unmatched > 0 ? 'spt-chip--red' : 'spt-chip--green'"
          >
            <v-icon size="11">{{ transactionStats.unmatched > 0 ? 'mdi-alert-circle' : 'mdi-check-circle' }}</v-icon>
            {{ formatNumber(transactionStats.unmatched) }} {{ t('intgTimelineWithoutEvent') }}
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

      <!-- ── Loading ──
           Skeleton uniquement au tout premier chargement (aucune donnée encore affichée).
           loadTimeline() est rappelé après chaque action (Relancer, Tout agréger, Créer et lier
           tout...) — sans cette garde, toute la zone (liste, banners, progression inline d'un
           event en cours) disparaissait et réapparaissait à chaque refresh, y compris pendant le
           polling d'un job en cours, cachant la progression que l'utilisateur était en train de
           suivre. events.value n'est de toute façon remplacé qu'à la fin de loadTimeline (jamais
           vidé en cours de route), donc les données affichées restent valides pendant un refresh. -->
      <div v-if="loading && !events.length" class="spt-skeletons">
        <div v-for="i in 5" :key="i" class="spt-skeleton-row"></div>
      </div>

      <template v-else>

        <!-- ── Bulk create banner ── -->
        <div
          v-if="(unmappedCount > 0 || patchableEventsCount > 0) && !bulkCreateEventsRunning"
          class="spt-banner spt-banner--blue"
        >
          <div class="spt-banner__left">
            <v-icon size="16" color="#ff3131">mdi-calendar-plus</v-icon>
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
          <button
            v-if="unprocessedEvents.length > 0"
            class="spt-banner-btn spt-banner-btn--purple"
            :disabled="bulkAggregateLocked || !!processingEventId"
            :title="t('intgTimelineAggregateAllTooltip')"
            @click="handleAggregateAll"
          >
            <v-icon size="14">{{ bulkAggregateRunning ? 'mdi-loading mdi-spin' : 'mdi-database-sync' }}</v-icon>
            {{ bulkAggregateRunning
              ? `${t('intgTimelineAggregating')} ${bulkAggregateProgress?.percentage ?? 0}%`
              : `${t('intgTimelineBtnAggregateAll')} (${unprocessedEvents.length})` }}
          </button>
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
            <v-icon size="16" color="#ff3131">mdi-check-circle</v-icon>
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
                    :class="{
                      'spt-badge--green': item.aggregationStatus === 'completed',
                      'spt-badge--red': item.aggregationStatus === 'failed',
                      'spt-badge--amber': item.aggregationStatus === 'skipped',
                      'spt-badge--gray': !['completed', 'failed', 'skipped'].includes(item.aggregationStatus),
                    }"
                  >
                    {{
                      item.aggregationStatus === 'completed' ? t('intgTimelineStatusAggregated')
                        : item.aggregationStatus === 'failed' ? t('intgTimelineStatusFailed')
                        : item.aggregationStatus === 'skipped' ? t('intgTimelineStatusSkipped')
                        : t('intgTimelineStatusUnprocessed')
                    }}
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
                      :disabled="processingEventId === item.id || stalledEventIds.includes(item.id) || bulkAggregateRunning"
                      :title="stalledEventIds.includes(item.id)
                        ? t('intgTimelineStillProcessingTooltip')
                        : bulkAggregateRunning
                          ? t('intgTimelineAggregateAllTooltip')
                          : (item.aggregationStatus === 'completed' ? t('intgTimelineRerunAggTooltip') : t('intgTimelineRunAggTooltip'))"
                      @click="handleProcessSingle(item.id)"
                    >
                      <v-progress-circular v-if="processingEventId === item.id" indeterminate size="11" width="2" color="currentColor" />
                      <v-icon v-else-if="stalledEventIds.includes(item.id)" size="12">mdi-clock-outline</v-icon>
                      <v-icon v-else size="12">mdi-cog-play</v-icon>
                      {{
                        stalledEventIds.includes(item.id) ? t('intgTimelineStillProcessingBtn')
                          : (item.aggregationStatus === 'completed' ? t('intgTimelineBtnRerun') : t('intgTimelineBtnAggregate'))
                      }}
                    </button>
                    <button
                      v-if="item._raw?.weezeventEventId"
                      class="spt-act-btn spt-act-btn--amber"
                      :disabled="unmappingEventId === item.id || (bulkAggregateLocked && item.aggregationStatus !== 'completed')"
                      :title="(bulkAggregateLocked && item.aggregationStatus !== 'completed') ? t('intgTimelineAggregateAllTooltip') : t('intgTimelineUnmapTooltip')"
                      @click="handleUnmapEvent(item)"
                    >
                      <v-progress-circular v-if="unmappingEventId === item.id" indeterminate size="11" width="2" color="currentColor" />
                      <v-icon v-else size="12">mdi-link-off</v-icon>
                      {{ t('intgTimelineBtnUnmap') }}
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
            <v-icon size="16" color="#ff3131">mdi-information-outline</v-icon>
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
        <v-icon size="16" color="#ff3131">mdi-check-circle</v-icon>
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
      <div class="spt-dialog" :class="{ 'spt-dialog--dark': isDark }">
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
import { formatNumber } from '@/composables/useFormatters'
import { currentIntlLocale } from '@/composables/useNumberFormat'
import { formatDateMedium } from '@/utils/dateFr'
import { useTimelineProcessing } from '@/composables/useTimelineProcessing'
import { useSynchronization } from '@/composables/useSynchronization'
import { getJobProgress, getEventBreakdown, getEventMinuteChart } from '@/api/endpoints/aggregation.api'
import { createEvent, updateEvent, resolveWeezeventLink } from '@/api/endpoints/event.api'
import { updateWeezeventEventMetadata, syncWeezeventEventAttendees, getWeezeventEventsForSpace } from '@/api/endpoints/space.api'
import EventTimelineProgressIndicator from '@/components/EventTimelineProgressIndicator.vue'
import MapEventToExistingDialog from './dialogs/MapEventToExistingDialog.vue'
import CreateEventDialog from './dialogs/CreateEventDialog.vue'
import EventBreakdownDrawer from './dialogs/EventBreakdownDrawer.vue'

// Poll cadence for a single event's aggregation job (handleProcessSingle)
const SINGLE_EVENT_POLL_INTERVAL_MS = 1000
const SINGLE_EVENT_POLL_MAX_ATTEMPTS = 120 // ~2 min
const SINGLE_EVENT_RETRY_DELAY_MS = 5000 // network/timeout retry before reloading the timeline
// Poll cadence for the final sync job (waitForSyncJob)
const SYNC_JOB_POLL_INTERVAL_MS = 2500
// Timeout d'inactivité (pas de durée totale) : réinitialisé à chaque progrès constaté
// (progress.current) — cf. waitForSyncJob(). Un gros tenant peut légitimement tourner
// longtemps tant qu'il avance ; on n'abandonne que si plus rien ne bouge pendant ce délai.
const SYNC_JOB_POLL_MAX_STALL_MS = 10 * 60 * 1000
// Batch sizes for bulkCreateEvents
const BULK_PATCH_BATCH_SIZE = 10
const BULK_CREATE_BATCH_SIZE = 5
// Poll budget for the bulk "Tout agréger" job: scales with event count since a single
// backend job processes them sequentially (see AggregationService.executeProcessEvents).
const BULK_AGGREGATE_POLL_ATTEMPTS_PER_EVENT = 15 // ~15s de marge par event, cadence SINGLE_EVENT_POLL_INTERVAL_MS

export default {
  name: 'StepProcessTimeline',
  components: {
    EventTimelineProgressIndicator,
    MapEventToExistingDialog,
    CreateEventDialog,
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
      loadTimeline, processSingleEvent, processMultipleEvents,
    } = useTimelineProcessing()
    const {
      loading: syncing, error: syncError, result: syncResult,
      phase: syncComposablePhase,
      startSync, checkProgress, reset: resetSync,
    } = useSynchronization()
    return {
      t,
      formatNumber,
      events, unregisteredDates, weezeventEvents,
      transactionStats, hasMappings,
      loading, processing, error,
      loadTimeline, processSingleEvent, processMultipleEvents,
      syncing, syncError, syncResult, syncComposablePhase, startSync, checkProgress, resetSync,
    }
  },
  data() {
    return {
      activeTab: 'covered',
      showRegisteredEvents: true,
      processingEventId: null,
      // Events whose single-event poll timed out without a confirmed terminal status:
      // kept locked (no re-click) until loadTimeline reports a real resolved status.
      stalledEventIds: [],
      // Abandon flag checked inside waitForSyncJob's poll loop
      syncPollAbandoned: false,
      // §2 — progress indicator
      currentEventProgress: null,
      // "Tout agréger" — job unique côté back couvrant plusieurs eventIds (processEvents
      // accepte déjà un tableau ; pas besoin de boucler côté front comme l'ancien
      // processAllEvents supprimé en BUG-221).
      bulkAggregateRunning: false,
      bulkAggregateProgress: null,
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
      // Snackbar feedback
      feedbackSnackbar: false,
      feedbackSnackbarText: '',
      feedbackSnackbarColor: 'success',
      // Minute chart (pré-agrégé depuis SpaceRevenueMinuteAgg)
      minuteChartData: {},      // { [eventId]: { data: [{ minute, revenueHt, ... }] } }
      minuteChartLoading: {},   // { [eventId]: boolean }
      // Mapping WeezeventEvent → DataFriday Event { weezEventId: dfEventId }
      weezEventMappings: {},
      unmappingEventId: null,
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
    // Verrouille "Tout agréger" tant qu'un job (bulk ou par ligne) touchant un des events
    // ciblés n'a pas confirmé un état terminal — évite de relancer un 2e job concurrent.
    bulkAggregateLocked() {
      return this.bulkAggregateRunning || this.unprocessedEvents.some(e => this.stalledEventIds.includes(e.id))
    },
    unmappedCount() {
      // BUG-361-02 : un conteneur de saison/site (isSeasonContainer, posé par getStep4Context)
      // ne désigne jamais un match précis — ne pas le compter comme "à mapper", il ne le sera
      // jamais individuellement.
      return (this.weezeventEvents || []).filter(e => !e.isSeasonContainer && !this.weezEventMappings[e.id]).length
    },
    patchableEventsCount() {
      if (!this.spaceId) return 0
      const currentSpaceIds = new Set((this.events || []).map(e => String(e.id)))
      return Object.values(this.weezEventMappings)
        .filter(dfId => dfId && !currentSpaceIds.has(String(dfId)))
        .length
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
      return `${processed} ${this.t('intgTimelineEvent')}${processed !== 1 ? 's' : ''} ${this.t('intgTimelineAggregatedWord')}${processed !== 1 ? 's' : ''} · ${matched.toLocaleString(currentIntlLocale())} ${this.t('intgTimelineTransactionsMatched')}`
    },
  },
  mounted() {
    if (this.spaceId) {
      // #10 — loadTimeline utilise step4-context (timeline + weezEvents + hasMappings en 1 appel)
      this.loadTimeline(this.spaceId, this.location.id)
      // Réhydrate weezEventMappings (liens dfEventId persistés) au chargement,
      // symétriquement à loadTimeline, pour que "Créer et lier tout" ne recrée pas de doublons.
      this.loadWeezeventEvents()
    }
  },
  unmounted() {
    if (this.timerInterval) clearInterval(this.timerInterval)
    // Signale à waitForSyncJob() d'arrêter son polling si le composant est démonté
    // pendant l'attente (jusqu'à 10 min).
    this.syncPollAbandoned = true
  },
  watch: {
    spaceId(val) {
      if (val) {
        this.coveredPage = 1
        this.uncoveredPage = 1
        this.loadTimeline(val, this.location.id)
        this.loadWeezeventEvents()
      }
    },
    activeTab() {
      this.coveredPage = 1
      this.uncoveredPage = 1
    },
    // Dès qu'un event ressort de "pending" via un rechargement de la timeline (statut
    // terminal confirmé côté backend), on lève le verrou de re-soumission.
    events: {
      handler(list) {
        if (!this.stalledEventIds.length) return
        const resolvedIds = new Set(
          (list || [])
            .filter(e => e.aggregationStatus && e.aggregationStatus !== 'pending')
            .map(e => e.id)
        )
        if (resolvedIds.size) {
          this.stalledEventIds = this.stalledEventIds.filter(id => !resolvedIds.has(id))
          if (resolvedIds.has(this.processingEventId)) {
            this.processingEventId = null
          }
        }
      },
      deep: true,
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
      return formatDateMedium(dateStr) || '—'
    },
    // A19 : méthode checkMappings() supprimée — code mort jamais appelé, superseded par
    // step4-context (hasMappings fourni par loadTimeline). hasMappings reste exposé.
    // handleProcessAll()/cancelProcessing() (traitement en masse) supprimées — aucun
    // point d'appel dans le template (seul handleProcessSingle, câblé au bouton "Traiter"
    // par ligne, est atteignable). Voir aussi useTimelineProcessing.js::processAllEvents,
    // supprimé pour la même raison.
    // §2 — polling progress pendant le traitement d'un event
    async handleProcessSingle(eventId) {
      this.processingEventId = eventId
      this.currentEventProgress = { phase: this.t('intgTimelineInitializing'), percentage: 0, status: 'initializing' }
      // reachedTerminal doit rester visible du bloc `finally` pour ne relâcher le verrou
      // de re-soumission (processingEventId / stalledEventIds) qu'en cas d'état terminal
      // confirmé. `stalled` marque au contraire un timeout/une erreur réseau où le job
      // backend tourne peut-être toujours.
      let reachedTerminal = false
      let stalled = false
      try {
        const result = await this.processSingleEvent(this.spaceId, eventId, this.location.id)
        const jobId = result?.jobId

        // Backend queue-based: attendre l'état terminal du job avant de rafraîchir la timeline.
        if (jobId) {
          const TERMINAL = ['completed', 'failed', 'skipped']
          for (let i = 0; i < SINGLE_EVENT_POLL_MAX_ATTEMPTS; i++) {
            try {
              const progress = await getJobProgress(jobId)
              if (progress) {
                this.currentEventProgress = progress
                if (TERMINAL.includes(progress.status)) { reachedTerminal = true; break }
              }
            } catch {
              // Erreur de polling non critique: continuer
            }

            if (i < SINGLE_EVENT_POLL_MAX_ATTEMPTS - 1) {
              await new Promise((resolve) => setTimeout(resolve, SINGLE_EVENT_POLL_INTERVAL_MS))
            }
          }
        } else {
          // Pas de job à suivre (agrégation synchrone) → considéré comme terminé.
          reachedTerminal = true
        }

        // Distinguer le timeout du polling d'un vrai succès, ET distinguer un statut
        // terminal 'failed'/'skipped' d'un 'completed' (l'état réel vient de
        // this.currentEventProgress.status, pas seulement du booléen reachedTerminal).
        if (reachedTerminal) {
          const terminalStatus = this.currentEventProgress?.status
          if (terminalStatus === 'failed') {
            this.feedbackSnackbarText = this.t('intgTimelineAggFailed')
            this.feedbackSnackbarColor = 'error'
          } else if (terminalStatus === 'skipped') {
            this.feedbackSnackbarText = this.t('intgTimelineAggSkipped')
            this.feedbackSnackbarColor = 'warning'
          } else {
            this.feedbackSnackbarText = this.t('intgTimelineAggDone')
            this.feedbackSnackbarColor = 'success'
          }
        } else {
          stalled = true
          this.feedbackSnackbarText = this.t('intgTimelineAggSlow')
          this.feedbackSnackbarColor = 'warning'
          // Le poll a épuisé son budget sans preuve d'échec — le job backend tourne
          // probablement toujours. Sans ce retry différé, rien ne rafraîchit plus jamais la
          // timeline ensuite : le watcher `events` (plus bas) ne fait que déverrouiller le
          // bouton quand un statut résolu arrive, il n'en déclenche jamais la récupération
          // lui-même. Même délai que la branche erreur réseau ci-dessous (retry unique, pas
          // de re-poll infini).
          setTimeout(() => this.loadTimeline(this.spaceId, this.location.id), SINGLE_EVENT_RETRY_DELAY_MS)
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
          stalled = true
          this.feedbackSnackbarText = this.t('intgTimelineProcessingBackground')
          this.feedbackSnackbarColor = 'info'
          this.feedbackSnackbar = true
          setTimeout(() => this.loadTimeline(this.spaceId, this.location.id), SINGLE_EVENT_RETRY_DELAY_MS)
        } else {
          // Vraie erreur (validation, permission, ...) — pas un timeout : on peut relâcher
          // le verrou et laisser l'utilisateur réessayer immédiatement.
          reachedTerminal = true
          this.feedbackSnackbarText = `${this.t('intgTimelineAggErrorPrefix')} ${err.message}`
          this.feedbackSnackbarColor = 'error'
          this.feedbackSnackbar = true
        }
      } finally {
        this.currentEventProgress = null
        if (stalled) {
          if (!this.stalledEventIds.includes(eventId)) this.stalledEventIds.push(eventId)
        } else {
          this.stalledEventIds = this.stalledEventIds.filter(id => id !== eventId)
        }
        // Ne relâcher le verrou (autoriser un nouveau clic sur "Traiter") que si un état
        // terminal a réellement été confirmé. En cas de timeout/erreur réseau, le bouton
        // reste verrouillé (voir stalledEventIds) jusqu'à ce que loadTimeline() (via le
        // watcher `events`) rapporte un statut résolu.
        if (reachedTerminal) {
          this.processingEventId = null
        }
      }
      await this.loadTimeline(this.spaceId, this.location.id)
    },
    // "Tout agréger" — même job backend que handleProcessSingle (processEvents accepte déjà
    // un tableau d'eventIds et les traite en un seul job avec progression cumulée), juste
    // appelé une fois avec tous les events "Couvertes" non agrégés au lieu d'un par ligne.
    // Le sync des présences Weezevent est géré automatiquement côté back pour ce chemin
    // (executeProcessEvents, section "Auto-sync attendees") — pas besoin de le refaire ici.
    async handleAggregateAll() {
      if (this.bulkAggregateLocked || this.processingEventId) return
      const targetIds = this.unprocessedEvents.map(e => e.id)
      if (!targetIds.length) return

      this.bulkAggregateRunning = true
      this.bulkAggregateProgress = { phase: this.t('intgTimelineInitializing'), percentage: 0, status: 'initializing' }
      let reachedTerminal = false
      try {
        const result = await this.processMultipleEvents(this.spaceId, targetIds, this.location.id)
        const jobId = result?.jobId

        if (jobId) {
          const TERMINAL = ['completed', 'failed', 'skipped']
          const maxAttempts = targetIds.length * BULK_AGGREGATE_POLL_ATTEMPTS_PER_EVENT
          for (let i = 0; i < maxAttempts; i++) {
            try {
              const progress = await getJobProgress(jobId)
              if (progress) {
                this.bulkAggregateProgress = progress
                if (TERMINAL.includes(progress.status)) { reachedTerminal = true; break }
              }
            } catch {
              // Erreur de polling non critique: continuer
            }
            if (i < maxAttempts - 1) {
              await new Promise((resolve) => setTimeout(resolve, SINGLE_EVENT_POLL_INTERVAL_MS))
            }
          }
        } else {
          reachedTerminal = true
        }

        if (reachedTerminal) {
          const terminalStatus = this.bulkAggregateProgress?.status
          if (terminalStatus === 'failed') {
            this.feedbackSnackbarText = this.t('intgTimelineAggFailed')
            this.feedbackSnackbarColor = 'error'
          } else {
            this.feedbackSnackbarText = this.t('intgTimelineBulkAggDone')
            this.feedbackSnackbarColor = 'success'
          }
        } else {
          this.feedbackSnackbarText = this.t('intgTimelineAggSlow')
          this.feedbackSnackbarColor = 'warning'
          // Même raisonnement que handleProcessSingle : sans ce retry différé, rien ne
          // rafraîchit plus jamais la timeline après un poll épuisé (le watcher `events` ne
          // fait que déverrouiller les boutons, il ne relance pas loadTimeline() lui-même).
          setTimeout(() => this.loadTimeline(this.spaceId, this.location.id), SINGLE_EVENT_RETRY_DELAY_MS)
        }
        this.feedbackSnackbar = true
      } catch (err) {
        // Même distinction que handleProcessSingle : une erreur réseau/timeout ne prouve pas
        // que le job backend s'est arrêté — on verrouille (voir finally) plutôt que de laisser
        // repartir un 2e job sur les mêmes events. Une vraie erreur (validation, permission)
        // libère immédiatement pour permettre un nouvel essai.
        const isNetworkOrTimeout = !err.response || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED'
        if (isNetworkOrTimeout) {
          this.feedbackSnackbarText = this.t('intgTimelineProcessingBackground')
          this.feedbackSnackbarColor = 'info'
        } else {
          reachedTerminal = true
          this.feedbackSnackbarText = `${this.t('intgTimelineAggErrorPrefix')} ${err.message}`
          this.feedbackSnackbarColor = 'error'
        }
        this.feedbackSnackbar = true
      } finally {
        this.bulkAggregateRunning = false
        this.bulkAggregateProgress = null
        // Pas d'état terminal confirmé : le job backend tourne peut-être toujours sur ces
        // events. On réutilise le verrou stalledEventIds (déjà nettoyé par le watcher `events`
        // dès qu'un statut terminal remonte) pour bloquer les boutons "Agréger"/"Tout agréger"
        // sur ces events plutôt que de risquer un 2e job concurrent sur les mêmes lignes.
        if (!reachedTerminal) {
          for (const id of targetIds) {
            if (!this.stalledEventIds.includes(id)) this.stalledEventIds.push(id)
          }
        }
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
      let lastProgressAt = Date.now()
      let lastProgressSignature = null
      while (Date.now() - lastProgressAt < SYNC_JOB_POLL_MAX_STALL_MS) {
        // Le composant a été démonté (changement d'étape du wizard, fermeture) : on
        // arrête le polling au lieu de continuer en arrière-plan.
        if (this.syncPollAbandoned) return
        await new Promise(resolve => setTimeout(resolve, SYNC_JOB_POLL_INTERVAL_MS))
        if (this.syncPollAbandoned) return
        const progress = await this.checkProgress()
        if (this.syncPollAbandoned) return
        if (!progress) continue
        const signature = `${progress.current ?? ''}|${progress.percentage ?? ''}`
        if (signature !== lastProgressSignature) {
          lastProgressSignature = signature
          lastProgressAt = Date.now()
        }
        const status = (progress.status || progress.state || '').toLowerCase()
        if (['completed', 'done', 'finished', 'success'].includes(status)) return
        if (['failed', 'error', 'cancelled'].includes(status)) {
          throw new Error(progress.error || progress.message || this.t('intgTimelineSyncFailed'))
        }
      }
      // Aucun progrès depuis SYNC_JOB_POLL_MAX_STALL_MS — job probablement bloqué. On reload
      // quand même la timeline (elle reflétera l'état réel côté backend).
    },
    handleRetry() {
      this.resetSync()
      this.syncPhase = 'idle'
      this.syncExecutionMode = 'full'
      this.elapsedSeconds = 0
    },
    // handleCreateEventFromWeez() (ouverture du dialog de création depuis l'onglet
    // "Événements Weezevent" mort) supprimée — aucun point d'appel dans le template.
    // Démappe le LIEN vers la donnée Weezevent/Digifood (weezeventEventId → null), PAS l'event
    // du space (2026-08-25, corrige un défaut de conception signalé par l'utilisateur : l'event
    // est un event DE l'espace, retirer spaceId le faisait disparaître de la liste de ce space,
    // rendant tout re-mapping ultérieur impossible faute de pouvoir le retrouver). L'event reste
    // visible ici, juste "non lié" — ses agrégats périmés sont purgés côté backend
    // (events.service.ts, resolveWeezeventLink).
    async handleUnmapEvent(event) {
      const label = event.name || event.eventName || event.id
      this.unmappingEventId = event.id
      try {
        const updated = await resolveWeezeventLink(event.id, null)
        this.$store.dispatch('events/updateEvent', updated?.data ?? updated)
        await this.loadTimeline(this.spaceId, this.location.id)
        this.feedbackSnackbarText = `${this.t('intgTimelineEvent')} « ${label} » ${this.t('intgTimelineUnmappedSuffix')}`
        this.feedbackSnackbarColor = 'success'
        this.feedbackSnackbar = true
      } catch (err) {
        console.error('[StepProcessTimeline] Failed to unmap event:', err)
        this.feedbackSnackbarText = this.t('intgTimelineUnmapError')
        this.feedbackSnackbarColor = 'error'
        this.feedbackSnackbar = true
      } finally {
        this.unmappingEventId = null
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
        // Rester en base UTC (cohérent avec toInputDate/roundUpToQuarterHour) plutôt que
        // de construire un Date local ici : un mélange des deux peut faire basculer le
        // jour calendaire dans le mauvais sens pour un utilisateur loin d'UTC.
        if (addDay && baseEndDate) {
          const d = new Date(baseEndDate + 'T00:00:00Z')
          d.setUTCDate(d.getUTCDate() + 1)
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
      // Utiliser les accesseurs UTC (pas le fuseau local du navigateur) pour rester
      // cohérent avec baseEndDate (toInputDate = troncature calendaire UTC de l'ISO
      // backend). Mélanger UTC et local ici pouvait mal classer une transaction proche
      // de minuit UTC pour un utilisateur loin d'UTC.
      const origMidnight = new Date(d)
      origMidnight.setUTCHours(0, 0, 0, 0)
      const nextMidnight = new Date(origMidnight)
      nextMidnight.setUTCDate(origMidnight.getUTCDate() + 1)
      const addDay = rounded.getTime() >= nextMidnight.getTime()
      const h = rounded.getUTCHours()
      const m = rounded.getUTCMinutes()
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
      // BUG-361-02 : exclut les conteneurs de saison/site (isSeasonContainer, posé par
      // getStep4Context) — un conteneur ne désigne jamais un match précis ; le créer produirait
      // un faux Event DataFriday de plusieurs mois (vérifié en base : 7 events "Saison XX/YY"
      // déjà créés par erreur avant ce fix, certains avec du CA agrégé dessus).
      const toCreate = (this.weezeventEvents || []).filter(e => !e.isSeasonContainer && !this.weezEventMappings[e.id])

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
          for (let i = 0; i < toPatch.length; i += BULK_PATCH_BATCH_SIZE) {
            const batch = toPatch.slice(i, i + BULK_PATCH_BATCH_SIZE)
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
          // BUG-109/361-02 : "Créer et lier tout" ne déclenchait jusqu'ici jamais l'agrégation —
          // bouton "Tout agréger" séparé, facile à oublier, symptôme observé "Analyse vide dès
          // que je fais une data integration". Fire-and-forget : handleAggregateAll gère son
          // propre état/snackbar, ne bloque pas la fermeture de ce dialog.
          if (patchedCount > 0) this.handleAggregateAll()
          return
        }

        // ── Phase 1 : créer les events DF et les lier au Weezevent ──
        this.bulkCreateEventsPhase = 'creating'
        let createdCount = 0
        let relinkedCount = 0
        let skippedCount = 0

        for (let i = 0; i < toCreate.length; i += BULK_CREATE_BATCH_SIZE) {
          const chunk = toCreate.slice(i, i + BULK_CREATE_BATCH_SIZE)
          const results = await Promise.allSettled(
            chunk.map(async (weezEvent) => {
              const toDate = d => (d ? String(d).slice(0, 10) : null)
              const startDate = toDate(weezEvent.startDate || weezEvent.start_date || weezEvent.date || weezEvent.start || weezEvent.eventDate || weezEvent.event_date)
              const rawEndDate = toDate(weezEvent.endDate || weezEvent.end_date || weezEvent.end)
              // Un `live_end` Weezevent qui déborde de quelques heures après minuit (wallet
              // cashless encore ouvert après le coup de sifflet final) ne fait PAS de ce match
              // un event de 2 jours — resolveEventSalesScope (spaces.service.ts) ajoute déjà
              // +1 jour à eventEndDate (convention métier décidée le 30/07 : eventEndDate =
              // dernier jour INCLUS). Un rawEndDate à startDate+1 y ajouterait un jour de trop,
              // débordant sur l'event du lendemain (BUG-339-02 constaté : CA de deux matchs
              // additionné). On ne garde rawEndDate que s'il dépasse vraiment 1 jour d'écart —
              // signe d'un event réellement multi-jours (festival, etc.).
              const daysBetween = rawEndDate ? (new Date(rawEndDate) - new Date(startDate)) / 86_400_000 : 0
              const endDate = (rawEndDate && daysBetween > 1) ? rawEndDate : startDate
              if (!startDate) {
                console.warn('[bulkCreateEvents] champs disponibles sur le weezEvent sans date:', JSON.stringify(weezEvent))
                return { __skipped: true }
              }
              // BUG-366-02 : un event de CET espace, non lié (démappé, ou jamais lié), pour la
              // MÊME date que ce weezEvent → le relier au lieu d'en créer un second. Sans cette
              // vérification, "Démapper" puis "Créer et lier tout" créait un doublon (un nouvel
              // Event fraîchement lié, l'ancien démappé restant orphelin à côté).
              // BUG-368-02 : exige aussi que l'event n'appartienne à AUCUNE intégration, ou
              // déjà à celle-ci — sans ça, un event SFP démappé pourrait se faire voler par un
              // weezEvent PFC de la même date (deux clubs, même jour, cf. Stade Jean Bouin).
              const existingUnlinked = (this.events || []).find(e => {
                const raw = e._raw || {}
                return !raw.weezeventEventId
                  && (!raw.integrationId || raw.integrationId === this.location.id)
                  && toDate(raw.eventStartDate ?? raw.eventDate ?? e.startDate) === startDate
              })
              let targetEvent
              if (existingUnlinked) {
                targetEvent = existingUnlinked._raw
                // BUG-368-02 : un event legacy (jamais tagué) qu'on relie ici passe aussi sur
                // le mécanisme robuste, plutôt que de rester coincé sur le mode conteneur legacy.
                if (!targetEvent.integrationId) {
                  const updated = await updateEvent(targetEvent.id, { integrationId: this.location.id })
                  targetEvent = { ...targetEvent, ...(updated?.data ?? updated) }
                }
              } else {
                const res = await createEvent({
                  name: weezEvent.name || `${this.t('intgTimelineEventFallbackName')} ${weezEvent.id}`,
                  eventDate: startDate,
                  eventStartDate: startDate,
                  eventEndDate: endDate,
                  spaceId: this.spaceId,
                  // BUG-368-02 : source de vérité explicite pour l'agrégation (mode
                  // integration-range, prioritaire) — remplace la déduction implicite via
                  // weezeventEventId → conteneur de saison (BUG-146-01, legacy).
                  integrationId: this.location.id,
                })
                targetEvent = res?.data || res
                if (!targetEvent?.id) throw new Error('No id returned')
                await this.$store.dispatch('events/addEvent', targetEvent)
              }
              // BUG-331-02 : pose le VRAI lien typé (Event.weezeventEventId), lu par
              // executeProcessEvents pour le rattachement exact des transactions (BUG-330-02) —
              // dfEventId ci-dessous n'est qu'un miroir pour réhydrater weezEventMappings côté
              // front (loadWeezeventEvents), synchronisé aussi côté backend depuis le 2026-08-25
              // (resolveWeezeventLink) pour tout appelant, pas seulement celui-ci.
              await resolveWeezeventLink(targetEvent.id, weezEvent.id)
              await updateWeezeventEventMetadata(this.spaceId, weezEvent.id, { dfEventId: targetEvent.id })
              const updated = { ...this.weezEventMappings }
              updated[weezEvent.id] = targetEvent.id
              this.weezEventMappings = updated
              return { ...targetEvent, __relinked: !!existingUnlinked }
            })
          )
          for (const result of results) {
            if (result.status === 'fulfilled') {
              if (result.value?.__skipped) skippedCount++
              else if (result.value?.__relinked) relinkedCount++
              else createdCount++
            } else {
              console.warn('[bulkCreateEvents] create error:', result.reason)
              this.bulkCreateEventsErrors++
            }
          }
          this.bulkCreateEventsProgress = Math.min(i + BULK_CREATE_BATCH_SIZE, toCreate.length)
        }

        const patchSummary = patchedCount > 0 ? `${patchedCount} ${this.t('intgTimelineBulkEventsAttached')} ` : ''
        const relinkSummary = relinkedCount > 0 ? ` ${relinkedCount} ${this.t('intgTimelineBulkEventsRelinked')}` : ''
        const skipSummary = skippedCount > 0 ? ` ${skippedCount} ${this.t('intgTimelineBulkSkippedNoDate')}` : ''
        if (this.bulkCreateEventsErrors > 0) {
          this.bulkCreateEventsPhase = 'error'
          this.bulkCreateEventsMessage = `${patchSummary}${createdCount} ${this.t('intgTimelineBulkCreatedOn')} ${toCreate.length - skippedCount}. ${this.bulkCreateEventsErrors} ${this.t('intgTimelineBulkFailedShort')}${skipSummary}${relinkSummary}`
        } else {
          this.bulkCreateEventsPhase = 'done'
          this.bulkCreateEventsMessage = `${patchSummary}${createdCount} ${this.t('intgTimelineBulkCreatedLinked')}${relinkSummary}${skipSummary}`
        }
        await this.loadTimeline(this.spaceId, this.location.id)
        // BUG-109/361-02 : voir commentaire jumeau ci-dessus (branche "patch seul") — même
        // déclenchement automatique ici, après création.
        if (patchedCount > 0 || createdCount > 0 || relinkedCount > 0) this.handleAggregateAll()
      } catch (err) {
        console.error('[bulkCreateEvents] fatal error:', err)
        this.bulkCreateEventsPhase = 'error'
        this.bulkCreateEventsMessage = err?.response?.data?.message || err?.message || this.t('intgTimelineGenericError')
      } finally {
        this.bulkCreateEventsRunning = false
      }
    },

    // Le paramètre pendingWeezEventLink n'est plus jamais renseigné par un appelant
    // vivant depuis la suppression de handleCreateEventFromWeez (seule source qui le
    // remplissait) ; saveWeezEventMapping (son seul consommateur) est supprimée pour la
    // même raison.
    async handleEventCreated({ event }) {
      this.$store.dispatch('events/addEvent', event)
      await this.loadTimeline(this.spaceId, this.location.id)
    },

    // Enrichissement metadata events Weezevent
    async loadWeezeventEvents() {
      try {
        // BUG-319-02 : sans integrationId, le backend pouvait résoudre une intégration arbitraire
        // quand l'espace est mappé par plusieurs — weezEventMappings se réhydratait alors avec les
        // liens d'une AUTRE intégration, symétrique à loadTimeline juste au-dessus dans mounted().
        const data = await getWeezeventEventsForSpace(this.spaceId, this.location.id)
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
    // loadAmbiguousMatches/handleResolveWeezeventLink (banner + ResolveWeezeventLinkDialog,
    // BUG-021 résolution manuelle) supprimées le 2026-08-25 : le banner proposait des conteneurs
    // de saison/site comme candidats de résolution (BUG-361-02) et était jugé sans valeur une fois
    // ce cas corrigé — resolveWeezeventLink (l'endpoint PATCH lui-même) reste utilisé par
    // bulkCreateEvents pour le rattachement automatique, seul ce flux manuel est retiré.
    // saveWeezEventMapping/openEnrichDialog/saveEnrichment (onglet "Événements Weezevent"
    // mort) supprimées : aucun point d'appel dans le template. EnrichEventDialog n'était
    // de toute façon jamais ouvrable (son seul déclencheur, openEnrichDialog, n'était
    // jamais invoqué) — le mount a été retiré du template, et le fichier
    // EnrichEventDialog.vue (devenu sans importeur) a été supprimé.
    // toggleTimeline/loadEventTimeline/timelineShops/timelineArticles/filteredTimeline/
    // timelineSummary/exportTimelineCsv (table de timeline minute par minute) supprimées :
    // aucun point d'appel dans le template, fonctionnalité distincte de et remplacée par
    // EventBreakdownDrawer (onglet graphique, ci-dessous), qui reste vivant.
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
    // syncAllAttendees/syncAttendees (actions de l'onglet "Événements Weezevent" mort)
    // supprimées : aucun point d'appel dans le template. L'enrichissement attendees pour
    // le chemin vivant reste géré par l'appel direct à syncWeezeventEventAttendees() dans
    // handleProcessSingle (non-bloquant, après agrégation d'un event).
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
  background: #f9fafb; border: 1.5px solid #e5e7eb;
  border-radius: 14px; padding: 14px 16px;
}
.spt--dark .spt-stats-banner { background: #111827; border-color: rgba(255,255,255,.08); }
.spt-stats-banner__top {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
}
.spt-stats-banner__total { font-size: 13px; font-weight: 700; color: #374151; }
.spt--dark .spt-stats-banner__total { color: #e5e7eb; }
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
/* Bandeaux unifiés : une seule couleur neutre (fond gris, texte gris, icône rouge marque),
   quelle que soit la variante blue/amber — plus de mix de couleurs. */
.spt-banner--blue,
.spt-banner--amber { background: #f9fafb; border: 1.5px solid #e5e7eb; color: #374151; }
.spt--dark .spt-banner--blue,
.spt--dark .spt-banner--amber { background: #111827; border-color: rgba(255,255,255,.08); color: #cbd5e1; }

.spt-banner-btn {
  padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 600;
  border: none; cursor: pointer; white-space: nowrap; flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 5px; transition: all .15s;
}
/* Boutons d'action unifiés : rouge marque (couleur d'action unique) au lieu de bleu/amber/violet. */
.spt-banner-btn--blue,
.spt-banner-btn--amber,
.spt-banner-btn--purple { background: #ff3131; color: #fff; }
.spt-banner-btn--blue:hover:not(:disabled),
.spt-banner-btn--amber:hover:not(:disabled),
.spt-banner-btn--purple:hover:not(:disabled) { background: #b91c1c; }
.spt-banner-btn:disabled { opacity: .6; cursor: not-allowed; }

/* ── Toolbar + pill tabs ── */
.spt-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
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
/* Infobars unifiées : neutre gris (l'icône rouge est posée en inline dans le template).
   Seul --error garde le rouge (sémantique distincte). */
.spt-infobar--success,
.spt-infobar--blue,
.spt-infobar--warning { background: #f9fafb; border: 1px solid #e5e7eb; color: #374151; }
.spt-infobar--error   { background: #fef2f2; border: 1px solid #fecaca; color: #ff3131; }
.spt--dark .spt-infobar--success,
.spt--dark .spt-infobar--blue,
.spt--dark .spt-infobar--warning { background: #111827; border-color: rgba(255,255,255,.08); color: #cbd5e1; }

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

/* Dark — le v-dialog est téléporté hors du .spt--dark, d'où la classe portée sur la carte. */
.spt-dialog--dark { background: #1e293b; }
.spt-dialog--dark .spt-dialog-body { background: #1e293b; }
.spt-dialog--dark .spt-dialog-result__title { color: #f9fafb; }
.spt-dialog--dark .spt-dialog-result__sub { color: #94a3b8; }
.spt-dialog--dark .spt-dialog-footer { border-top-color: rgba(255,255,255,.08); }
.spt-dialog--dark .spt-btn--ghost { color: #cbd5e1; border-color: rgba(255,255,255,.14); }
.spt-dialog--dark .spt-btn--ghost:hover:not(:disabled) { background: #374151; border-color: rgba(255,255,255,.24); color: #fff; }

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
