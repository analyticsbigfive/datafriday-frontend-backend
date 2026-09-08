<template>
  <div class="gpb-zone">
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

    <!-- Statut PAR PDV réduit à une pastille — le détail (horodatage, actions) ne
         s'affiche qu'au clic (v-menu), au lieu d'un bandeau texte toujours déployé
         (retour utilisateur 2026-09-08 : "trop gaspillé... des icônes avec des
         pastilles si nécessaire, pas des infos inutiles"). -->
    <v-menu location="bottom start" :close-on-content-click="false">
      <template #activator="{ props: menuProps }">
        <button
          type="button"
          class="gpb-pastille"
          :class="'gpb-pastille--' + status"
          :title="t(statusLabelKey)"
          v-bind="menuProps"
        >
          <component :is="statusIcon" :size="15" />
          <span v-if="status === 'submitted'" class="gpb-flag" />
        </button>
      </template>

      <v-card rounded="lg" class="gpb-pop">
        <v-card-text>
          <div class="gpb-pop-head">
            <div class="gpb-pop-head-tx">
              <p class="gpb-pop-title">{{ t(statusLabelKey) }}</p>
              <p v-if="popMeta" class="gpb-pop-meta">{{ popMeta }}</p>
            </div>

            <!-- Icône seule + info-bulle native (title) : un libellé complet en
                 toutes lettres ("Send back for correction"…) débordait de son
                 bouton dans un popover volontairement étroit. -->
            <div v-if="status === 'submitted'" class="gpb-pop-actions">
              <button type="button" class="gpb-pop-btn gpb-pop-btn--pri" :title="t('guestPinAdminValidate')" :disabled="working" @click="onValidate">
                <Check :size="15" />
              </button>
              <button type="button" class="gpb-pop-btn" :title="t('guestPinAdminRequestCorrection')" :disabled="working" @click="onRequestCorrection">
                <Undo2 :size="15" />
              </button>
            </div>
            <div v-else-if="status === 'revoked'" class="gpb-pop-actions">
              <button type="button" class="gpb-pop-btn gpb-pop-btn--pri" :title="t('guestPinAdminReactivate')" :disabled="working" @click="onReactivate">
                <RefreshCw :size="15" />
              </button>
            </div>
            <div v-else-if="status === 'seen'" class="gpb-pop-actions">
              <button type="button" class="gpb-pop-btn gpb-pop-btn--danger" :title="t('guestPinAdminRevoke')" :disabled="working" @click="onRevoke">
                <Ban :size="15" />
              </button>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-menu>

    <GuestPinQrDialog v-if="slug" v-model="qrDialogOpen" :slug="slug" :element-name="elementName" />
  </div>
</template>

<script>
import { KeyRound, RefreshCw, Ban, UserCheck, FileCheck, Lock, Check, Undo2, QrCode } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import GuestPinQrDialog from '@/components/guest-pin-manage/dialogs/GuestPinQrDialog.vue';

/**
 * Statut PAR PDV, porté par chaque carte — une pastille (couleur + icône),
 * jamais de PIN généré ici (décision produit 2026-09-08 : UN SEUL PIN partagé
 * par TOUTE la fenêtre, généré depuis GuestPinAccessPanel.vue). La ligne
 * GuestPinAccess est auto-créée au premier login du manager — tant que
 * personne ne s'est connecté pour ce PDV, `access` est null ici (statut
 * "waiting", aucune action possible).
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
    /** 'waiting' | 'seen' | 'submitted' | 'validated' | 'revoked' */
    status() {
      if (!this.access) return 'waiting';
      if (this.access.status === 'revoked') return 'revoked';
      if (this.access.validatedAt) return 'validated';
      if (this.access.submittedAt) return 'submitted';
      return 'seen';
    },
    statusIcon() {
      return {
        waiting: 'KeyRound',
        seen: 'UserCheck',
        submitted: 'FileCheck',
        validated: 'Lock',
        revoked: 'Ban',
      }[this.status];
    },
    statusLabelKey() {
      return {
        waiting: 'guestPinAdminNotSeenYet',
        seen: 'guestPinAdminSeen',
        submitted: 'guestPinAdminStatusSubmitted',
        validated: 'guestPinAdminStatusValidated',
        revoked: 'guestPinAdminStatusRevoked',
      }[this.status];
    },
    popMeta() {
      if (this.status === 'seen' && this.access?.lastLoginAt) {
        return this.formatTime(this.access.lastLoginAt);
      }
      if (this.status === 'submitted' && this.access?.submittedAt) {
        return `${this.t('guestPinAdminSubmittedAt')} ${this.formatTime(this.access.submittedAt)}`;
      }
      return '';
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
  gap: 6px;
  flex-shrink: 0;
}

.gpb-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1.5px solid var(--fb-border, #e5e7eb);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  cursor: pointer;
  flex-shrink: 0;
}
.gpb-icon-btn:hover { border-color: #ff3131; color: #ff3131; }

.gpb-pastille {
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1.5px solid var(--fb-border, #e5e7eb);
  background: #fafbfc;
  color: #9aa1ac;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.gpb-pastille:hover { border-color: #9aa1ac; }
.gpb-pastille--seen { background: #fef3e2; color: #d97706; border-color: transparent; }
.gpb-pastille--submitted { background: #f2ebfd; color: #7c3aed; border-color: transparent; }
.gpb-pastille--validated { background: #e3f6ee; color: #059669; border-color: transparent; }
.gpb-pastille--revoked { background: #eceef1; color: #4b5563; border-color: transparent; }

.gpb-flag {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #7c3aed;
  border: 2px solid #fff;
}

.gpb-pop-head { display: flex; align-items: flex-start; gap: 14px; }
.gpb-pop-head-tx { flex: 1 1 auto; min-width: 0; }
.gpb-pop-title { margin: 0; font-size: 0.8125rem; font-weight: 700; white-space: nowrap; }
.gpb-pop-meta { margin: 2px 0 0; font-size: 0.75rem; color: #6b7280; white-space: nowrap; }
.gpb-pop-actions { display: flex; gap: 6px; flex: 0 0 auto; }
.gpb-pop-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--fb-border, #e5e7eb);
  background: #fff;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.gpb-pop-btn:hover { border-color: #9aa1ac; }
.gpb-pop-btn:disabled { opacity: 0.5; cursor: default; }
.gpb-pop-btn--pri { background: #059669; border-color: #059669; color: #fff; }
.gpb-pop-btn--pri:hover { background: #047857; border-color: #047857; }
.gpb-pop-btn--danger:hover { border-color: #dc2626; color: #dc2626; }
</style>
