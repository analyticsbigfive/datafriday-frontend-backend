<template>
  <div class="gpb-zone" :class="zoneClass">
    <template v-if="!access || access.status === 'revoked'">
      <button type="button" class="gpb-generate" :disabled="working" @click="onGenerate">
        <KeyRound :size="14" />
        {{ t('guestPinAdminGeneratePin') }}
      </button>
    </template>

    <template v-else-if="access.submittedAt">
      <FileCheck :size="16" />
      <div class="gpb-sub">
        <span class="gpb-label gpb-label--submitted">{{ t('guestPinAdminStatusSubmitted') }}</span>
        <span class="gpb-meta">{{ t('guestPinAdminSubmittedAt') }} {{ formatTime(access.submittedAt) }}</span>
      </div>
    </template>

    <template v-else>
      <UserCheck v-if="access.lastLoginAt" :size="16" />
      <KeyRound v-else :size="16" />
      <div class="gpb-sub">
        <span class="gpb-label" :class="{ 'gpb-label--seen': access.lastLoginAt }">
          {{ access.lastLoginAt ? t('guestPinAdminSeen') : t('guestPinAdminNotSeenYet') }}
        </span>
        <span v-if="access.lastLoginAt" class="gpb-meta">{{ formatTime(access.lastLoginAt) }}</span>
      </div>
      <button type="button" class="gpb-icon-btn" :title="t('guestPinAdminResetPin')" :disabled="working" @click="onReset">
        <RefreshCw :size="14" />
      </button>
      <button type="button" class="gpb-icon-btn gpb-icon-btn--danger" :title="t('guestPinAdminRevoke')" :disabled="working" @click="onRevoke">
        <Ban :size="14" />
      </button>
    </template>

    <SetPinDialog
      v-model="dialogOpen"
      :window-id="windowId"
      :element-id="elementId"
      :element-name="elementName"
    />
  </div>
</template>

<script>
import { KeyRound, RefreshCw, Ban, UserCheck, FileCheck } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import SetPinDialog from '@/components/guest-pin-manage/dialogs/SetPinDialog.vue';

/**
 * Bouton/badge "Générer PIN" porté par CHAQUE carte PDV — remplace la modale
 * "Démarrer l'inventaire" avec sa liste de tous les PDV : ici le PDV est déjà
 * connu (la carte), il ne reste qu'à ouvrir la fenêtre si besoin puis générer.
 *
 * Ne fait AUCUN fetch lui-même : lit l'accès réactivement dans le store
 * `guestPinAdmin` (déjà peuplé par GuestPinAccessPanel, monté une fois dans la
 * colonne de droite) — pas de prop-drilling depuis SpaceInventoryView.
 */
export default {
  name: 'GuestPinBadge',
  components: { KeyRound, RefreshCw, Ban, UserCheck, FileCheck, SetPinDialog },

  props: {
    spaceId: { type: String, required: true },
    eventId: { type: String, required: true },
    phase: { type: String, required: true }, // 'pre-event' | 'post-event'
    elementId: { type: String, required: true },
    elementName: { type: String, default: '' },
  },

  setup() {
    const { t } = useI18n();
    return { t };
  },

  data() {
    return {
      working: false,
      dialogOpen: false,
      pendingWindowId: null,
    };
  },

  computed: {
    window() {
      return this.$store.getters['guestPinAdmin/windowByPhase'](this.phase);
    },
    access() {
      return this.window?.accesses?.find((a) => a.elementId === this.elementId) ?? null;
    },
    windowId() {
      return this.pendingWindowId || this.window?.id || null;
    },
    zoneClass() {
      if (!this.access || this.access.status === 'revoked') return '';
      if (this.access.submittedAt) return 'gpb-zone--submitted';
      return this.access.lastLoginAt ? 'gpb-zone--seen' : 'gpb-zone--pending';
    },
  },

  methods: {
    formatTime(iso) {
      try {
        return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    },

    async ensureOpenWindow() {
      if (this.window?.status === 'open') return this.window.id;
      await this.$store.dispatch('guestPinAdmin/openWindow', {
        spaceId: this.spaceId,
        eventId: this.eventId,
        phase: this.phase,
      });
      return this.$store.getters['guestPinAdmin/windowByPhase'](this.phase)?.id ?? null;
    },

    async onGenerate() {
      this.working = true;
      try {
        this.pendingWindowId = await this.ensureOpenWindow();
        this.dialogOpen = true;
      } finally {
        this.working = false;
      }
    },

    async onReset() {
      if (!this.access) return;
      this.working = true;
      try {
        this.pendingWindowId = this.window?.id ?? null;
        await this.$store.dispatch('guestPinAdmin/regeneratePin', this.access.id);
        this.dialogOpen = true;
      } finally {
        this.working = false;
      }
    },

    async onRevoke() {
      if (!this.access) return;
      this.working = true;
      try {
        await this.$store.dispatch('guestPinAdmin/revoke', this.access.id);
      } finally {
        this.working = false;
      }
    },
  },
};
</script>

<style scoped>
.gpb-zone {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-width: 190px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--fb-subtle, #fafafa);
  border: 1px dashed var(--fb-border, #e5e7eb);
  color: #6b7280;
}
.gpb-zone--pending { background: #fff7ed; border-style: solid; border-color: #fde68a; color: #92400e; }
.gpb-zone--seen { background: #f0fdf4; border-style: solid; border-color: #bbf7d0; color: #15803d; }
.gpb-zone--submitted { background: #f5f3ff; border-style: solid; border-color: #ddd6fe; color: #6d28d9; }

.gpb-sub { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.gpb-label { font-size: 11.5px; font-weight: 700; }
.gpb-label--seen { color: #15803d; }
.gpb-label--submitted { color: #6d28d9; }
.gpb-meta { font-size: 10.5px; color: inherit; opacity: 0.8; }

.gpb-generate {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1.5px solid #ff3131;
  color: #ff3131;
  background: #fff;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
.gpb-generate:disabled { opacity: 0.6; cursor: default; }

.gpb-icon-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--fb-border, #e5e7eb);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  cursor: pointer;
  flex-shrink: 0;
}
.gpb-icon-btn:hover { border-color: #ff3131; color: #ff3131; }
.gpb-icon-btn--danger:hover { border-color: #dc2626; color: #dc2626; }
.gpb-icon-btn:disabled { opacity: 0.5; cursor: default; }
</style>
