<template>
  <div class="data-integration-view" :class="{'di--dark': isDark}">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-section">
        <h3 class="sidebar-title">{{ t('diTitle') }}</h3>
        <div class="sidebar-item active">{{ t('diFB') }}</div>
      </div>
    </aside>

    <!-- Main content -->
    <main class="main-content">
      <!-- Title bar -->
      <div class="title-bar">
        <h2 class="title-bar-text">{{ t('diFBIntegration') }}</h2>
        <v-btn color="#ff3131" variant="flat" prepend-icon="mdi-plus" @click="openDrawer('add', null)">
          {{ t('diAddIntegration') }}
        </v-btn>
      </div>

      <!-- Content area -->
      <div class="content-area">
        <!-- Loading -->
        <div v-if="loading" class="empty-state">
          <v-progress-circular indeterminate color="#ff3131" />
        </div>

        <!-- Empty state -->
        <div v-else-if="!integrations.length" class="empty-state">
          <v-icon size="48" color="grey-lighten-1" class="mb-3">mdi-plus</v-icon>
          <p class="text-body-1 text-grey">{{ t('diNoIntegrations') }}</p>
          <p class="text-body-2 text-grey-lighten-1">{{ t('diNoIntegrationsHint') }}</p>
        </div>

        <!-- Integration cards grid -->
        <div v-else class="cards-grid">
          <div
            v-for="integration in integrations"
            :key="integration.id"
            class="integration-card"
          >
            <!-- Card header -->
            <div class="card-header">
              <div class="card-header-left">
                <div class="card-logo-wrap">
                  <v-img :src="integration.type === 'digifood' ? '/img/integration/digifood.png' : '/img/integration/weezevent.png'" width="26" height="26" />
                </div>
                <div>
                  <div class="card-header-title">{{ integration.name }}</div>
                  <div class="card-header-sub">
                    <span class="card-status-dot" />
                    {{ t('diConnected') }} · {{ integration.provider }}
                  </div>
                </div>
              </div>
              <div class="card-header-actions">
                <v-tooltip :text="t('diReconfigure')" location="bottom">
                  <template #activator="{ props: tp }">
                    <button v-bind="tp" class="card-action-btn" :aria-label="t('diReconfigure')" @click="openDrawer(integration.type === 'digifood' ? 'config-digifood' : 'config-weezevent', integration)">
                      <v-icon size="15">mdi-pencil-outline</v-icon>
                    </button>
                  </template>
                </v-tooltip>
                <v-tooltip :text="isIntegrationSyncing(integration) ? t('diRemoveIntegrationSyncWarning') : t('diRemove')" location="bottom">
                  <template #activator="{ props: tp }">
                    <button
                      v-bind="tp"
                      class="card-action-btn card-action-btn--danger"
                      :disabled="isIntegrationSyncing(integration)"
                      :aria-label="isIntegrationSyncing(integration) ? t('diRemoveIntegrationSyncWarning') : t('diRemove')"
                      @click="handleRemoveIntegration(integration.id)"
                    >
                      <v-icon size="15">mdi-trash-can-outline</v-icon>
                    </button>
                  </template>
                </v-tooltip>
              </div>
            </div>

            <!-- Card body -->
            <div class="card-body">
              <div class="card-chips-row">
                <span class="card-chip"><v-icon size="11" class="mr-1">mdi-calendar-outline</v-icon>{{ t('diCreated') }} {{ formatDate(integration.createdAt) }}</span>
                <span v-if="integration.type === 'digifood'" class="card-chip"><v-icon size="11" class="mr-1">mdi-broadcast</v-icon>{{ t('diDigifoodRealtime') }}</span>
                <span v-else class="card-chip"><v-icon size="11" class="mr-1">mdi-office-building-outline</v-icon>{{ t('diOrg') }} {{ integration.organizationId || '—' }}</span>
                <span v-if="integration.type === 'digifood' && integration.posVersion" class="card-chip"><v-icon size="11" class="mr-1">mdi-cellphone-link</v-icon>{{ t('diDigifoodPosVersion') }} {{ integration.posVersion }}</span>
              </div>

              <!-- ── Digifood : temps réel + import CSV (pas de sync API) ── -->
              <template v-if="integration.type === 'digifood'">
                <div class="card-section-label">{{ t('diDigifoodWebhookUrl') }}</div>
                <div class="df-webhook-url">
                  <code>{{ integration.webhookUrl }}</code>
                  <button type="button" class="df-copy-btn" :aria-label="t('diCopy')" @click="copyWebhookUrl(integration.webhookUrl)">
                    <v-icon size="13">{{ copiedUrl === integration.webhookUrl ? 'mdi-check' : 'mdi-content-copy' }}</v-icon>
                  </button>
                </div>
                <p class="df-hint">{{ t('diDigifoodRealtimeHint') }}</p>

                <button
                  class="sync-btn"
                  :disabled="checkingReceptionId === integration.id"
                  @click="checkReception(integration)"
                >
                  <v-progress-circular v-if="checkingReceptionId === integration.id" indeterminate size="14" width="2" color="white" class="mr-2" />
                  <v-icon v-else size="15" class="mr-2">mdi-access-point-check</v-icon>
                  {{ t('diDigifoodCheckReception') }}
                </button>

                <div v-if="receptionMap[integration.id]" class="df-reception" :class="{ 'df-reception--ok': receptionMap[integration.id].lastWebhook }">
                  <template v-if="receptionMap[integration.id].lastWebhook">
                    <v-icon size="13" color="success" class="mr-1">mdi-check-circle-outline</v-icon>
                    {{ t('diDigifoodLastWebhook') }} : {{ formatDate(receptionMap[integration.id].lastWebhook.createdAt) }}
                    ({{ receptionMap[integration.id].lastWebhook.eventType }} · {{ receptionMap[integration.id].lastWebhook.processed ? t('diWebhookStatusOk') : (receptionMap[integration.id].lastWebhook.error ? t('diWebhookStatusError') : t('diWebhookStatusPending')) }})
                  </template>
                  <template v-else>
                    <v-icon size="13" color="warning" class="mr-1">mdi-timer-sand</v-icon>
                    {{ t('diDigifoodNoWebhook') }}
                  </template>
                </div>

                <button class="sync-btn sync-btn--history" @click="openCsvDialog(integration)">
                  <v-icon size="15" class="mr-2">mdi-file-delimited-outline</v-icon>
                  {{ t('diDigifoodImportCsv') }}
                </button>
              </template>

              <!-- ── Weezevent : sync API par fenêtre de dates ── -->
              <template v-else>
              <div class="card-section-label">{{ t('diSyncSectionLabel') }}</div>
              <!-- Date pickers for job-based sync -->
              <div class="sync-date-row">
                <label class="date-input-wrap">
                  <span class="date-input-label">{{ t('diFrom') }}</span>
                  <input
                    type="date"
                    class="date-input"
                    :value="syncFromDates[integration.id] || ''"
                    @input="e => syncFromDates = { ...syncFromDates, [integration.id]: e.target.value }"
                  />
                </label>
                <label class="date-input-wrap">
                  <span class="date-input-label">{{ t('diUntil') }}</span>
                  <input
                    type="date"
                    class="date-input"
                    :value="syncToDates[integration.id] || ''"
                    @input="e => syncToDates = { ...syncToDates, [integration.id]: e.target.value }"
                  />
                </label>
              </div>

              <!-- Sync button -->
              <button
                class="sync-btn"
                :class="{ 'sync-btn--loading': syncingMap[integration.id] }"
                :disabled="syncingMap[integration.id]"
                @click="handleSync(integration)"
              >
                <v-progress-circular
                  v-if="syncingMap[integration.id]"
                  indeterminate size="14" width="2" color="white" class="mr-2"
                />
                <v-icon v-else size="15" class="mr-2">mdi-cloud-sync-outline</v-icon>
                {{ syncingMap[integration.id] ? t('diSyncing') : t('diSyncImport') }}
              </button>

              <!-- Historique des syncs -->
              <template v-if="syncJobsMap[integration.id] && syncJobsMap[integration.id].length">
                <p class="card-section-label" style="margin-top: 20px; margin-bottom:8px;">{{ t('diSyncHistory') }}</p>
                <div class="sync-history">
                <div
                  v-for="job in syncJobsMap[integration.id].slice(0, 5)"
                  :key="job.id"
                >
                  <div
                    class="sync-history-item"
                    @click="toggleJobStats(job.id, job)"
                  >
                    <span
                      class="sync-status-dot"
                      :class="{
                        'sync-status-dot--success': job.status === 'COMPLETED',
                        'sync-status-dot--error': job.status === 'FAILED',
                        'sync-status-dot--cancelled': job.status === 'CANCELLED',
                        'sync-status-dot--warning': isJobActive(job),
                      }"
                    />
                    <span class="sync-history-range">
                      {{ formatDate(job.fromDate) }} → {{ formatDate(job.toDate) }}
                    </span>
                    <span class="sync-history-count">
                      {{ job.totalCollected ? formatNumber(job.totalCollected) + ' ' + t('diItemsUnit') : '' }}
                    </span>
                    <span class="sync-history-date">
                      {{ formatDate(job.startedAt) }}
                    </span>
                    <v-icon size="12" class="ml-1 text-medium-emphasis" :style="{ transform: expandedJobId === job.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }">
                      mdi-chevron-down
                    </v-icon>
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      color="#ff3131"
                      class="ml-1 sync-history-item__action"
                      :loading="deletingJobId === job.id || cancellingJobId === job.id"
                      :aria-label="isJobActive(job) ? t('diCancelStuckSync') : t('diDeleteSyncJob')"
                      @click.stop="isJobActive(job) ? cancelSyncJob(integration.id, job.id) : deleteSyncJob(integration.id, job.id)"
                    >
                      <v-tooltip activator="parent" location="top">
                        {{ isJobActive(job) ? t('diCancelStuckSync') : t('diDeleteSyncJob') }}
                      </v-tooltip>
                      <v-icon size="13">{{ isJobActive(job) ? 'mdi-close-circle-outline' : 'mdi-delete-outline' }}</v-icon>
                    </v-btn>
                  </div>

                  <!-- Panel stats détaillées -->
                  <div v-if="expandedJobId === job.id" class="sync-job-stats">
                    <v-progress-linear v-if="loadingStatsJobId === job.id" indeterminate height="2" color="primary" class="mb-2" />
                    <div v-if="(job.status === 'FAILED' || job.status === 'CANCELLED') && job.errorMessage" class="cd-banner" :class="job.status === 'CANCELLED' ? 'cd-banner--neutral' : 'cd-banner--error'">
                      <v-icon size="14" class="mr-1">{{ job.status === 'CANCELLED' ? 'mdi-cancel' : 'mdi-alert-circle-outline' }}</v-icon>
                      <span>{{ job.errorMessage }}</span>
                    </div>
                    <template v-else-if="jobStatsMap[job.id]">
                      <div class="sync-job-stats-grid">
                        <div class="sync-job-stat-item">
                          <span class="sync-job-stat-value">{{ formatNumber(jobStatsMap[job.id].transactions) }}</span>
                          <span class="sync-job-stat-label">{{ t('diJobStatTransactions') }}</span>
                        </div>
                        <div class="sync-job-stat-item">
                          <span class="sync-job-stat-value">{{ formatNumber(jobStatsMap[job.id].events) }}</span>
                          <span class="sync-job-stat-label">{{ t('diJobStatEvents') }}</span>
                        </div>
                        <div class="sync-job-stat-item">
                          <span class="sync-job-stat-value">{{ formatNumber(jobStatsMap[job.id].locations) }}</span>
                          <span class="sync-job-stat-label">{{ t('diJobStatLocations') }}</span>
                        </div>
                        <div class="sync-job-stat-item">
                          <span class="sync-job-stat-value">{{ formatNumber(jobStatsMap[job.id].products) }}</span>
                          <span class="sync-job-stat-label">{{ t('diJobStatProducts') }}</span>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
              </template>
              </template>

              <div class="card-divider" />

              <!-- Espace row (expandable) -->
              <button class="location-row" @click="toggleExpand(integration.id)">
                <div class="d-flex align-center" style="gap:6px">
                  <v-icon size="14" class="text-medium-emphasis">mdi-map-marker-outline</v-icon>
                  <span>{{ t('diSpaces') }}</span>
                </div>
                <div class="location-row-right">
                  <span
                    class="location-badge"
                    :class="getSpaceForIntegration(integration) ? 'location-badge--linked' : ''"
                  >{{ getSpaceForIntegration(integration) ? 1 : 0 }}</span>
                  <v-icon size="16" :style="{ transform: expandedCards[integration.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }">
                    mdi-chevron-down
                  </v-icon>
                </div>
              </button>

              <!-- Expanded espace section -->
              <div v-if="expandedCards[integration.id]" class="location-list">
                <template v-if="getSpaceForIntegration(integration)">
                  <div class="location-item">
                    <div class="location-item-left">
                      <v-icon size="14" color="success" class="mr-1">mdi-check-circle-outline</v-icon>
                      <span>{{ getSpaceForIntegration(integration).spaceName || getSpaceForIntegration(integration).spaceId }}</span>
                    </div>
                    <button class="location-map-btn" :aria-label="t('diConfigureSpace')" @click="openWizard(integration)">
                      <v-icon size="14" color="#ff3131">mdi-pencil</v-icon>
                    </button>
                  </div>
                </template>
                <div v-else class="location-empty">
                  <span class="text-caption text-medium-emphasis">{{ t('diNoSpaces') }}</span>
                  <button class="location-link-btn" @click="openWizard(integration)">
                    <v-icon size="13" class="mr-1">mdi-plus</v-icon>
                    {{ t('diLinkSpace') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Right-side Drawer -->
    <v-navigation-drawer
      v-model="drawerOpen"
      location="right"
      temporary
      width="440"
      class="config-drawer"
    >
      <!-- ── Add Integration Panel ───────────────────────────────────── -->
      <template v-if="drawerMode === 'add'">
        <!-- Gradient header -->
        <div class="cd-header">
          <div class="cd-header__icon">
            <Plus :size="22" color="white" />
          </div>
          <div class="cd-header__body">
            <div class="cd-header__title">{{ t('diAddIntegrationTitle') }}</div>
            <div class="cd-header__sub">{{ t('diAddIntegrationDesc') }}</div>
          </div>
          <button class="cd-header__close" :aria-label="t('close')" @click="closeDrawer">
            <X :size="16" color="white" />
          </button>
        </div>

        <div class="cd-body">
          <p class="cd-section-label">{{ t('diProvidersAvailable') }}</p>

          <!-- Weezevent option -->
          <button class="cd-provider-card" @click="openDrawer('config-weezevent', null)">
            <div class="cd-provider-card__logo">
              <v-img src="/img/integration/weezevent.png" width="24" height="24" />
            </div>
            <div class="cd-provider-card__info">
              <div class="cd-provider-card__name">Weezevent</div>
              <div class="cd-provider-card__desc">{{ t('diWeezeventDesc') }}</div>
            </div>
            <ChevronRight :size="16" color="#9ca3af" />
          </button>

          <!-- Digifood option -->
          <button class="cd-provider-card" @click="openDrawer('config-digifood', null)">
            <div class="cd-provider-card__logo cd-provider-card__logo--orange">
              <v-img src="/img/integration/digifood.png" width="24" height="24" />
            </div>
            <div class="cd-provider-card__info">
              <div class="cd-provider-card__name">Digifood</div>
              <div class="cd-provider-card__desc">{{ t('diDigifoodDesc') }}</div>
            </div>
            <ChevronRight :size="16" color="#9ca3af" />
          </button>
        </div>
      </template>

      <!-- ── Configure Digifood Panel ───────────────────────────────── -->
      <template v-if="drawerMode === 'config-digifood'">
        <div class="cd-header">
          <button class="cd-header__back" :aria-label="t('back')" @click="openDrawer('add', null)">
            <ArrowLeft :size="16" color="white" />
          </button>
          <div class="cd-header__icon">
            <Settings :size="20" color="white" />
          </div>
          <div class="cd-header__body">
            <div class="cd-header__title">
              {{ editingIntegrationId ? t('diReconfigureDigifood') : t('diConfigureDigifood') }}
            </div>
            <div class="cd-header__sub">{{ t('diDigifoodRealtime') }}</div>
          </div>
          <button class="cd-header__close" :aria-label="t('close')" @click="closeDrawer">
            <X :size="16" color="white" />
          </button>
        </div>

        <div class="cd-body">
          <form @submit.prevent="handleSaveDigifoodConfig">
            <!-- Instance Name -->
            <div class="form-floating cd-field mb-3">
              <input
                id="cd-df-instance-name"
                v-model="cfInstanceName"
                type="text"
                class="form-control cd-input"
                :placeholder="t('diInstanceNamePlaceholder') || ' '"
              />
              <label for="cd-df-instance-name">{{ t('diInstanceName') }}</label>
            </div>
            <p class="cd-field-hint mb-4">{{ t('diInstanceNameHint') }}</p>

            <!-- Webhook secret -->
            <div class="cd-field cd-field--password mb-3">
              <div class="form-floating">
                <input
                  id="cd-df-secret"
                  v-model="cfWebhookSecret"
                  :type="showSecret ? 'text' : 'password'"
                  class="form-control cd-input cd-input--with-btn"
                  :placeholder="editingIntegrationId ? (t('diDigifoodSecretKeepPlaceholder') || ' ') : ' '"
                />
                <label for="cd-df-secret">{{ t('diDigifoodSecret') }}</label>
              </div>
              <button type="button" class="cd-eye-btn" :aria-label="showSecret ? t('diHideSecret') : t('diShowSecret')" @click="showSecret = !showSecret">
                <EyeOff v-if="showSecret" :size="15" />
                <Eye v-else :size="15" />
              </button>
            </div>
            <p class="cd-field-hint mb-4">{{ t('diDigifoodSecretHint') }}</p>

            <!-- Error banner -->
            <div v-if="configError" class="cd-banner cd-banner--error mb-3">
              <span>{{ configError }}</span>
              <button type="button" class="cd-banner__close" :aria-label="t('close')" @click="configError = ''">
                <X :size="12" />
              </button>
            </div>

            <!-- Saved : afficher l'URL de webhook à communiquer à Digifood -->
            <template v-if="configSuccess && digifoodWebhookUrl">
              <div class="cd-banner cd-banner--success mb-3">
                <span>{{ editingIntegrationId ? t('diConfigUpdated') : t('diConfigSaved') }}</span>
              </div>
              <p class="cd-section-label mb-1">{{ t('diDigifoodWebhookUrl') }}</p>
              <div class="df-webhook-url mb-2">
                <code>{{ digifoodWebhookUrl }}</code>
                <button type="button" class="df-copy-btn" @click="copyWebhookUrl(digifoodWebhookUrl)">
                  <v-icon size="14">{{ copiedUrl ? 'mdi-check' : 'mdi-content-copy' }}</v-icon>
                  {{ copiedUrl ? t('diCopied') : t('diCopy') }}
                </button>
              </div>
              <p class="cd-field-hint mb-4">{{ t('diDigifoodWebhookUrlHint') }}</p>
            </template>

            <button
              v-if="!configSuccess"
              type="submit"
              class="cd-btn cd-btn--primary"
              :disabled="configSaving"
            >
              <v-progress-circular v-if="configSaving" indeterminate size="14" width="2" color="white" class="mr-2" />
              {{ editingIntegrationId ? t('diUpdateSave') : t('diSaveConnect') }}
            </button>
            <button
              v-else
              type="button"
              class="cd-btn cd-btn--ghost"
              @click="closeDrawer"
            >
              {{ t('close') }}
            </button>
          </form>
        </div>
      </template>

      <!-- ── Configure Weezevent Panel ──────────────────────────────── -->
      <template v-if="drawerMode === 'config-weezevent'">
        <!-- Gradient header -->
        <div class="cd-header">
          <button class="cd-header__back" :aria-label="t('back')" @click="openDrawer('add', null)">
            <ArrowLeft :size="16" color="white" />
          </button>
          <div class="cd-header__icon">
            <Settings :size="20" color="white" />
          </div>
          <div class="cd-header__body">
            <div class="cd-header__title">
              {{ editingIntegrationId ? t('diReconfigureWeezevent') : t('diConfigureWeezevent') }}
            </div>
            <div class="cd-header__sub">
              {{ editingIntegrationId ? t('diReconfigureDesc') : t('diConfigureDesc') }}
            </div>
          </div>
          <button class="cd-header__close" :aria-label="t('close')" @click="closeDrawer">
            <X :size="16" color="white" />
          </button>
        </div>

        <div class="cd-body">
          <form @submit.prevent="handleTestAndSave">

            <!-- Instance Name -->
            <div class="form-floating cd-field mb-3">
              <input
                id="cd-instance-name"
                v-model="cfInstanceName"
                type="text"
                class="form-control cd-input"
                :placeholder="t('diInstanceNamePlaceholder') || ' '"
              />
              <label for="cd-instance-name">{{ t('diInstanceName') }}</label>
            </div>
            <p class="cd-field-hint mb-4">{{ t('diInstanceNameHint') }}</p>

            <!-- Client ID -->
            <div class="form-floating cd-field mb-3">
              <input
                id="cd-client-id"
                v-model="cfClientId"
                type="text"
                class="form-control cd-input"
                :placeholder="t('diClientIdPlaceholder') || ' '"
                :disabled="connectionVerified"
              />
              <label for="cd-client-id">{{ t('diClientId') }}</label>
            </div>

            <!-- Client Secret -->
            <div class="cd-field cd-field--password mb-3">
              <div class="form-floating">
                <input
                  id="cd-client-secret"
                  v-model="cfClientSecret"
                  :type="showSecret ? 'text' : 'password'"
                  class="form-control cd-input cd-input--with-btn"
                  :placeholder="editingIntegrationId ? (t('diClientSecretKeepPlaceholder') || ' ') : (t('diClientSecretPlaceholder') || ' ')"
                  :disabled="connectionVerified"
                />
                <label for="cd-client-secret">{{ t('diClientSecret') }}</label>
              </div>
              <button
                type="button"
                class="cd-eye-btn"
                :disabled="connectionVerified"
                :aria-label="showSecret ? t('diHideSecret') : t('diShowSecret')"
                @click="showSecret = !showSecret"
              >
                <EyeOff v-if="showSecret" :size="15" />
                <Eye v-else :size="15" />
              </button>
            </div>

            <!-- Organization ID -->
            <div class="form-floating cd-field mb-5">
              <input
                id="cd-org-id"
                v-model="cfOrganizationId"
                type="text"
                class="form-control cd-input"
                :placeholder="t('diOrgIdPlaceholder') || ' '"
                :disabled="connectionVerified"
              />
              <label for="cd-org-id">{{ t('diOrgId') }}</label>
            </div>

            <!-- Error banner -->
            <div v-if="configError" class="cd-banner cd-banner--error mb-3">
              <span>{{ configError }}</span>
              <button type="button" class="cd-banner__close" :aria-label="t('close')" @click="configError = ''">
                <X :size="12" />
              </button>
            </div>

            <!-- Connection verified banner -->
            <div v-if="connectionVerified" class="cd-banner cd-banner--success mb-3">
              <Zap :size="14" />
              <span>{{ t('diConnectionSuccess') }}</span>
            </div>

            <!-- Config saved banner -->
            <div v-if="configSuccess" class="cd-banner cd-banner--success mb-3">
              <span>{{ editingIntegrationId ? t('diConfigUpdated') : t('diConfigSaved') }}</span>
            </div>

            <!-- Step 1: Test Connection -->
            <button
              v-if="!connectionVerified"
              type="submit"
              class="cd-btn cd-btn--primary"
              :disabled="configTesting"
            >
              <v-progress-circular v-if="configTesting" indeterminate size="14" width="2" color="white" class="mr-2" />
              <Zap v-else :size="15" style="margin-right:6px" />
              {{ t('diTestConnection') }}
            </button>

            <!-- Step 2: Save & Connect -->
            <template v-if="connectionVerified && !configSuccess">
              <button
                type="button"
                class="cd-btn cd-btn--primary mb-2"
                :disabled="configSaving"
                @click="handleSaveConfig"
              >
                <v-progress-circular v-if="configSaving" indeterminate size="14" width="2" color="white" class="mr-2" />
                {{ editingIntegrationId ? t('diUpdateSave') : t('diSaveConnect') }}
              </button>
              <button
                type="button"
                class="cd-btn cd-btn--ghost"
                @click="resetConnectionTest"
              >
                {{ t('diModifyCredentials') }}
              </button>
            </template>

          </form>
        </div>
      </template>
    </v-navigation-drawer>

    <!-- Sync Progress Dialog (shows steps while running, results when done) -->
    <SyncProgressDialog
      :open="syncProgressOpen"
      :integration-name="syncProgressIntegration?.name || ''"
      :steps="syncSteps"
      :last-sync-at="syncedAt"
      :last-transaction-date="lastTransactionDate"
      :results="syncResultData"
      :has-more="syncHasMore"
      :job-id="syncJobId"
      @cancel="closeSyncProgress"
      @done="onSyncProgressDone"
      @retry="retrySyncProgress"
      @job-minimized="onJobMinimized"
    />

    <!-- Remove integration confirmation dialog -->
    <v-dialog v-model="removeDialogOpen" max-width="480" persistent>
      <v-card rounded="lg">
        <v-card-title class="text-subtitle-1 font-weight-bold pt-5 px-5">
          {{ t('diRemoveIntegrationTitle') }}
        </v-card-title>
        <v-card-text class="px-5 pb-2">
          <p class="text-body-2 mb-3">
            {{ t('diRemoveIntegrationConfirm').replace('{name}', removeDialogIntegration?.name || 'Weezevent') }}
          </p>
          <div class="cd-banner cd-banner--error mb-1">
            <v-icon size="15" class="mr-1">mdi-alert-outline</v-icon>
            <span>{{ t('diRemoveIntegrationDataWarning') }}</span>
          </div>
          <p v-if="isIntegrationSyncing(removeDialogIntegration)" class="text-caption text-warning mt-3 mb-0">
            <v-icon size="13" color="warning" class="mr-1">mdi-alert</v-icon>
            {{ t('diRemoveIntegrationSyncWarning') }}
          </p>
        </v-card-text>
        <v-card-actions class="px-5 pb-5 pt-3 gap-2">
          <v-spacer />
          <v-btn
            variant="text"
            :disabled="removing"
            @click="cancelRemoveIntegration"
          >
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="#ff3131"
            variant="flat"
            :loading="removing"
            :disabled="isIntegrationSyncing(removeDialogIntegration)"
            @click="confirmRemoveIntegration"
          >
            {{ t('delete') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Import CSV Digifood : dry-run (aperçu) puis import réel -->
    <v-dialog v-model="csvDialogOpen" max-width="560" persistent>
      <v-card rounded="lg">
        <v-card-title class="text-subtitle-1 font-weight-bold pt-5 px-5">
          {{ t('diDigifoodImportCsvTitle') }} — {{ csvIntegration?.name }}
        </v-card-title>
        <v-card-text class="px-5 pb-2">
          <p class="text-body-2 text-medium-emphasis mb-4">{{ t('diDigifoodImportCsvHint') }}</p>

          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-caption text-medium-emphasis">{{ t('diDigifoodTemplateHint') }}</span>
            <button type="button" class="df-copy-btn" @click="downloadCsvTemplate">
              <v-icon size="13">mdi-download-outline</v-icon>
              {{ t('diDigifoodDownloadTemplate') }}
            </button>
          </div>

          <v-file-input
            v-model="csvFile"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            density="compact"
            variant="outlined"
            prepend-icon="mdi-file-delimited-outline"
            label="orders.csv"
            :disabled="csvImporting"
            hide-details
            class="mb-4"
          />

          <!-- ── Correspondance des colonnes (dès que l'en-tête du fichier est lue) ── -->
          <template v-if="csvColumns.length">
            <div class="df-mapping-head">
              <span class="df-report-title" style="margin-bottom:0">
                <v-icon size="15" class="mr-1">mdi-swap-horizontal</v-icon>
                {{ t('diDigifoodMappingTitle') }}
              </span>
              <span class="text-caption text-medium-emphasis">{{ t('diDigifoodMappingHint') }}</span>
            </div>
            <div class="df-mapping-grid">
              <div v-for="field in csvTargetFields" :key="field.key" class="df-mapping-row">
                <label class="df-mapping-label" :class="{ 'df-mapping-label--req': field.required }">
                  {{ field.label }}<span v-if="field.required"> *</span>
                </label>
                <v-select
                  :model-value="csvMapping[field.key] || null"
                  :items="csvColumns"
                  density="compact"
                  variant="outlined"
                  hide-details
                  :placeholder="t('diDigifoodMappingIgnore')"
                  clearable
                  :disabled="csvImporting"
                  @update:model-value="v => setCsvMapping(field.key, v)"
                />
              </div>
            </div>
            <p v-if="!csvMappingOk" class="df-mapping-warn">
              <v-icon size="13" color="warning" class="mr-1">mdi-alert-outline</v-icon>
              {{ t('diDigifoodMappingRequired') }}
            </p>
          </template>

          <div v-if="csvError" class="cd-banner cd-banner--error mb-3">
            <span>{{ csvError }}</span>
            <button type="button" class="cd-banner__close" :aria-label="t('close')" @click="csvError = ''"><X :size="12" /></button>
          </div>

          <!-- 0 commande détectée alors que des lignes existent → mapping probablement faux -->
          <div v-if="csvReport && csvReport.ordersDetected === 0 && csvReport.rejectedRows.length" class="cd-banner cd-banner--error mb-3">
            <span>{{ t('diDigifoodMappingBadHint') }}</span>
          </div>
          <!-- 0 commande et rien à rejeter → fichier vide (en-tête seul) plutôt qu'un mapping erroné -->
          <div v-else-if="csvReport && csvReport.ordersDetected === 0" class="cd-banner cd-banner--error mb-3">
            <span>{{ t('diDigifoodEmptyCsvHint') }}</span>
          </div>

          <!-- Rapport (dry-run ou réel) -->
          <template v-if="csvReport">
            <div class="df-report-title">
              <v-icon size="15" :color="csvReport.dryRun ? 'warning' : 'success'" class="mr-1">
                {{ csvReport.dryRun ? 'mdi-eye-outline' : 'mdi-check-circle-outline' }}
              </v-icon>
              {{ csvReport.dryRun ? t('diDigifoodDryRunReport') : t('diDigifoodImportDone') }}
            </div>
            <!-- Période interprétée : contrôle visuel anti-inversion jour/mois -->
            <div v-if="csvReport.periodStart" class="df-period">
              <v-icon size="13" class="mr-1">mdi-calendar-range-outline</v-icon>
              {{ t('diDigifoodPeriodDetected') }} :
              <strong class="ml-1">{{ formatDateTime(csvReport.periodStart) }} → {{ formatDateTime(csvReport.periodEnd) }}</strong>
            </div>
            <div class="df-report-grid">
              <div class="df-report-item"><strong>{{ csvReport.ordersDetected }}</strong><span>{{ t('diDigifoodOrdersDetected') }}</span></div>
              <div class="df-report-item"><strong>{{ csvReport.ordersCreated }}</strong><span>{{ t('diDigifoodOrdersCreated') }}</span></div>
              <div class="df-report-item"><strong>{{ csvReport.ordersUpdated }}</strong><span>{{ t('diDigifoodOrdersUpdated') }}</span></div>
              <div class="df-report-item"><strong>{{ csvReport.productsCreated }}</strong><span>{{ t('diDigifoodProductsCreated') }}</span></div>
              <div class="df-report-item"><strong>{{ csvReport.locationsCreated }}</strong><span>{{ t('diDigifoodLocationsCreated') }}</span></div>
              <div class="df-report-item" :class="{ 'df-report-item--warn': csvReport.rejectedRows.length }">
                <strong>{{ csvReport.rejectedRows.length }}</strong><span>{{ t('diDigifoodRejectedRows') }}</span>
              </div>
            </div>
            <div v-if="csvReport.rejectedRows.length" class="df-rejected">
              <div v-for="r in csvReport.rejectedRows.slice(0, 8)" :key="r.line" class="df-rejected-row">
                {{ t('diRejectedRowLine') }} {{ r.line }} — {{ r.reason }}
              </div>
              <div v-if="csvReport.rejectedRows.length > 8" class="df-rejected-row text-medium-emphasis">
                … +{{ csvReport.rejectedRows.length - 8 }}
              </div>
            </div>
          </template>
        </v-card-text>
        <v-card-actions class="px-5 pb-5 pt-3 gap-2">
          <v-spacer />
          <v-btn variant="text" :disabled="csvImporting" @click="closeCsvDialog">
            {{ csvReport && !csvReport.dryRun ? t('close') : t('cancel') }}
          </v-btn>
          <!-- Phase 1 : aperçu dry-run ; phase 2 : import réel (interdit si 0 commande) -->
          <v-btn
            v-if="!csvReport || csvReport.dryRun"
            color="#ff3131"
            variant="flat"
            :loading="csvImporting"
            :disabled="!csvFileReady || !csvMappingOk || (csvReport && csvReport.dryRun && csvReport.ordersDetected === 0)"
            @click="csvReport && csvReport.dryRun ? runCsvImport(false) : runCsvImport(true)"
          >
            {{ csvReport && csvReport.dryRun ? t('diDigifoodConfirmImport') : t('diDigifoodDryRunReport') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Integration Wizard (fullscreen dialog) -->
    <IntegrationWizard
      v-if="wizardOpen"
      :open="wizardOpen"
      :location="wizardLocation"
      :space-id="wizardSpaceId"
      :other-locations="otherLocationsForWizard"
      @close="closeWizard"
      @completed="handleWizardCompleted"
      @go-to-analytics="handleGoToAnalytics"
      @request-csv-import="handleWizardCsvRequest"
      @configure-next="handleConfigureNext"
    />
  </div>
</template>

<script>
import { t as translate, getCurrentLocale } from '@/i18n'
import { toIntlLocale } from '@/composables/useNumberFormat'
import { getLocationSpaceMappings } from '@/api/endpoints/mapping.api'
import IntegrationWizard from '@/components/integration/wizard/IntegrationWizard.vue'
import SyncProgressDialog from '@/components/integration/SyncProgressDialog.vue'
import { X, ArrowLeft, Plus, ChevronRight, Eye, EyeOff, Zap, Settings } from 'lucide-vue-next'
import {
  syncWeezeventData,
  getWeezeventSyncStatus,
  listWeezeventInstances,
  createWeezeventInstance,
  updateWeezeventInstance,
  deleteWeezeventInstance,
  testWeezeventInstance,
  testWeezeventCredentials,
  startWeezeventSyncJob,
  listWeezeventSyncJobs,
  deleteWeezeventSyncJob,
  cancelWeezeventSyncJob,
  getWeezeventJobStats,
  listDigifoodInstances,
  createDigifoodInstance,
  updateDigifoodInstance,
  deleteDigifoodInstance,
  testDigifoodInstance,
  importDigifoodCsv,
} from '@/api/endpoints/aggregation.api'

// Champs communs aux deux providers ; toCard/toDigifoodCard n'ajoutent que leurs
// champs spécifiques (identifiants API pour Weezevent, webhook pour Digifood).
function toBaseCard(instance, provider, type) {
  return {
    id: instance.id,
    provider,
    type,
    name: instance.name,
    enabled: instance.enabled,
    createdAt: instance.createdAt,
  }
}

function toCard(instance) {
  return {
    ...toBaseCard(instance, 'Weezevent', 'weezevent'),
    clientId: instance.clientId,
    organizationId: instance.organizationId,
  }
}

// ── Import CSV Digifood : champs cibles + auto-détection des colonnes ──
// Miroir des HEADER_SYNONYMS du backend (digifood-csv-import.service.ts) —
// calé sur les en-têtes exacts de l'export réel du back-office Digifood.
const CSV_TARGET_FIELDS = [
  { key: 'order_id', label: 'ID de commande', required: true, synonyms: ['order_id', 'long id', 'order id', 'commande', 'reference commande'] },
  { key: 'item_name', label: 'Article (nom)', required: true, synonyms: ['item_name', 'item', 'produit', 'article', 'product'] },
  { key: 'quantity', label: 'Quantité', required: true, synonyms: ['quantity', 'quantite', 'qte', 'qty'] },
  { key: 'price_pu', label: 'Prix unitaire (centimes)', required: false, synonyms: ['price_pu', 'price pu', 'prix unitaire centimes'] },
  { key: 'total_ttc', label: 'Total TTC ligne (€)', required: false, synonyms: ['total_ttc', 'total ttc', 'montant ttc', 'ttc'] },
  { key: 'total_ht', label: 'Total HT ligne (€)', required: false, synonyms: ['total_ht', 'total ht', 'montant ht', 'ht'] },
  { key: 'total_tva', label: 'Total TVA ligne (€)', required: false, synonyms: ['total_tva', 'total tva', 'montant tva'] },
  { key: 'tax_rate', label: 'Taux TVA (%)', required: false, synonyms: ['tax_rate', 'tva%', 'tva %', 'tva', 'tax rate', 'vat'] },
  { key: 'type', label: 'Type (vente/refund)', required: false, synonyms: ['type'] },
  { key: 'state', label: 'Statut (annulé ignoré)', required: false, synonyms: ['state', 'statut', 'etat'] },
  { key: 'placed_at', label: 'Date+heure (ISO)', required: false, synonyms: ['placed_at', 'placed at', 'date'] },
  { key: 'placed_at_date', label: 'Date (colonne séparée)', required: false, synonyms: ['placed_at_date', 'placed at_date', 'placed at date'] },
  { key: 'placed_at_time', label: 'Heure (colonne séparée)', required: false, synonyms: ['placed_at_time', 'placed at_time', 'placed at time', 'heure'] },
  { key: 'location_name', label: 'Site (nom)', required: false, synonyms: ['location_name', 'location', 'site'] },
  { key: 'shop_name', label: 'Point de vente (nom)', required: false, synonyms: ['shop_name', 'shop', 'point de vente', 'pdv', 'buvette'] },
  { key: 'item_id', label: 'ID article', required: false, synonyms: ['item_id', 'item id', 'product id', 'article id'] },
  { key: 'variation_id', label: 'ID variation', required: false, synonyms: ['variation_id', 'variation id'] },
  { key: 'variation', label: 'Variation', required: false, synonyms: ['variation', 'variante'] },
  { key: 'family', label: 'Famille', required: false, synonyms: ['family', 'item family', 'famille', 'categorie'] },
  { key: 'external_reference', label: 'Référence externe', required: false, synonyms: ['external_reference', 'external reference', 'reference externe', 'ref externe'] },
]

const normalizeCsvHeader = (h) =>
  String(h).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

// Modèle téléchargeable : en-têtes canoniques + exemples (vente multi-lignes, refund)
const CSV_TEMPLATE = [
  'order_id,placed_at,location_name,shop_name,item_id,variation_id,item_name,variation,family,quantity,price_pu,tax_rate,external_reference,type',
  'order_001,2026-07-01T12:00:00Z,Mon Site,Buvette Nord,it_1,var_1,Burger,,Food,2,4500,10.0,Burger,sale',
  'order_001,2026-07-01T12:00:00Z,Mon Site,Buvette Nord,it_2,var_2,Boisson,50cl,Drink,2,1500,5.5,,sale',
  'order_002,2026-07-01T14:30:00Z,Mon Site,Buvette Nord,it_3,var_2,Boisson,50cl,Drink,1,1500,5.5,,refund',
].join('\n')

function toDigifoodCard(instance) {
  return {
    ...toBaseCard(instance, 'Digifood', 'digifood'),
    webhookUrl: instance.webhookUrl,
    webhookSecretMasked: instance.webhookSecretMasked,
    posVersion: instance.posVersion,
    keyVersion: instance.keyVersion,
  }
}

export default {
  name: 'DataIntegrationView',

  components: { IntegrationWizard, SyncProgressDialog, X, ArrowLeft, Plus, ChevronRight, Eye, EyeOff, Zap, Settings },

  data() {
    return {
      mappings: [],
      integrations: [],
      loading: true,
      syncingMap: {},
      expandedCards: {},

      // Wizard
      wizardOpen: false,
      wizardLocation: null,
      wizardSpaceId: null,

      // Sync dialogs
      syncProgressOpen: false,
      syncProgressIntegration: null,
      syncSteps: [],
      syncResultData: { transactions: 0, events: 0, locations: 0, products: 0, merchants: 0 },
      syncHasMore: false,
      syncedAt: null,
      lastTransactionDate: null,
      // Job-based sync (nouvelle architecture)
      syncJobId: null,
      syncFromDates: {},
      syncToDates: {},
      // Historique des jobs par intégration
      syncJobsMap: {},
      deletingJobId: null,
      cancellingJobId: null,
      expandedJobId: null,
      jobStatsMap: {},
      loadingStatsJobId: null,

      // Drawer
      drawerOpen: false,
      drawerMode: 'add',
      editingIntegrationId: null,

      // Config form
      cfInstanceName: '',
      cfClientId: '',
      cfClientSecret: '',
      cfOrganizationId: '',
      showSecret: false,
      configTesting: false,
      configSaving: false,
      configError: '',
      configSuccess: false,
      connectionVerified: false,

      // Digifood
      cfWebhookSecret: '',
      digifoodWebhookUrl: '',
      copiedUrl: '',
      checkingReceptionId: null,
      receptionMap: {},
      csvDialogOpen: false,
      csvIntegration: null,
      csvFile: null,
      csvReport: null,
      csvImporting: false,
      csvError: '',
      csvColumns: [],
      csvMapping: {},

      // Remove dialog
      removeDialogOpen: false,
      removeDialogIntegration: null,
      removing: false,

      // Set to true in beforeUnmount(): checked inside the legacy sync's retry/poll
      // loops so they stop making requests if the component is destroyed mid-sync.
      syncAbandoned: false,

      // i18n
      locale: getCurrentLocale(),
      theme: (() => { const s = localStorage.getItem('datafriday:theme') || localStorage.getItem('appTheme') || 'dataFridayLight'; return (s === 'light' ? 'dataFridayLight' : s === 'dark' ? 'dataFridayDark' : s); })(),
    }
  },

  computed: {
    tenantId() {
      return this.$store.getters['auth/tenantId']
    },
    isDark() {
      return this.theme === 'dark' || this.theme === 'dataFridayDark'
    },
    // v-file-input émet un File ou un tableau de 1 File selon les versions de Vuetify —
    // seul point de dérivation, consommé par parseCsvHeaders()/runCsvImport().
    csvFileSelected() {
      return Array.isArray(this.csvFile) ? this.csvFile[0] : this.csvFile
    },
    csvFileReady() {
      return !!this.csvFileSelected
    },
    csvTargetFields() {
      return CSV_TARGET_FIELDS
    },
    /** Obligatoires : order_id, article, quantité, et UN prix (price_pu OU total_ttc). */
    csvMappingOk() {
      if (!this.csvColumns.length) return true // en-tête illisible → le backend auto-détecte
      const m = this.csvMapping
      return !!(m.order_id && m.item_name && m.quantity && (m.price_pu || m.total_ttc))
    },
    knownSpaceIds() {
      return new Set(
        (this.$store.getters['spaces/spaces'] || [])
          .map(s => String(s.id || s._id))
          .filter(Boolean)
      )
    },
    // BCP-47 tag derived from the app locale, used for date/number formatting.
    localeTag() {
      return toIntlLocale(this.locale)
    },
    // Other integrations of the same provider type, not yet mapped to a space —
    // fed to the wizard's "configure next location" card (WizardSuccess.vue).
    otherLocationsForWizard() {
      if (!this.wizardLocation) return []
      return this.integrations
        .filter(intg => intg.id !== this.wizardLocation.id && intg.type === this.wizardLocation.type && !this.getSpaceForIntegration(intg))
        .map(intg => ({ ...intg, completedSteps: this.getCompletedStepsForIntegration(intg) }))
    },
  },

  watch: {
    // Nouveau fichier choisi → relire l'en-tête et re-proposer le mapping
    csvFile() {
      this.parseCsvHeaders()
    },
  },

  async mounted() {
    await this.init()
    window.addEventListener('locale-changed', this.handleLocaleChange)
    window.addEventListener('theme-changed', this._onThemeChanged)
  },

  activated() {
    // La vue est keep-alive : mounted() ne se relance pas à chaque retour. On
    // rafraîchit tout ce qui a pu changer pendant que l'utilisateur était sur une
    // autre route. La reception Digifood n'est pas incluse : c'est une vérification
    // active côté serveur (testDigifoodInstance), pas une simple lecture.
    this.loadMappings()
    this.fetchIntegrationsList().then(() => this.loadAllSyncJobs())
  },

  beforeUnmount() {
    window.removeEventListener('locale-changed', this.handleLocaleChange)
    window.removeEventListener('theme-changed', this._onThemeChanged)
    this.syncAbandoned = true
  },

  methods: {
    t(key) {
      return translate(key, this.locale)
    },

    handleLocaleChange(event) {
      this.locale = event.detail.locale
    },

    _onThemeChanged(event) {
      this.theme = event.detail?.theme || 'dataFridayLight'
    },

    formatDate(dateStr) {
      if (!dateStr) return ''
      return new Date(dateStr).toLocaleDateString(this.localeTag, {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    },

    formatDateTime(dateStr) {
      if (!dateStr) return ''
      return new Date(dateStr).toLocaleString(this.localeTag, {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    },

    formatNumber(n) {
      if (n == null) return ''
      return n.toLocaleString(this.localeTag)
    },

    toggleExpand(id) {
      this.expandedCards = { ...this.expandedCards, [id]: !this.expandedCards[id] }
    },

    openDrawer(mode, integration = null) {
      this.drawerMode = mode
      this.drawerOpen = true
      this.configError = ''
      this.configSuccess = false
      this.connectionVerified = false
      this.showSecret = false

      if (mode === 'config-weezevent' && integration) {
        this.editingIntegrationId = integration.id
        this.cfInstanceName = integration.name || ''
        this.cfClientId = integration.clientId || ''
        this.cfClientSecret = ''
        this.cfOrganizationId = integration.organizationId || ''
      } else if (mode === 'config-digifood' && integration) {
        this.editingIntegrationId = integration.id
        this.cfInstanceName = integration.name || ''
        this.cfWebhookSecret = ''
        this.digifoodWebhookUrl = integration.webhookUrl || ''
      } else {
        this.editingIntegrationId = null
        this.cfInstanceName = ''
        this.cfClientId = ''
        this.cfClientSecret = ''
        this.cfOrganizationId = ''
        this.cfWebhookSecret = ''
        this.digifoodWebhookUrl = ''
      }
    },

    closeDrawer() {
      this.drawerOpen = false
      // Le composant est keep-alive : sans ça, les secrets saisis resteraient en
      // mémoire réactive jusqu'à la prochaine ouverture du drawer.
      this.cfClientSecret = ''
      this.cfWebhookSecret = ''
    },

    // Fusionne une instance créée/mise à jour dans `integrations` : remplace l'entrée
    // existante en édition, l'ajoute sinon. Partagé par les deux flux de sauvegarde.
    mergeIntegration(existingId, card) {
      this.integrations = existingId
        ? this.integrations.map(i => i.id === card.id ? card : i)
        : [...this.integrations, card]
    },

    resetConnectionTest() {
      this.connectionVerified = false
      this.configError = ''
    },

    async handleTestAndSave() {
      this.configError = ''
      if (!this.cfClientId || !this.cfOrganizationId) {
        this.configError = this.t('diClientIdRequired')
        return
      }
      if (!this.editingIntegrationId && !this.cfClientSecret) {
        this.configError = this.t('diClientSecretRequired')
        return
      }

      this.configTesting = true
      try {
        if (this.editingIntegrationId && !this.cfClientSecret) {
          await testWeezeventInstance(this.tenantId, this.editingIntegrationId, {
            clientId: this.cfClientId,
          })
        } else {
          await testWeezeventCredentials(this.tenantId, {
            weezeventClientId: this.cfClientId,
            weezeventClientSecret: this.cfClientSecret,
          })
        }
        this.connectionVerified = true
      } catch (err) {
        this.configError = err?.response?.data?.message || this.t('diConnectionFailed')
      } finally {
        this.configTesting = false
      }
    },

    async handleSaveConfig() {
      this.configError = ''
      this.configSaving = true
      try {
        const name = this.cfInstanceName.trim() || `Weezevent ${this.integrations.length + 1}`

        if (this.editingIntegrationId) {
          const payload = { name, clientId: this.cfClientId, organizationId: this.cfOrganizationId }
          if (this.cfClientSecret) payload.clientSecret = this.cfClientSecret
          const updated = await updateWeezeventInstance(this.tenantId, this.editingIntegrationId, payload)
          this.mergeIntegration(this.editingIntegrationId, toCard(updated))
        } else {
          const created = await createWeezeventInstance(this.tenantId, {
            name,
            clientId: this.cfClientId,
            clientSecret: this.cfClientSecret,
            organizationId: this.cfOrganizationId,
            enabled: true,
          })
          this.mergeIntegration(null, toCard(created))
        }

        this.configSuccess = true
        setTimeout(() => this.closeDrawer(), 1000)
      } catch (err) {
        // err.config.data peut contenir le clientSecret soumis en clair — ne jamais logger l'objet complet.
        console.error('[Config] Error saving weezevent config:', err?.message)
        this.configError = err?.response?.data?.message || this.t('diSaveFailed')
      } finally {
        this.configSaving = false
      }
    },

    // ── Digifood : config, réception, import CSV ────────────────────

    async handleSaveDigifoodConfig() {
      this.configError = ''
      if (!this.editingIntegrationId && !this.cfWebhookSecret) {
        this.configError = this.t('diDigifoodSecretRequired')
        return
      }
      this.configSaving = true
      try {
        const name = this.cfInstanceName.trim() || `Digifood ${this.integrations.filter(i => i.type === 'digifood').length + 1}`
        let saved
        if (this.editingIntegrationId) {
          const payload = { name }
          if (this.cfWebhookSecret) payload.webhookSecret = this.cfWebhookSecret
          saved = await updateDigifoodInstance(this.tenantId, this.editingIntegrationId, payload)
          this.mergeIntegration(this.editingIntegrationId, toDigifoodCard(saved))
        } else {
          saved = await createDigifoodInstance(this.tenantId, {
            name,
            webhookSecret: this.cfWebhookSecret,
            enabled: true,
          })
          this.mergeIntegration(null, toDigifoodCard(saved))
        }
        this.digifoodWebhookUrl = saved.webhookUrl || ''
        this.configSuccess = true
        // Pas de fermeture auto : l'utilisateur doit copier l'URL de webhook.
      } catch (err) {
        // err.config.data peut contenir le webhookSecret soumis en clair — ne jamais logger l'objet complet.
        console.error('[Config] Error saving digifood config:', err?.message)
        this.configError = err?.response?.data?.message || this.t('diSaveFailed')
      } finally {
        this.configSaving = false
      }
    },

    async copyWebhookUrl(url) {
      try {
        await navigator.clipboard.writeText(url)
        this.copiedUrl = url
        setTimeout(() => { if (this.copiedUrl === url) this.copiedUrl = '' }, 2000)
      } catch { /* clipboard indisponible (http) — l'URL reste sélectionnable */ }
    },

    async checkReception(integration) {
      this.checkingReceptionId = integration.id
      try {
        const result = await testDigifoodInstance(this.tenantId, integration.id)
        this.receptionMap = { ...this.receptionMap, [integration.id]: result }
      } catch (err) {
        console.error('[Digifood] Reception check failed:', err)
      } finally {
        this.checkingReceptionId = null
      }
    },

    openCsvDialog(integration) {
      this.csvIntegration = integration
      this.csvFile = null
      this.csvReport = null
      this.csvError = ''
      this.csvColumns = []
      this.csvMapping = {}
      this.csvDialogOpen = true
    },

    closeCsvDialog() {
      this.csvDialogOpen = false
      this.csvIntegration = null
      this.csvFile = null
      this.csvReport = null
      this.csvError = ''
      this.csvColumns = []
      this.csvMapping = {}
    },

    /** Lit la ligne d'en-tête d'un fichier CSV : élargit la fenêtre de lecture si l'en-tête
     *  dépasse 8 Ko (beaucoup de colonnes), et retente en windows-1252 si l'UTF-8 produit
     *  des caractères de remplacement (export Excel/Windows en Latin-1 sur les en-têtes
     *  accentués — Blob.text() décode toujours en UTF-8 par défaut). */
    async readCsvHeaderLine(file) {
      let sliceSize = 8192
      let slice = file.slice(0, sliceSize)
      let head = await slice.text()
      if (!/\r?\n/.test(head) && file.size > sliceSize) {
        sliceSize = 65536
        slice = file.slice(0, sliceSize)
        head = await slice.text()
      }
      if (head.includes('�')) {
        head = new TextDecoder('windows-1252').decode(await slice.arrayBuffer())
      }
      return head
    },

    /** Lit la ligne d'en-tête du fichier côté navigateur et pré-remplit le mapping
     *  par auto-détection (synonymes, accents/casse ignorés). */
    async parseCsvHeaders() {
      const file = this.csvFileSelected
      this.csvColumns = []
      this.csvMapping = {}
      this.csvReport = null
      if (!file) return
      try {
        const head = await this.readCsvHeaderLine(file)
        const firstLine = head.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || ''
        // Délimiteur : TAB > ; > , (même heuristique que le backend)
        const delims = [
          ['\t', (firstLine.match(/\t/g) || []).length],
          [';', (firstLine.match(/;/g) || []).length],
          [',', (firstLine.match(/,/g) || []).length],
        ].sort((a, b) => b[1] - a[1])
        const delimiter = delims[0][1] > 0 ? delims[0][0] : ','
        this.csvColumns = firstLine
          .split(delimiter)
          .map(c => c.replace(/^"|"$/g, '').trim())
          .filter(Boolean)

        // Auto-détection : première colonne dont le nom normalisé matche un synonyme
        const byNormalized = new Map(this.csvColumns.map(c => [normalizeCsvHeader(c), c]))
        const mapping = {}
        for (const field of CSV_TARGET_FIELDS) {
          const hit = field.synonyms.find(s => byNormalized.has(s))
          if (hit) mapping[field.key] = byNormalized.get(hit)
        }
        this.csvMapping = mapping
      } catch (err) {
        console.error('[Digifood] Failed to read CSV headers:', err)
      }
    },

    /** Changer une correspondance invalide l'aperçu précédent (il faut re-prévisualiser). */
    setCsvMapping(fieldKey, column) {
      const next = { ...this.csvMapping }
      if (column) next[fieldKey] = column
      else delete next[fieldKey]
      this.csvMapping = next
      if (this.csvReport) this.csvReport = null
    },

    downloadCsvTemplate() {
      const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'digifood-orders-modele.csv'
      a.click()
      URL.revokeObjectURL(url)
    },

    /** dryRun=true : aperçu sans écriture ; false : import réel (après aperçu). */
    async runCsvImport(dryRun) {
      const file = this.csvFileSelected
      if (!file || !this.csvIntegration) return
      this.csvImporting = true
      this.csvError = ''
      try {
        this.csvReport = await importDigifoodCsv(this.tenantId, this.csvIntegration.id, file, dryRun, this.csvMapping)
        if (!dryRun) {
          // L'import réel alimente PDV/produits → recharge les mappings du wizard
          this.loadMappings().catch(() => {})
        }
      } catch (err) {
        console.error('[Digifood] CSV import failed:', err)
        this.csvError = err?.response?.data?.message || this.t('diSaveFailed')
      } finally {
        this.csvImporting = false
      }
    },

    /** Le wizard (étape PDV vide) demande l'import CSV : on ouvre le dialog par-dessus. */
    handleWizardCsvRequest() {
      if (this.wizardLocation?.type === 'digifood') {
        this.openCsvDialog(this.wizardLocation)
      }
    },

    // A running sync (legacy syncingMap flag or an active job) must block removal —
    // deleting mid-sync leaves the sync loop hitting a backend id that no longer exists.
    isIntegrationSyncing(integration) {
      if (!integration) return false
      if (this.syncingMap[integration.id]) return true
      const jobs = this.syncJobsMap[integration.id] || []
      return jobs.some(job => this.isJobActive(job))
    },

    handleRemoveIntegration(id) {
      const integration = this.integrations.find(i => i.id === id)
      if (!integration || this.isIntegrationSyncing(integration)) return
      this.removeDialogIntegration = integration
      this.removeDialogOpen = true
    },

    async confirmRemoveIntegration() {
      const integration = this.removeDialogIntegration
      if (!integration || this.isIntegrationSyncing(integration)) return
      this.removing = true
      try {
        if (integration.type === 'digifood') {
          await deleteDigifoodInstance(this.tenantId, integration.id)
        } else {
          await deleteWeezeventInstance(this.tenantId, integration.id)
        }
        this.integrations = this.integrations.filter(i => i.id !== integration.id)

        const id = integration.id
        const jobIds = (this.syncJobsMap[id] || []).map(job => job.id)

        const sm = { ...this.syncingMap }; delete sm[id]; this.syncingMap = sm
        const ec = { ...this.expandedCards }; delete ec[id]; this.expandedCards = ec
        const fd = { ...this.syncFromDates }; delete fd[id]; this.syncFromDates = fd
        const td = { ...this.syncToDates }; delete td[id]; this.syncToDates = td
        const sj = { ...this.syncJobsMap }; delete sj[id]; this.syncJobsMap = sj
        const rm = { ...this.receptionMap }; delete rm[id]; this.receptionMap = rm
        if (jobIds.length) {
          const js = { ...this.jobStatsMap }
          jobIds.forEach(jobId => delete js[jobId])
          this.jobStatsMap = js
        }

        this.removeDialogOpen = false
        this.removeDialogIntegration = null
      } catch (err) {
        console.error('[DataIntegrationView] Failed to remove integration:', err)
      } finally {
        this.removing = false
      }
    },

    cancelRemoveIntegration() {
      this.removeDialogOpen = false
      this.removeDialogIntegration = null
    },

    async handleSync(integration) {
      if (!integration) return

      const fromDate = this.syncFromDates[integration.id]
      const toDate = this.syncToDates[integration.id]

      // If dates are provided, use the new job-based bisection sync
      if (fromDate && toDate) {
        await this.handleSyncJob(integration, fromDate, toDate)
        return
      }

      // ---- Legacy synchronous sync ----
      this.syncJobId = null
      // If a sync is already running for this integration, just re-show the dialog
      if (this.syncingMap[integration.id]) {
        this.syncProgressIntegration = integration
        this.syncProgressOpen = true
        return
      }

      const STEPS = [
        { key: 'transactions', label: this.t('intgSyncProgStatTransactions') },
        { key: 'events', label: this.t('intgSyncProgStatEvents') },
        { key: 'locations', label: this.t('intgSyncProgStatLocations') },
        { key: 'products', label: this.t('intgSyncProgStatProducts') },
        { key: 'merchants', label: this.t('intgSyncProgStatMerchants') },
      ]

      this.syncSteps = STEPS.map(s => ({ ...s, status: 'pending', count: null, duration: null }))
      this.syncProgressIntegration = integration
      this.syncHasMore = false
      this.syncingMap = { ...this.syncingMap, [integration.id]: true }

      // Pre-load last sync time so the dialog shows "Dernière sync : il y a X" correctly
      try {
        const status = await getWeezeventSyncStatus(integration.id)
        this.syncedAt = status?.transactions?.lastSyncedAt || null
        this.lastTransactionDate = status?.transactions?.lastTransactionDate || null
      } catch {
        // ignore — non-blocking
      }

      this.syncProgressOpen = true

      const setStep = (key, patch) => {
        const idx = this.syncSteps.findIndex(s => s.key === key)
        if (idx !== -1) {
          this.syncSteps = [
            ...this.syncSteps.slice(0, idx),
            { ...this.syncSteps[idx], ...patch },
            ...this.syncSteps.slice(idx + 1),
          ]
        }
      }

      const counts = { transactions: 0, events: 0, locations: 0, products: 0, merchants: 0 }
      let livePollTimer = null

      try {
        // The backend fetches ALL pages from the Weezevent API in a single call.
        // On 409 (another sync already running server-side): stay in "running" state and
        // poll the status endpoint every 8s to show live counts, until the server lock
        // is released (= next POST succeeds) or we exceed MAX_409_WAIT_MS.
        const MAX_409_WAIT_MS = 10 * 60 * 1000 // 10 min max
        const POLL_MS = 8000
        let first409At = null

        setStep('transactions', { status: 'running' })
        setStep('events',    { status: 'pending', count: null })
        setStep('locations', { status: 'pending', count: null })
        setStep('products',  { status: 'pending', count: null })
        setStep('merchants', { status: 'pending', count: null })

        // Poll live transaction count every 5s so the dialog shows progress during the sync
        const LIVE_POLL_MS = 5000
        livePollTimer = setInterval(async () => {
          try {
            const liveStatus = await getWeezeventSyncStatus(integration.id)
            const liveCount = liveStatus?.transactions?.count ?? null
            if (liveCount !== null) {
              setStep('transactions', { status: 'running', liveCount })
            }
          } catch { /* non-blocking */ }
        }, LIVE_POLL_MS)

        let res = null
        while (true) {
          if (this.syncAbandoned) break
          const t0 = Date.now()
          try {
            res = await syncWeezeventData('transactions', { integrationId: integration.id })
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
            counts.transactions = res?.count ?? 0
            counts.events       = res?.eventCount ?? 0
            counts.locations    = res?.locationCount ?? 0
            counts.products     = res?.productCount ?? 0
            counts.merchants    = res?.merchantCount ?? 0
            this.syncHasMore    = false

            setStep('transactions', { status: 'done', count: counts.transactions, newCount: res?.itemsCreated ?? 0, duration: `${elapsed}s` })
            setStep('events',    { status: counts.events > 0 ? 'done' : 'pending',   count: counts.events > 0 ? counts.events : null,   newCount: 0 })
            setStep('locations', { status: 'done', count: counts.locations, newCount: 0 })
            setStep('products',  { status: counts.products > 0 ? 'done' : 'pending', count: counts.products > 0 ? counts.products : null, newCount: 0 })
            setStep('merchants', { status: 'done', count: counts.merchants, newCount: 0 })
            break // success → exit retry loop
          } catch (err) {
            const httpStatus = err?.response?.status
            const errorMessage = err?.response?.data?.message || err?.message || this.t('diSyncGenericError')

            if (httpStatus === 409) {
              if (!first409At) {
                first409At = Date.now()
                console.warn('[DataIntegrationView] transactions 409 — server sync running, switching to polling mode')
                // Stop livePollTimer: the 409 inner loop owns polling now (no duplicate requests)
                if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null }
              }

              // Inner polling loop: keep polling status until the backend lock releases.
              // We never retry POST while syncRunning === true — that just generates 409 noise.
              let timedOut = false
              while (true) {
                if (this.syncAbandoned) break
                const waitedMs = Date.now() - first409At
                if (waitedMs >= MAX_409_WAIT_MS) {
                  const elapsed = (waitedMs / 1000).toFixed(0)
                  setStep('transactions', { status: 'error', errorMessage: this.t('diSyncServerTooLong').replace('{s}', elapsed), duration: `${elapsed}s` })
                  console.error(`[DataIntegrationView] 409 for ${elapsed}s — giving up`)
                  timedOut = true
                  break
                }
                try {
                  const liveStatus = await getWeezeventSyncStatus(integration.id)
                  setStep('transactions', {
                    status: 'running',
                    liveCount: liveStatus?.transactions?.count ?? null,
                  })
                  if (liveStatus?.transactions?.lastTransactionDate) {
                    this.lastTransactionDate = liveStatus.transactions.lastTransactionDate
                  }
                  // Update all other steps with live counts from status
                  if ((liveStatus?.events?.count ?? 0) > 0)
                    setStep('events', { status: 'running', liveCount: liveStatus.events.count })
                  if ((liveStatus?.locations?.count ?? 0) > 0)
                    setStep('locations', { status: 'running', liveCount: liveStatus.locations.count })
                  if ((liveStatus?.products?.count ?? 0) > 0)
                    setStep('products', { status: 'running', liveCount: liveStatus.products.count })
                  if ((liveStatus?.merchants?.count ?? 0) > 0)
                    setStep('merchants', { status: 'running', liveCount: liveStatus.merchants.count })
                  if (liveStatus?.syncRunning === false) {
                    console.warn('[DataIntegrationView] backend lock released — retrying sync POST')
                    break // exit inner polling loop → outer while will retry POST
                  }
                } catch { /* non-blocking */ }
                console.warn(`[DataIntegrationView] server sync still running (${Math.round((Date.now() - first409At) / 1000)}s waited), polling again in ${POLL_MS / 1000}s…`)
                await new Promise(resolve => setTimeout(resolve, POLL_MS))
              }

              if (timedOut) break // exit outer while → error already set
            } else {
              const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
              setStep('transactions', { status: 'error', errorMessage, duration: `${elapsed}s` })
              setStep('events',    { status: 'error', errorMessage: this.t('diSyncCancelled') })
              setStep('locations', { status: 'error', errorMessage: this.t('diSyncCancelled') })
              setStep('products',  { status: 'error', errorMessage: this.t('diSyncCancelled') })
              setStep('merchants', { status: 'error', errorMessage: this.t('diSyncCancelled') })
              console.error(`[DataIntegrationView] transactions sync error after ${elapsed}s:`, err)
              break // fatal error → exit retry loop
            }
          }
        }

        this.syncedAt = new Date().toISOString()

        // Refresh lastTransactionDate now that transactions are in DB
        try {
          const statusAfter = await getWeezeventSyncStatus(integration.id)
          this.lastTransactionDate = statusAfter?.transactions?.lastTransactionDate || null
        } catch {
          // non-blocking
        }

        this.syncResultData = counts

        // Show inline results in the same dialog (handled by SyncProgressDialog isAllDone branch)
      } finally {
        if (livePollTimer) clearInterval(livePollTimer)
        const sm = { ...this.syncingMap }
        delete sm[integration.id]
        this.syncingMap = sm
      }
    },

    async loadAllSyncJobs() {
      // Les jobs de sync n'existent que pour Weezevent (Digifood = webhooks temps réel)
      const weezevent = this.integrations.filter(intg => intg.type !== 'digifood')
      const results = await Promise.allSettled(
        weezevent.map(intg => listWeezeventSyncJobs(intg.id))
      )
      const map = {}
      weezevent.forEach((intg, i) => {
        if (results[i].status === 'fulfilled') {
          map[intg.id] = results[i].value?.data ?? []
        } else {
          map[intg.id] = []
        }
      })
      this.syncJobsMap = map
    },

    async loadSyncJobsFor(integrationId) {
      try {
        const result = await listWeezeventSyncJobs(integrationId)
        this.syncJobsMap = { ...this.syncJobsMap, [integrationId]: result?.data ?? [] }
      } catch {
        // non-bloquant
      }
    },

    // Un job "actif" (ni terminé, ni échoué, ni annulé) bloque isIntegrationSyncing() et
    // affiche le bouton "annuler" (conserve l'historique) plutôt que "supprimer" (le retire).
    isJobActive(job) {
      return job.status !== 'COMPLETED' && job.status !== 'FAILED' && job.status !== 'CANCELLED'
    },

    async deleteSyncJob(integrationId, jobId) {
      if (this.deletingJobId) return
      this.deletingJobId = jobId
      try {
        await deleteWeezeventSyncJob(jobId)
        if (this.expandedJobId === jobId) this.expandedJobId = null
        await this.loadSyncJobsFor(integrationId)
      } catch (err) {
        console.error('[DataIntegrationView] deleteSyncJob error:', err)
      } finally {
        this.deletingJobId = null
      }
    },

    // Annule un job bloqué en conservant sa ligne d'historique (status → CANCELLED),
    // contrairement à deleteSyncJob qui supprime la fiche.
    async cancelSyncJob(integrationId, jobId) {
      if (this.cancellingJobId) return
      this.cancellingJobId = jobId
      try {
        await cancelWeezeventSyncJob(jobId)
        await this.loadSyncJobsFor(integrationId)
      } catch (err) {
        console.error('[DataIntegrationView] cancelSyncJob error:', err)
      } finally {
        this.cancellingJobId = null
      }
    },

    async toggleJobStats(jobId, job) {
      if (this.expandedJobId === jobId) {
        this.expandedJobId = null
        return
      }
      this.expandedJobId = jobId
      // Un job FAILED/CANCELLED avec un message affiche ce message plutôt que les stats
      // (voir template) — inutile d'appeler l'API de stats dans ce cas.
      if ((job?.status === 'FAILED' || job?.status === 'CANCELLED') && job?.errorMessage) return
      if (this.jobStatsMap[jobId]) return
      this.loadingStatsJobId = jobId
      try {
        const stats = await getWeezeventJobStats(jobId)
        this.jobStatsMap = { ...this.jobStatsMap, [jobId]: stats }
      } catch (err) {
        console.error('[DataIntegrationView] toggleJobStats error:', err)
      } finally {
        this.loadingStatsJobId = null
      }
    },

    closeSyncProgress() {
      this.syncProgressOpen = false
      this.syncJobId = null
    },

    // Le widget flottant vit désormais dans App.vue (persistant inter-routes) : on
    // ne peut plus l'atteindre par ref, on relaie l'activation par CustomEvent —
    // même convention que locale-changed/theme-changed dans ce composant.
    onJobMinimized(jobId) {
      if (jobId) {
        window.dispatchEvent(new CustomEvent('weezevent-job-minimized', { detail: { jobId } }))
      }
    },

    async handleSyncJob(integration, fromDate, toDate) {
      this.syncingMap = { ...this.syncingMap, [integration.id]: true }
      try {
        this.syncJobId = null
        this.syncSteps = []
        this.syncProgressIntegration = integration
        this.syncProgressOpen = true

        const result = await startWeezeventSyncJob({
          integrationId: integration.id,
          fromDate,
          toDate,
        })

        this.syncJobId = result.jobId
        // Rafraîchir l'historique une fois le job démarré
        this.loadSyncJobsFor(integration.id)
      } catch (err) {
        console.error('[DataIntegrationView] handleSyncJob error:', err)
        this.$toast?.error?.(err?.response?.data?.message || this.t('diSyncJobStartFailed'))
        this.syncProgressOpen = false
      } finally {
        const sm = { ...this.syncingMap }
        delete sm[integration.id]
        this.syncingMap = sm
      }
    },

    onSyncProgressDone() {
      this.syncProgressOpen = false
      this.syncJobId = null
      if (this.syncProgressIntegration) {
        this.loadSyncJobsFor(this.syncProgressIntegration.id)
      }
    },

    retrySyncProgress() {
      const integration = this.syncProgressIntegration
      if (!integration) return
      // Reset the syncing lock so handleSync doesn't short-circuit to just re-showing the dialog
      const sm = { ...this.syncingMap }
      delete sm[integration.id]
      this.syncingMap = sm
      this.handleSync(integration)
    },

    getMappingForLocation(locationId) {
      return this.mappings.find(m => m.weezeventLocationId === locationId) || null
    },

    // Returns the space mapped to a Weezevent integration instance (using integration.id as key).
    // Returns null when the referenced space no longer exists (deleted space).
    getSpaceForIntegration(integration) {
      const mapping = this.mappings.find(m => m.weezeventLocationId === integration.id)
      if (!mapping?.spaceId) return null
      if (!this.knownSpaceIds.has(String(mapping.spaceId))) return null
      return mapping
    },

    // Progression réelle connue depuis ici (sans appel API supplémentaire) : seul le
    // mapping espace est déjà chargé dans this.mappings, donc étape 1 done ou non.
    getCompletedStepsForIntegration(integration) {
      return this.getSpaceForIntegration(integration) ? 1 : 0
    },

    // Open wizard at integration level — the integration object is passed as the 'location'
    // so that StepMapSpace uses integration.id as the mapping key (1 instance → 1 space)
    openWizard(integration) {
      this.wizardLocation = { ...integration, completedSteps: this.getCompletedStepsForIntegration(integration) }
      const mapping = this.getSpaceForIntegration(integration)
      this.wizardSpaceId = mapping?.spaceId || null
      this.wizardOpen = true
    },

    closeWizard() {
      this.wizardOpen = false
      this.wizardLocation = null
      this.wizardSpaceId = null
      // Toujours rafraîchir les mappings à la fermeture : couvre aussi le cas où
      // l'utilisateur ferme le wizard après l'étape 1 seulement (mapping déjà créé).
      this.loadMappings()
    },

    // "Configurer la prochaine location" (WizardSuccess) : ferme le wizard courant
    // et le rouvre pour la location suivante — identique à un clic sur son bouton
    // de configuration depuis la liste. Le nextTick garantit un vrai remount
    // (currentStep/completedStepsList sont initialisés une seule fois dans data()).
    async handleConfigureNext(location) {
      this.closeWizard()
      await this.$nextTick()
      if (location) this.openWizard(location)
    },

    async handleWizardCompleted() {
      // Ne pas fermer le wizard ici : laisser l'écran de succès s'afficher.
      // Rafraîchir les mappings pour que la section soit à jour quand l'utilisateur ferme.
      await this.loadMappings()
    },

    handleGoToAnalytics(spaceId) {
      this.closeWizard()
      if (spaceId) {
        this.$router.push({ name: 'space-analyse', params: { spaceId } })
      }
    },

    async loadMappings() {
      try {
        const result = await getLocationSpaceMappings()
        // Backend returns { data: [...], meta: {...} }
        this.mappings = result?.data || result || []
      } catch (err) {
        console.error('[DataIntegrationView] loadMappings error:', err)
      }
    },

    // Recharge la liste des intégrations (les deux providers en parallèle ; l'ordre
    // d'affichage = weezevent puis digifood). Partagé entre init() et activated(),
    // où la vue keep-alive doit se resynchroniser sans repasser par le spinner plein écran.
    async fetchIntegrationsList() {
      if (!this.tenantId) return
      const wz = listWeezeventInstances(this.tenantId)
        .then((instances) => (instances || []).map(toCard))
        .catch((err) => {
          console.error('[DataIntegrationView] Failed to load weezevent instances:', err)
          return []
        })
      const df = listDigifoodInstances(this.tenantId)
        .then((instances) => (instances || []).map(toDigifoodCard))
        .catch((err) => {
          console.error('[DataIntegrationView] Failed to load digifood instances:', err)
          return []
        })
      const [w, d] = await Promise.all([wz, df])
      this.integrations = [...w, ...d]
    },

    async init() {
      this.loading = true
      try {
        await Promise.all([
          this.loadMappings(),
          // Pre-fetch spaces so the wizard cache is warm when the user clicks configure
          this.$store.dispatch('spaces/fetchSpaces').catch(() => {}),
          this.fetchIntegrationsList(),
        ])
        // Charger l'historique des jobs pour chaque intégration
        await this.loadAllSyncJobs()
      } finally {
        this.loading = false
      }
    },
  },
}
</script>

<style scoped>
.data-integration-view {
  display: flex;
  height: 100vh;
  background: #f9fafb;
}

/* Sidebar */
.sidebar {
  width: 220px;
  background: white;
  border-right: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.sidebar-section {
  padding: 8px;
}
.sidebar-title {
  padding: 8px 16px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9ca3af;
}
.sidebar-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: none;
  font-size: 14px;
  cursor: pointer;
  color: #374151;
  transition: background 0.15s;
}
.sidebar-item:hover {
  background: #f3f4f6;
}
.sidebar-item.active {
  background: #fef2f2;
  color: #ff3131;
  font-weight: 600;
}

/* Main */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}
.title-bar-text {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

/* Content */
.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: #9ca3af;
}

/* Cards */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.integration-card {
  background: white;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  transition: box-shadow 0.2s, transform 0.2s;
}
.integration-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.10);
  transform: translateY(-1px);
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: linear-gradient(135deg, #b91c1c 0%, #ff3131 60%, #e84848 100%);
}
.card-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.card-logo-wrap {
  width: 36px;
  height: 36px;
  background: rgba(255,255,255,0.15);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  backdrop-filter: blur(4px);
}
.card-header-title {
  font-size: 14px;
  font-weight: 700;
  color: white;
  line-height: 1.2;
}
.card-header-sub {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: rgba(255,255,255,0.75);
  margin-top: 2px;
}
.card-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4ade80;
  display: inline-block;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(74,222,128,0.3);
}
.card-header-actions {
  display: flex;
  gap: 4px;
}
.card-action-btn {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.15);
  cursor: pointer;
  padding: 5px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  color: rgba(255,255,255,0.85);
  transition: background 0.15s;
}
.card-action-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.25);
  color: white;
}
.card-action-btn--danger:hover:not(:disabled) {
  background: rgba(255,80,80,0.4);
}
.card-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.card-body {
  padding: 16px;
}
.card-chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.card-chip {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  padding: 3px 8px;
  border-radius: 20px;
}
.card-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #9ca3af;
  margin-bottom: 8px;
}

/* Sync date pickers */
.sync-date-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.date-input-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  cursor: pointer;
}
.date-input-label {
  display: flex;
  align-items: center;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #9ca3af;
  padding-left: 2px;
}
.date-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 12px;
  color: #374151;
  background: #f9fafb;
  outline: none;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  font-family: inherit;
}
.date-input:hover {
  border-color: #d1d5db;
  background: white;
}
.date-input:focus {
  border-color: #ff3131;
  background: white;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,0.08);
}

