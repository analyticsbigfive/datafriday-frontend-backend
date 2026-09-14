<template>
  <div class="gpp-panel">
    <div class="gpp-head">
      <div class="gpp-title-row">
        <div>
          <p class="gpp-kicker">{{ t('guestPinAdminPanelTitle') }}</p>
          <p class="gpp-sub">{{ phaseLabel }}</p>
        </div>
      </div>

      <!-- UN SEUL bouton (critère d'acceptation 2026-09-14) : "Générer le PIN"
           ouvre la fenêtre pré/post-event si elle ne l'est pas encore, puis génère
           LE PIN partagé par tous les PDV (décision produit 2026-09-08). Une fois
           le PIN posé, le même bouton devient "Régénérer le PIN". -->
      <div class="gpp-pin-row">
        <span class="gpp-pin-status">
          {{ !isWindowOpen ? phaseNotStartedLabel : hasPin ? t('guestPinAdminWindowPinSet') : t('guestPinAdminWindowPinNotSet') }}
        </span>
        <v-btn
          size="small"
          :variant="hasPin ? 'outlined' : 'flat'"
          color="#ff3131"
          rounded="lg"
          :loading="opening"
          @click="onGeneratePin"
        >
          <KeyRound :size="14" class="mr-1" />
          {{ hasPin ? t('guestPinAdminResetPin') : t('guestPinAdminGeneratePin') }}
        </v-btn>
      </div>

      <template v-if="isWindowOpen">
        <!-- PIN en cours, retrouvable après fermeture du popup (critère
             d'acceptation 2026-09-14). null = fenêtre d'avant le chiffrement
             réversible : il faut le régénérer une fois. -->
        <div v-if="hasPin" class="gpp-pin-current">
          <template v-if="currentPin">
            <span class="gpp-pin-current__label">{{ t('guestPinAdminCurrentPin') }}</span>
            <span class="gpp-pin-current__value">{{ currentPin }}</span>
            <button type="button" class="gpp-pin-copy" :title="t('guestPinAdminCopyPin')" @click="copyPin">
              <Check v-if="copied" :size="14" />
              <Copy v-else :size="14" />
            </button>
          </template>
          <span v-else class="gpp-pin-current__missing">{{ t('guestPinAdminCurrentPinUnavailable') }}</span>
        </div>

        <div class="gpp-stats">
          <div>
            <span>{{ t('guestPinAdminStatsActive') }}</span>
            <strong>{{ activeCount }} / {{ totalCount }}</strong>
          </div>
          <div>
            <span>{{ t('guestPinAdminStatsSubmitted') }}</span>
            <strong>{{ submittedCount }}</strong>
          </div>
          <div>
            <span>{{ t('guestPinAdminStatusValidated') }}</span>
            <strong>{{ validatedCount }}</strong>
          </div>
          <div>
            <span>{{ t('guestPinAdminStatsRevoked') }}</span>
            <strong>{{ revokedCount }}</strong>
          </div>
        </div>
      </template>
    </div>
    <div v-if="isWindowOpen" class="gpp-note">
      <Info :size="16" />
      {{ t('guestPinAdminPanelHint') }}
    </div>

    <SetWindowPinDialog v-if="window" v-model="pinDialogOpen" :window-id="window.id" />
  </div>
</template>

<script>
import { Check, Copy, Info, KeyRound } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import SetWindowPinDialog from '@/components/guest-pin-manage/dialogs/SetWindowPinDialog.vue';

/**
 * Panneau "Accès PIN invité" de la colonne de droite — remplace la page
 * /spaces/:spaceId/guest-pin-access (orpheline, jamais reliée à aucun menu).
 * Se charge lui-même (fetchStatusBoard) : GuestPinBadge, sur chaque carte, lit
 * ensuite le même store réactivement, sans prop-drilling depuis la vue hôte.
 *
 * SEUL point d'entrée pour ouvrir la fenêtre et générer/régénérer LE PIN partagé
 * (décision produit 2026-09-08 : un PIN commun à tous les PDV, plus un par PDV) —
 * GuestPinBadge (par carte) ne fait plus que refléter un statut par PDV.
 */
export default {
  name: 'GuestPinAccessPanel',
  components: { Check, Copy, Info, KeyRound, SetWindowPinDialog },

  props: {
    spaceId: { type: String, default: null },
    eventId: { type: String, default: null },
    phase: { type: String, required: true }, // 'pre-event' | 'post-event'
  },

  setup() {
    const { t } = useI18n();
    return { t };
  },

  data() {
    return {
      opening: false,
      pinDialogOpen: false,
      copied: false,
    };
  },

  computed: {
    phaseLabel() {
      return this.phase === 'post-event' ? this.t('pinLoginPhasePost') : this.t('pinLoginPhasePre');
    },
    phaseNotStartedLabel() {
      return this.phase === 'post-event' ? this.t('guestPinAdminNotStartedPost') : this.t('guestPinAdminNotStartedPre');
    },
    window() {
      return this.$store.getters['guestPinAdmin/windowByPhase'](this.phase);
    },
    isWindowOpen() {
      return this.window?.status === 'open';
    },
    hasPin() {
      return !!this.window?.hasPin;
    },
    currentPin() {
      return this.window?.pin ?? null;
    },
    accesses() {
      return this.window?.accesses ?? [];
    },
    totalCount() {
      return this.accesses.length;
    },
    activeCount() {
      return this.accesses.filter((a) => a.status === 'active' && !a.submittedAt && !a.validatedAt).length;
    },
    // "Soumis" = en attente de relecture directeur (submittedAt posé, PAS ENCORE
    // validé) — un accès validé ne compte plus ici, cf. validatedCount.
    submittedCount() {
      return this.accesses.filter((a) => !!a.submittedAt && !a.validatedAt).length;
    },
    validatedCount() {
      return this.accesses.filter((a) => !!a.validatedAt).length;
    },
    revokedCount() {
      return this.accesses.filter((a) => a.status === 'revoked').length;
    },
  },

  watch: {
    spaceId: 'maybeFetch',
    eventId: 'maybeFetch',
  },

  created() {
    this.maybeFetch();
  },

  methods: {
    maybeFetch() {
      if (this.spaceId && this.eventId) {
        this.$store.dispatch('guestPinAdmin/fetchStatusBoard', { spaceId: this.spaceId, eventId: this.eventId });
      }
    },

    async copyPin() {
      try {
        await navigator.clipboard.writeText(this.currentPin);
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 1500);
      } catch {
        /* clipboard indisponible (contexte non sécurisé) : le PIN reste affiché */
      }
    },

    /** Ouvre la fenêtre si nécessaire, puis lance la génération du PIN. Le
     *  dialog est monté (v-if="window") seulement une fois la fenêtre connue du
     *  store : on attend le prochain tick avant de basculer modelValue, sinon
     *  son watcher (non immediate) ne verrait pas l'ouverture. */
    async onGeneratePin() {
      if (!this.isWindowOpen) {
        this.opening = true;
        try {
          await this.$store.dispatch('guestPinAdmin/openWindow', {
            spaceId: this.spaceId,
            eventId: this.eventId,
            phase: this.phase,
          });
          await this.$nextTick();
        } finally {
          this.opening = false;
        }
        if (!this.isWindowOpen) return;
      }
      this.pinDialogOpen = true;
    },
  },
};
</script>

<style scoped>
.gpp-panel {
  background: #fff;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 12px;
  overflow: hidden;
  /* Ce panneau est un enfant flex de .si-aggregate-col (colonne à hauteur
     contrainte, cf. SpaceInventoryView.vue) où seul .si-aggregate est censé
     grandir/rétrécir (flex: 1 1 auto + son propre scroll interne). Sans
     flex-shrink: 0 ici, le flex par défaut (shrink: 1) compresse ce panneau en
     dessous de sa hauteur naturelle dès que la colonne manque de place, et
     overflow: hidden coupait alors le contenu au lieu de l'afficher. */
  flex-shrink: 0;
}
.gpp-head { padding: 14px; }
.gpp-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.gpp-kicker {
  margin: 0;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.gpp-sub { margin: 2px 0 0; color: #6b7280; font-size: 11px; }

.gpp-pin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 10px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 9px;
  background: var(--fb-subtle, #fafafa);
}
.gpp-pin-status { font-size: 11.5px; font-weight: 600; color: #374151; }

.gpp-pin-current {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 6px 10px;
  border: 1px dashed #fca5a5;
  border-radius: 9px;
  background: #fff5f5;
}
.gpp-pin-current__label { font-size: 11px; font-weight: 600; color: #6b7280; }
.gpp-pin-current__value {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #ff3131;
  font-variant-numeric: tabular-nums;
}
.gpp-pin-current__missing { font-size: 11px; color: #92400e; }
.gpp-pin-copy {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  padding: 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}
.gpp-pin-copy:hover { background: #fee2e2; color: #b91c1c; }

.gpp-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-top: 12px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 9px;
  overflow: hidden;
  background: var(--fb-border, #e5e7eb);
}
.gpp-stats > div { padding: 8px 7px; background: var(--fb-subtle, #fafafa); min-width: 0; }
.gpp-stats span { display: block; color: #6b7280; font-size: 9px; font-weight: 600; }
.gpp-stats strong { display: block; margin-top: 2px; color: #111827; font-size: 14px; font-variant-numeric: tabular-nums; }

.gpp-note {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0 14px 14px;
  padding: 10px 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  color: #92400e;
  font-size: 11.5px;
}
.gpp-note svg { flex-shrink: 0; margin-top: 1px; color: #b45309; }
</style>
