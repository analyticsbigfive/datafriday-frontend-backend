<template>
  <div class="gpp-panel">
    <div class="gpp-head">
      <div class="gpp-title-row">
        <div>
          <p class="gpp-kicker">{{ t('guestPinAdminPanelTitle') }}</p>
          <p class="gpp-sub">{{ phaseLabel }}</p>
        </div>
      </div>

      <!-- Fenêtre pas encore ouverte : rien d'autre n'a de sens avant ça. -->
      <v-btn
        v-if="!isWindowOpen"
        size="small"
        color="#ff3131"
        variant="flat"
        rounded="lg"
        block
        class="mt-3"
        :loading="opening"
        @click="onStartWindow"
      >
        <PlayCircle :size="14" class="mr-1" />
        {{ phase === 'post-event' ? t('guestPinAdminStartPost') : t('guestPinAdminStartPre') }}
      </v-btn>

      <!-- Fenêtre ouverte : UN SEUL PIN partagé par tous les PDV (décision produit
           2026-09-08) — statut + génération/régénération, ici et une seule fois,
           plus par carte (cf. GuestPinBadge.vue, qui n'affiche plus qu'un statut). -->
      <template v-else>
        <div class="gpp-pin-row">
          <span class="gpp-pin-status">
            {{ hasPin ? t('guestPinAdminWindowPinSet') : t('guestPinAdminWindowPinNotSet') }}
          </span>
          <v-btn size="small" variant="outlined" color="#ff3131" rounded="lg" @click="pinDialogOpen = true">
            <KeyRound :size="14" class="mr-1" />
            {{ hasPin ? t('guestPinAdminResetPin') : t('guestPinAdminGeneratePin') }}
          </v-btn>
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
import { Info, KeyRound, PlayCircle } from 'lucide-vue-next';
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
  components: { Info, KeyRound, PlayCircle, SetWindowPinDialog },

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
    };
  },

  computed: {
    phaseLabel() {
      return this.phase === 'post-event' ? this.t('pinLoginPhasePost') : this.t('pinLoginPhasePre');
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

    async onStartWindow() {
      this.opening = true;
      try {
        await this.$store.dispatch('guestPinAdmin/openWindow', {
          spaceId: this.spaceId,
          eventId: this.eventId,
          phase: this.phase,
        });
      } finally {
        this.opening = false;
      }
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