/* Sync button */
.sync-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 9px 14px;
  border-radius: 8px;
  border: none;
  background: #ff3131;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
  margin-bottom: 2px;
  box-shadow: 0 2px 8px rgba(255, 49, 49,0.35);
}
.sync-btn:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 49, 49,0.45);
}
.sync-btn:disabled,
.sync-btn--loading {
  opacity: 0.75;
  cursor: not-allowed;
  transform: none;
}
/* Variante secondaire : import de l'historique N-1 */
.sync-btn--history {
  margin-top: 6px;
  background: #f3f4f6;
  color: #374151;
  box-shadow: none;
  border: 1px solid #e5e7eb;
}
.sync-btn--history:hover:not(:disabled) {
  opacity: 1;
  background: #e5e7eb;
  box-shadow: none;
}
.card-divider {
  border-top: 1px solid #e5e7eb;
  margin: 12px 0;
}

/* Historique des syncs */
.sync-history {
  margin-top: 4px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  margin-bottom: 4px;
}
.sync-history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #374151;
  padding: 10px 14px;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  background: white;
  transition: background 0.12s;
}
.sync-history-item:last-child {
  border-bottom: none;
}
.sync-history-item:hover {
  background: #fafafa;
}
.sync-history-item :deep(.v-btn) {
  opacity: 0.55;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.sync-history-item:hover :deep(.v-btn) {
  opacity: 1;
}
.sync-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.sync-status-dot--success   { background: #22c55e; }
.sync-status-dot--error     { background: #ff3131; }
.sync-status-dot--warning   { background: #f59e0b; }
.sync-status-dot--cancelled { background: #9ca3af; }
.sync-history-range {
  flex: 1;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sync-history-count {
  font-weight: 600;
  color: #6b7280;
  font-size: 11px;
  min-width: 70px;
  text-align: right;
}
.sync-history-date {
  font-size: 11px;
  color: #9ca3af;
  min-width: 68px;
  text-align: right;
}
.sync-job-stats {
  padding: 10px 14px 12px;
  border-bottom: 1px solid #e5e7eb;
}
.sync-job-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.sync-job-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 5px 4px;
}
.sync-job-stat-value {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.sync-job-stat-label {
  font-size: 10px;
  color: #6b7280;
  margin-top: 1px;
}

/* Location row */
.location-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #6b7280;
}
.location-row:hover {
  color: #374151;
}
.location-row-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.location-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 6px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 11px;
  font-weight: 700;
  transition: background 0.15s, color 0.15s;
}
.location-badge--linked {
  background: #dcfce7;
  color: #16a34a;
}
.location-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
}
.location-link-btn {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #ff3131;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.location-link-btn:hover {
  background: #fee2e2;
}

/* Location list */
.location-list {
  margin-top: 10px;
  max-height: 200px;
  overflow-y: auto;
}
.location-syncing {
  display: flex;
  align-items: center;
  padding: 8px;
}
.location-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-radius: 6px;
  background: #f9fafb;
  margin-bottom: 4px;
  font-size: 12px;
  color: #6b7280;
}
.location-item-left {
  display: flex;
  align-items: center;
  gap: 4px;
}
.location-map-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}
.location-map-btn:hover {
  background: #eff6ff;
}

/* ── Config Drawer ────────────────────────────────────────────────── */

/* Gradient header */
.cd-header {
  background: linear-gradient(135deg, #ff3131 0%, #b91c1c 100%);
  padding: 18px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.cd-header__back {
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}
.cd-header__back:hover { background: rgba(255,255,255,0.28); }
.cd-header__icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(255,255,255,0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cd-header__body {
  flex: 1;
  min-width: 0;
}
.cd-header__title {
  font-size: 14px;
  font-weight: 700;
  color: white;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cd-header__sub {
  font-size: 11px;
  color: rgba(255,255,255,0.72);
  margin-top: 2px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cd-header__close {
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}
.cd-header__close:hover { background: rgba(255,255,255,0.28); }

/* Body */
.cd-body {
  padding: 20px;
  overflow-y: auto;
}
.cd-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9ca3af;
  margin-bottom: 10px;
}

/* Provider cards (Add panel) */
.cd-provider-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  background: white;
  cursor: pointer;
  margin-bottom: 10px;
  text-align: left;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.cd-provider-card:hover:not(.cd-provider-card--disabled) {
  border-color: #fca5a5;
  background: #fff8f8;
  box-shadow: 0 2px 8px rgba(255, 49, 49,0.10);
}
.cd-provider-card--disabled {
  opacity: 0.52;
  cursor: not-allowed;
}
.cd-provider-card__logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #fef2f2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cd-provider-card__logo--orange {
  background: #fff7ed;
}
.cd-provider-card__info {
  flex: 1;
  min-width: 0;
}
.cd-provider-card__name {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}
.cd-provider-card__desc {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}
.cd-soon-badge {
  font-size: 10px;
  font-weight: 700;
  background: #f3f4f6;
  color: #9ca3af;
  border-radius: 100px;
  padding: 3px 8px;
  flex-shrink: 0;
}

/* Form fields */
.cd-field {
  position: relative;
}
.cd-field .form-floating label {
  color: #9ca3af;
  font-size: 13px;
}
.cd-input {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 10px !important;
  font-size: 13.5px !important;
  color: #111827 !important;
  background: #f9fafb !important;
  transition: border-color 0.18s, box-shadow 0.18s, background 0.18s !important;
  padding-right: 12px !important;
}
.cd-input:focus {
  border-color: #ff3131 !important;
  background: white !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,0.10) !important;
}
.cd-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.cd-input--with-btn {
  padding-right: 44px !important;
}

/* Password field wrapper */
.cd-field--password {
  position: relative;
}
.cd-eye-btn {
  position: absolute;
  right: 12px;
  bottom: 12px;
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 4px;
  transition: color 0.15s;
  z-index: 10;
}
.cd-eye-btn:hover { color: #374151; }
.cd-eye-btn:disabled { cursor: not-allowed; opacity: 0.4; }

/* Field hint */
.cd-field-hint {
  font-size: 11.5px;
  color: #9ca3af;
  margin-top: -8px;
  padding-left: 2px;
}

/* Banners */
.cd-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  position: relative;
}
.cd-banner--error {
  background: #fef2f2;
  border: 1.5px solid #fca5a5;
  color: #ff3131;
}
.cd-banner--success {
  background: #f0fdf4;
  border: 1.5px solid #86efac;
  color: #15803d;
}
.cd-banner--neutral {
  background: #f9fafb;
  border: 1.5px solid #e5e7eb;
  color: #6b7280;
}
.cd-banner__close {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
  display: flex;
  align-items: center;
  padding: 0;
}
.cd-banner__close:hover { opacity: 1; }

/* Buttons */
.cd-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 11px 18px;
  border-radius: 100px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
}
.cd-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none !important;
}
.cd-btn--primary {
  background: #ff3131;
  color: white;
  box-shadow: 0 2px 8px rgba(255, 49, 49,0.30);
}
.cd-btn--primary:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(255, 49, 49,0.40);
}
.cd-btn--ghost {
  background: transparent;
  color: #6b7280;
  border: 1.5px solid #e5e7eb;
}
.cd-btn--ghost:hover:not(:disabled) {
  background: #f9fafb;
  color: #374151;
}

