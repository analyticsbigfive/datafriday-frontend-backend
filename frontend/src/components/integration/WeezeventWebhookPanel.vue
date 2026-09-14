<template>
  <div class="wwp" :class="{ 'wwp--dark': isDark }">
    <div class="wwp-label">{{ t('diWzWebhookTitle') }}</div>

    <div class="wwp-url">
      <code>{{ integration.webhookUrl }}</code>
      <button type="button" class="wwp-copy-btn" :aria-label="t('diCopy')" @click="copyUrl">
        <v-icon size="13">{{ copied ? 'mdi-check' : 'mdi-content-copy' }}</v-icon>
      </button>
    </div>
    <p class="wwp-hint">{{ t('diWzWebhookHint') }}</p>

    <div class="wwp-secret-row">
      <input
        v-model="secret"
        :type="showSecret ? 'text' : 'password'"
        class="wwp-input"
        :placeholder="status && status.configured ? t('diWzWebhookSecretConfigured') : t('diWzWebhookSecretPlaceholder')"
        autocomplete="off"
      />
      <button type="button" class="wwp-copy-btn" :aria-label="t('diWzWebhookToggleSecret')" @click="showSecret = !showSecret">
        <v-icon size="13">{{ showSecret ? 'mdi-eye-off-outline' : 'mdi-eye-outline' }}</v-icon>
      </button>
      <button type="button" class="wwp-btn wwp-btn--primary" :disabled="saving || !secret" @click="saveSecret">
        <v-progress-circular v-if="saving" indeterminate size="12" width="2" color="white" class="mr-1" />
        {{ status && status.configured ? t('diWzWebhookRotate') : t('diWzWebhookActivate') }}
      </button>
    </div>
    <p v-if="saveError" class="wwp-error">{{ saveError }}</p>

    <button type="button" class="wwp-btn" :disabled="checking" @click="refresh">
      <v-progress-circular v-if="checking" indeterminate size="12" width="2" class="mr-1" />
      <v-icon v-else size="14" class="mr-1">mdi-access-point-check</v-icon>
      {{ t('diWzWebhookCheck') }}
    </button>

    <div v-if="status" class="wwp-status" :class="statusClass">
      <div class="wwp-status-line">
        <v-icon size="13" class="mr-1">{{ statusIcon }}</v-icon>
        <strong>{{ statusTitle }}</strong>
      </div>
      <div v-if="status.lastWebhook" class="wwp-status-detail">
        {{ t('diWzWebhookLast') }} : {{ formatDate(status.lastWebhook.createdAt) }}
        ({{ status.lastWebhook.eventType }} · {{ lastWebhookState }})
        · {{ last24hLabel }}
      </div>
      <div v-else class="wwp-status-detail">{{ t('diWzWebhookNone') }}</div>
      <div v-if="status.sync" class="wwp-status-detail">
        {{ t('diWzPollingMode') }} : {{ pollingModeLabel }} ({{ pollingEveryLabel }})
        <template v-if="status.sync.lastSuccessAt"> · {{ t('diWzPollingLastSuccess') }} {{ formatDate(status.sync.lastSuccessAt) }}</template>
        <template v-if="status.sync.lastError"> · <span class="wwp-error-inline">{{ status.sync.lastError }}</span></template>
      </div>
      <div v-else class="wwp-status-detail">{{ t('diWzPollingUnknown') }}</div>
    </div>
  </div>
</template>

<script>
import { getWeezeventWebhookStatus, updateWeezeventWebhookConfig } from '@/api/endpoints/aggregation.api'

/**
 * BUG-379-02 : bloc webhook Weezevent de Data Integration, miroir du bloc Digifood.
 * Sans lui, personne ne peut ni configurer le temps réel ni vérifier que Weezevent nous appelle.
 */
