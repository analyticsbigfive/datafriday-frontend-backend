<template>
  <div class="gpb-zone" :class="zoneClass">
    <!-- QR du lien de connexion — toujours dispo, indépendant du statut PIN
         (le lien/slug ne change jamais, contrairement au PIN partagé). -->
    <button
      v-if="slug"
      type="button"
      class="gpb-icon-btn"
      :title="t('guestPinQrTitle')"
      @click="qrDialogOpen = true"
    >
      <QrCode :size="14" />
    </button>

    <!-- Personne ne s'est encore connecté pour ce PDV — rien à faire ici, le PIN
         (partagé par toute la fenêtre) se génère depuis le panneau de droite, pas
         par carte. -->
    <template v-if="!access">
      <KeyRound :size="14" />
      <span class="gpb-label">{{ t('guestPinAdminNotSeenYet') }}</span>
    </template>

    <template v-else-if="access.status === 'revoked'">
      <Ban :size="16" />
      <div class="gpb-sub">
        <span class="gpb-label gpb-label--revoked">{{ t('guestPinAdminStatusRevoked') }}</span>
      </div>
      <button type="button" class="gpb-icon-btn gpb-icon-btn--success" :title="t('guestPinAdminReactivate')" :disabled="working" @click="onReactivate">
        <RefreshCw :size="14" />
      </button>
    </template>

    <!-- Validé par le directeur = SEUL état verrouillé (écriture invité refusée
         côté service). "Soumis" (ci-dessous) ne l'est pas : le manager reste
         modifiable tant que ce badge n'est pas passé ici. -->
    <template v-else-if="access.validatedAt">
      <Lock :size="16" />
      <div class="gpb-sub">
        <span class="gpb-label gpb-label--validated">{{ t('guestPinAdminStatusValidated') }}</span>
      </div>
    </template>

    <template v-else-if="access.submittedAt">
      <FileCheck :size="16" />
      <div class="gpb-sub">
        <span class="gpb-label gpb-label--submitted">{{ t('guestPinAdminStatusSubmitted') }}</span>
        <span class="gpb-meta">{{ t('guestPinAdminSubmittedAt') }} {{ formatTime(access.submittedAt) }}</span>
      </div>
      <button type="button" class="gpb-icon-btn gpb-icon-btn--success" :title="t('guestPinAdminValidate')" :disabled="working" @click="onValidate">
        <Check :size="14" />
      </button>
      <button type="button" class="gpb-icon-btn" :title="t('guestPinAdminRequestCorrection')" :disabled="working" @click="onRequestCorrection">
        <Undo2 :size="14" />
      </button>
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
      <button type="button" class="gpb-icon-btn gpb-icon-btn--danger" :title="t('guestPinAdminRevoke')" :disabled="working" @click="onRevoke">
        <Ban :size="14" />
      </button>
    </template>

    <GuestPinQrDialog v-if="slug" v-model="qrDialogOpen" :slug="slug" :element-name="elementName" />
  </div>
</template>

<script>
import { KeyRound, RefreshCw, Ban, UserCheck, FileCheck, Lock, Check, Undo2, QrCode } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import GuestPinQrDialog from '@/components/guest-pin-manage/dialogs/GuestPinQrDialog.vue';

/**
 * Badge de statut PAR PDV, porté par chaque carte — plus de génération de PIN ici
 * (décision produit 2026-09-08 : UN SEUL PIN partagé par TOUS les PDV d'une
 * fenêtre, généré une fois depuis GuestPinAccessPanel.vue, pas par carte). La
 * ligne GuestPinAccess elle-même est désormais auto-créée au premier login du
 * manager — tant que personne ne s'est connecté pour ce PDV, `access` est null
 * ici, sans action possible (rien à révoquer/valider avant une 1ʳᵉ connexion).
 *
 * Ne fait AUCUN fetch lui-même : lit l'accès réactivement dans le store
 * `guestPinAdmin` (déjà peuplé par GuestPinAccessPanel, monté une fois dans la
 * colonne de droite) — pas de prop-drilling depuis SpaceInventoryView.
 */
export default {
  name: 'GuestPinBadge',
  components: { KeyRound, RefreshCw, Ban, UserCheck, FileCheck, Lock, Check, Undo2, QrCode, GuestPinQrDialog },

  props: {
    phase: { type: String, required: true }, // 'pre-event' | 'post-event'
    elementId: { type: String, required: true },
    slug: { type: String, default: null },
    elementName: { type: String, default: '' },
  },

  setup() {
    const { t } = useI18n();
    return { t };
  },

  data() {
    return {
      working: false,
      qrDialogOpen: false,
    };
  },

  computed: {
    window() {
      return this.$store.getters['guestPinAdmin/windowByPhase'](this.phase);
    },
    access() {
      return this.window?.accesses?.find((a) => a.elementId === this.elementId) ?? null;
    },
    zoneClass() {
      if (!this.access) return '';
      if (this.access.status === 'revoked') return 'gpb-zone--revoked';
      if (this.access.validatedAt) return 'gpb-zone--validated';
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

    async onRevoke() {
      if (!this.access) return;
      this.working = true;
      try {
        await this.$store.dispatch('guestPinAdmin/revoke', this.access.id);
      } finally {
        this.working = false;
      }
    },

    async onReactivate() {
      if (!this.access) return;
      this.working = true;
      try {
        await this.$store.dispatch('guestPinAdmin/reactivate', this.access.id);
      } finally {
        this.working = false;
      }
    },

    /** Verrouille l'écriture invité pour ce PDV — seule action qui le fait. */
    async onValidate() {
      if (!this.access) return;
      this.working = true;
      try {
        await this.$store.dispatch('guestPinAdmin/validate', this.access.id);
      } finally {
        this.working = false;
      }
    },

    /** Renvoie ce PDV pour correction : réouvre l'écriture. */
    async onRequestCorrection() {
      if (!this.access) return;
      this.working = true;
      try {
        await this.$store.dispatch('guestPinAdmin/requestCorrection', this.access.id);
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
.gpb-zone--validated { background: #f0fdf4; border-style: solid; border-color: #86efac; color: #166534; }
.gpb-zone--revoked { background: #fef2f2; border-style: solid; border-color: #fecaca; color: #b91c1c; }

.gpb-sub { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.gpb-label { font-size: 11.5px; font-weight: 700; }
.gpb-label--seen { color: #15803d; }
.gpb-label--submitted { color: #6d28d9; }
.gpb-label--validated { color: #166534; }
.gpb-label--revoked { color: #b91c1c; }
.gpb-meta { font-size: 10.5px; color: inherit; opacity: 0.8; }

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
.gpb-icon-btn--success:hover { border-color: #15803d; color: #15803d; }
.gpb-icon-btn:disabled { opacity: 0.5; cursor: default; }
</style>
