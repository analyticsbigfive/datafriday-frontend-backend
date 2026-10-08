<template>
  <v-dialog :model-value="modelValue" max-width="400" @update:model-value="close">
    <v-card rounded="lg" class="lgva-card">
      <v-card-title class="lgva-title">
        <v-icon size="18" color="#ff3131">mdi-qrcode</v-icon>
        {{ t('logiVentilationAccessTitle') }}
      </v-card-title>

      <v-card-text>
        <p class="lgva-hint">{{ t('logiVentilationAccessHint') }}</p>

        <div v-if="loading" class="lgva-loading"><v-progress-circular size="22" width="2" indeterminate /></div>
        <template v-else>
          <div class="lgva-status" :class="`lgva-status--${statusKey}`">
            {{ t(`logiVentilationAccess_${statusKey}`) }}
          </div>

          <div v-if="isOpen && pin" class="lgva-pin">
            <span class="lgva-pin-label">{{ t('logiVentilationAccessPin') }}</span>
            <span class="lgva-pin-value">{{ pin }}</span>
          </div>

          <div class="lgva-actions">
            <v-btn
              v-if="!isOpen"
              class="lgva-primary"
              variant="flat"
              rounded="lg"
              :loading="busy === 'start'"
              :disabled="!eventId || !!busy"
              @click="run('start')"
            >
              <v-icon size="16" class="mr-1">mdi-play</v-icon>{{ t('logiVentilationAccessStart') }}
            </v-btn>
            <template v-else>
              <v-btn variant="tonal" color="#ff3131" rounded="lg" :loading="busy === 'reset'" :disabled="!!busy" @click="run('reset')">
                <v-icon size="16" class="mr-1">mdi-refresh</v-icon>{{ t('logiVentilationAccessResetPin') }}
              </v-btn>
              <v-btn variant="outlined" color="#ff3131" rounded="lg" :loading="busy === 'stop'" :disabled="!!busy" @click="run('stop')">
                <v-icon size="16" class="mr-1">mdi-stop</v-icon>{{ t('logiVentilationAccessStop') }}
              </v-btn>
            </template>
            <v-btn v-if="slug" variant="text" color="#ff3131" rounded="lg" @click="qrOpen = true">
              <v-icon size="16" class="mr-1">mdi-qrcode</v-icon>{{ t('logiVentilationAccessShowQr') }}
            </v-btn>
          </div>

          <v-alert v-if="!eventId" type="info" variant="tonal" density="compact" class="mt-3">
            {{ t('logiVentilationAccessNoEvent') }}
          </v-alert>
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</v-alert>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn color="#ff3131" rounded="lg" elevation="0" @click="close(false)">{{ t('close') }}</v-btn>
      </v-card-actions>
    </v-card>

    <GuestPinQrDialog v-model="qrOpen" :slug="slug" :element-name="qrLabel" />
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'
import GuestPinQrDialog from '@/components/guest-pin-manage/dialogs/GuestPinQrDialog.vue'
import {
  getVentilationAccess,
  startVentilationAccess,
  stopVentilationAccess,
  resetVentilationPin,
} from '@/api/endpoints/ventilationAccess.api'

/**
 * Accès PIN des logisticiens à la feuille de ventilation (réponses #72, #75, #77) :
 * un QR fixe par espace, un PIN par match ; démarrer, arrêter, changer le PIN.
 * L'accès se ferme seul à la fin réelle du match.
 */
export default {
  name: 'LogisticVentilationAccessDialog',
  components: { GuestPinQrDialog },
  props: {
    modelValue: { type: Boolean, default: false },
    spaceId: { type: String, default: null },
    /** Match de la Ventilation affichée (null = aucun match à venir). */
    eventId: { type: String, default: null },
    spaceName: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup() {
    const { t } = useI18n()
    return { t }
  },
  data() {
    return { loading: false, busy: null, error: null, status: null, qrOpen: false }
  },
  computed: {
    slug() { return this.status?.slug || null },
    isOpen() { return this.status?.window?.status === 'open' },
    pin() { return this.status?.window?.pin || null },
    statusKey() {
      if (!this.status?.window) return 'never'
      return this.isOpen ? 'open' : 'stopped'
    },
    qrLabel() {
      return `${this.t('logiVentilationBtn')} · ${this.spaceName || ''}`.trim()
    },
  },
  watch: {
    modelValue(open) {
      if (open) this.load()
    },
  },
  methods: {
    async load() {
      if (!this.spaceId) return
      this.loading = true
      this.error = null
      try {
        this.status = await getVentilationAccess(this.spaceId, this.eventId)
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || null
      } finally {
        this.loading = false
      }
    },
    async run(action) {
      if (!this.spaceId || !this.eventId) return
      this.busy = action
      this.error = null
      try {
        const call = { start: startVentilationAccess, stop: stopVentilationAccess, reset: resetVentilationPin }[action]
        this.status = await call(this.spaceId, this.eventId)
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || null
      } finally {
        this.busy = null
      }
    },
    close(value) {
      this.$emit('update:modelValue', value === true)
    },
  },
}
</script>

<style scoped>
.lgva-title { display: flex; align-items: center; gap: 8px; font-weight: var(--fw-bold); }
.lgva-hint { font-size: var(--fs-base); color: var(--fb-muted, #6b7280); margin: 0 0 12px; }
.lgva-loading { display: flex; justify-content: center; padding: 16px 0; }
.lgva-status { display: inline-flex; font-size: var(--fs-sm); font-weight: var(--fw-bold); border-radius: 999px; padding: 3px 10px; background: var(--fb-subtle, #f3f4f6); color: var(--fb-muted, #6b7280); }
.lgva-status--open { background: var(--fb-success-soft, #f0fdf4); color: var(--fb-success, #16a34a); }
.lgva-pin { display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 16px 0 8px; }
.lgva-pin-label { font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; color: var(--fb-muted, #6b7280); }
.lgva-pin-value { font-variant-numeric: tabular-nums; font-size: var(--fs-xxl); font-weight: var(--fw-bold); letter-spacing: 0.2em; color: var(--fb-text, #212121); }
.lgva-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.lgva-actions :deep(.v-btn) { text-transform: none; font-weight: var(--fw-semibold); }
.lgva-primary { background: #ff3131 !important; color: #fff !important; }
</style>