/* ── Dark mode — Config Drawer ───────────────────────────────────── */
.di--dark .cd-body {
  background: #1a1a2e;
}
.di--dark .cd-section-label { color: #6b7280; }
.di--dark .cd-provider-card {
  background: #1f1f2e;
  border-color: #2d2d3d;
}
.di--dark .cd-provider-card:hover:not(.cd-provider-card--disabled) {
  background: #2a1a1a;
  border-color: #ff3131;
}
.di--dark .cd-provider-card__name { color: #f3f4f6; }
.di--dark .cd-provider-card__desc { color: #9ca3af; }
.di--dark .cd-input {
  background: #1e1e2e !important;
  border-color: #374151 !important;
  color: #f3f4f6 !important;
}
.di--dark .cd-input:focus {
  background: #252535 !important;
  border-color: #ff3131 !important;
}
.di--dark .cd-field .form-floating label { color: #6b7280; }
.di--dark .cd-field-hint { color: #6b7280; }
.di--dark .cd-banner--error {
  background: rgba(255,49,49,0.12);
  border-color: rgba(252,165,165,0.3);
  color: #fca5a5;
}
.di--dark .cd-banner--success {
  background: rgba(22,163,74,0.12);
  border-color: rgba(134,239,172,0.3);
  color: #4ade80;
}
.di--dark .cd-banner--neutral {
  background: rgba(156,163,175,0.12);
  border-color: rgba(156,163,175,0.3);
  color: #9ca3af;
}
.di--dark .cd-btn--ghost {
  border-color: #374151;
  color: #9ca3af;
}
.di--dark .cd-btn--ghost:hover:not(:disabled) {
  background: #252525;
  color: #d1d5db;
}
.di--dark .cd-soon-badge {
  background: #252525;
  color: #6b7280;
}
.di--dark .cd-eye-btn { color: #6b7280; }
.di--dark .cd-eye-btn:hover { color: #d1d5db; }

/* ── Dark mode ────────────────────────────────────────────────────────── */
.di--dark.data-integration-view {
  background: #111827;
}

/* Sidebar */
.di--dark .sidebar {
  background: #1f2937;
  border-right-color: rgba(255, 255, 255, 0.10);
}
.di--dark .sidebar-title {
  color: #6b7280;
}
.di--dark .sidebar-item {
  color: #d1d5db;
}
.di--dark .sidebar-item:hover {
  background: #252525;
}
.di--dark .sidebar-item.active {
  background: rgba(255, 49, 49, 0.15);
  color: #f87171;
}

/* Content area */
.di--dark .content-area {
  background: #111827;
}

/* Integration cards */
.di--dark .integration-card {
  background: #1f1f1f;
  border-color: #2d2d2d;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}
.di--dark .integration-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

/* Card body */
.di--dark .card-chip {
  background: #252525;
  border-color: #374151;
  color: #9ca3af;
}
.di--dark .card-section-label {
  color: #6b7280;
}
.di--dark .card-divider {
  border-top-color: #2d2d2d;
}

/* Date inputs */
.di--dark .date-input {
  background: #1e1e2e;
  border-color: #374151;
  color: #d1d5db;
  color-scheme: dark;
}
.di--dark .date-input:hover {
  background: #252535;
  border-color: #4b5563;
}
.di--dark .date-input:focus {
  background: #252535;
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.15);
}
.di--dark .date-input-label {
  color: #6b7280;
}

/* Sync history */
.di--dark .sync-history {
  border-color: #2d2d2d;
}
.di--dark .sync-history-item {
  background: #1f1f1f;
  border-bottom-color: #252525;
  color: #d1d5db;
}
.di--dark .sync-history-item:hover {
  background: #252525;
}
.di--dark .sync-history-range {
  color: #d1d5db;
}
.di--dark .sync-history-count {
  color: #9ca3af;
}
.di--dark .sync-history-date {
  color: #6b7280;
}

/* Job stats panel */
.di--dark .sync-job-stats {
  border-bottom-color: #2d2d2d;
}
.di--dark .sync-job-stat-item {
  background: #252525;
}
.di--dark .sync-job-stat-value {
  color: #f9fafb;
}
.di--dark .sync-job-stat-label {
  color: #6b7280;
}

/* Location row */
.di--dark .location-row {
  color: #9ca3af;
}
.di--dark .location-row:hover {
  color: #d1d5db;
}
.di--dark .location-badge {
  background: #252525;
  color: #9ca3af;
}
.di--dark .location-badge--linked {
  background: rgba(22, 163, 74, 0.15);
  color: #4ade80;
}
.di--dark .location-empty {
  color: #9ca3af;
}
.di--dark .location-link-btn {
  background: rgba(255, 49, 49, 0.1);
  border-color: rgba(255, 49, 49, 0.35);
  color: #f87171;
}
.di--dark .location-link-btn:hover {
  background: rgba(255, 49, 49, 0.2);
}
.di--dark .location-item {
  background: #252525;
  color: #9ca3af;
}
.di--dark .location-map-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}


/* Title bar */
.di--dark .title-bar {
  background: #1f2937;
  border-bottom-color: rgba(255, 255, 255, 0.10);
}
.di--dark .title-bar-text {
  color: #f9fafb;
}

/* Empty state */
.di--dark .empty-state {
  color: #6b7280;
}

/* ── Digifood ── */
.df-webhook-url {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 8px;
}
.df-webhook-url code {
  flex: 1;
  font-size: 11px;
  color: #374151;
  word-break: break-all;
  background: none;
  padding: 0;
}
.di--dark .df-webhook-url {
  background: #1f2937;
  border-color: #374151;
}
.di--dark .df-webhook-url code {
  color: #d1d5db;
}
.df-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  font-size: 11px;
  color: #374151;
  cursor: pointer;
  white-space: nowrap;
}
.df-copy-btn:hover { background: #f9fafb; }
.di--dark .df-copy-btn {
  background: #111827;
  border-color: #374151;
  color: #d1d5db;
}
.df-hint {
  font-size: 11px;
  color: #9ca3af;
  margin: 0 0 10px;
}
.df-reception {
  display: flex;
  align-items: center;
  font-size: 11.5px;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 7px 10px;
  margin: 8px 0;
}
.df-reception--ok {
  color: #065f46;
  background: #ecfdf5;
  border-color: #a7f3d0;
}
.di--dark .df-reception {
  background: rgba(251, 191, 36, 0.08);
  border-color: rgba(251, 191, 36, 0.25);
  color: #fbbf24;
}
.di--dark .df-reception--ok {
  background: rgba(52, 211, 153, 0.08);
  border-color: rgba(52, 211, 153, 0.25);
  color: #34d399;
}

/* Rapport d'import CSV */
.df-report-title {
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}
.df-period {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #374151;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 8px;
  padding: 7px 10px;
  margin-bottom: 10px;
}
.df-report-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.df-report-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 6px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.df-report-item strong { font-size: 17px; }
.df-report-item span {
  font-size: 10.5px;
  color: #6b7280;
  text-align: center;
}
.df-report-item--warn {
  background: #fffbeb;
  border-color: #fde68a;
}
.df-rejected {
  max-height: 140px;
  overflow-y: auto;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 8px 10px;
}
.df-rejected-row {
  font-size: 11px;
  color: #92400e;
  padding: 2px 0;
}

/* Correspondance des colonnes CSV */
.df-mapping-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}
.df-mapping-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
  max-height: 260px;
  overflow-y: auto;
  padding: 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 8px;
}
.df-mapping-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.df-mapping-label {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.df-mapping-label--req {
  color: #374151;
  font-weight: 600;
}
.df-mapping-warn {
  display: flex;
  align-items: center;
  font-size: 11.5px;
  color: #92400e;
  margin: 0 0 10px;
}
</style>