export default {
  name: 'WeezeventWebhookPanel',
  props: {
    integration: { type: Object, required: true },
    organizationId: { type: String, required: true },
    isDark: { type: Boolean, default: false },
    t: { type: Function, required: true },
    formatDate: { type: Function, required: true },
  },
  data() {
    return {
      status: null,
      secret: '',
      showSecret: false,
      saving: false,
      saveError: '',
      checking: false,
      copied: false,
    }
  },
  computed: {
    statusClass() {
      if (!this.status) return ''
      if (this.status.healthy) return 'wwp-status--ok'
      if (this.status.configured && this.status.enabled) return 'wwp-status--warn'
      return 'wwp-status--off'
    },
    statusIcon() {
      if (!this.status) return 'mdi-help-circle-outline'
      if (this.status.healthy) return 'mdi-check-circle-outline'
      if (this.status.configured && this.status.enabled) return 'mdi-timer-sand'
      return 'mdi-close-circle-outline'
    },
    statusTitle() {
      if (!this.status) return ''
      if (this.status.healthy) return this.t('diWzWebhookHealthy')
      if (this.status.configured && this.status.enabled) return this.t('diWzWebhookSilent')
      return this.t('diWzWebhookNotConfigured')
    },
    lastWebhookState() {
      const w = this.status && this.status.lastWebhook
      if (!w) return ''
      if (w.processed) return this.t('diWebhookStatusOk')
      return w.error ? this.t('diWebhookStatusError') : this.t('diWebhookStatusPending')
    },
    last24hLabel() {
      const c = (this.status && this.status.last24h) || { received: 0, failed: 0 }
      return this.t('diWzWebhook24h').replace('{received}', c.received).replace('{failed}', c.failed)
    },
    pollingEveryLabel() {
      const s = this.status && this.status.sync ? this.status.sync.intervalSec : 0
      return this.t('diWzPollingEvery').replace('{seconds}', s)
    },
    pollingModeLabel() {
      const mode = this.status && this.status.sync && this.status.sync.mode
      if (mode === 'live-webhook') return this.t('diWzPollingModeWebhook')
      if (mode === 'live-polling') return this.t('diWzPollingModeLive')
      return this.t('diWzPollingModeIdle')
    },
  },
  mounted() {
    this.refresh()
  },
  methods: {
    async refresh() {
      this.checking = true
      try {
        this.status = await getWeezeventWebhookStatus(this.organizationId, this.integration.id)
      } catch (err) {
        console.error('[Weezevent webhook] status failed:', err)
      } finally {
        this.checking = false
      }
    },
    async saveSecret() {
      this.saving = true
      this.saveError = ''
      try {
        await updateWeezeventWebhookConfig(this.organizationId, this.integration.id, {
          webhookSecret: this.secret,
          webhookEnabled: true,
        })
        this.secret = ''
        await this.refresh()
      } catch (err) {
        this.saveError = (err && err.response && err.response.data && err.response.data.message) || this.t('diSaveFailed')
      } finally {
        this.saving = false
      }
    },
    async copyUrl() {
      try {
        await navigator.clipboard.writeText(this.integration.webhookUrl)
        this.copied = true
        setTimeout(() => { this.copied = false }, 2000)
      } catch { /* clipboard indisponible (http), l'URL reste sélectionnable */ }
    },
  },
}
</script>

<style scoped>
.wwp { margin: 14px 0 6px; }
.wwp-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6b7280;
  margin-bottom: 8px;
}
.wwp-url, .wwp-secret-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 8px;
}
.wwp-url code {
  flex: 1;
  font-size: 11px;
  color: #374151;
  word-break: break-all;
  background: none;
  padding: 0;
}
.wwp-input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  color: #111827;
}
.wwp-copy-btn, .wwp-btn {
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
.wwp-btn { padding: 6px 10px; margin-bottom: 8px; }
.wwp-btn:disabled { opacity: 0.55; cursor: default; }
.wwp-btn--primary { background: #111827; color: white; border-color: #111827; margin-bottom: 0; }
.wwp-copy-btn:hover, .wwp-btn:hover:not(:disabled) { background: #f9fafb; }
.wwp-btn--primary:hover:not(:disabled) { background: #1f2937; }
.wwp-hint { font-size: 11px; color: #9ca3af; margin: 0 0 10px; }
.wwp-error { font-size: 11px; color: #b91c1c; margin: 0 0 8px; }
.wwp-error-inline { color: #b91c1c; }
.wwp-status {
  font-size: 11.5px;
  border-radius: 8px;
  padding: 7px 10px;
  margin: 8px 0;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
}
.wwp-status--ok { color: #065f46; background: #ecfdf5; border-color: #a7f3d0; }
.wwp-status--off { color: #374151; background: #f3f4f6; border-color: #e5e7eb; }
.wwp-status-line { display: flex; align-items: center; }
.wwp-status-detail { margin-top: 4px; opacity: 0.9; }

.wwp--dark .wwp-url, .wwp--dark .wwp-secret-row { background: #1f2937; border-color: #374151; }
.wwp--dark .wwp-url code { color: #d1d5db; }
.wwp--dark .wwp-input { background: #111827; border-color: #374151; color: #e5e7eb; }
.wwp--dark .wwp-copy-btn, .wwp--dark .wwp-btn { background: #111827; border-color: #374151; color: #d1d5db; }
.wwp--dark .wwp-btn--primary { background: #f9fafb; color: #111827; border-color: #f9fafb; }
.wwp--dark .wwp-status { background: rgba(251, 191, 36, 0.08); border-color: rgba(251, 191, 36, 0.25); color: #fbbf24; }
.wwp--dark .wwp-status--ok { background: rgba(52, 211, 153, 0.08); border-color: rgba(52, 211, 153, 0.25); color: #34d399; }
.wwp--dark .wwp-status--off { background: #1f2937; border-color: #374151; color: #d1d5db; }
</style>
