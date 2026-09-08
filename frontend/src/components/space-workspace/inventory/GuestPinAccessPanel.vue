<template>
  <div class="gpp-panel">
    <div class="gpp-head">
      <div class="gpp-title-row">
        <div>
          <p class="gpp-kicker">{{ t('guestPinAdminPanelTitle') }}</p>
          <p class="gpp-sub">{{ phaseLabel }}</p>
        </div>
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
          <span>{{ t('guestPinAdminStatsRevoked') }}</span>
          <strong>{{ revokedCount }}</strong>
        </div>
      </div>
    </div>
    <div class="gpp-note">
      <Info :size="16" />
      {{ t('guestPinAdminPanelHint') }}
    </div>
  </div>
</template>

<script>
import { Info } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

/**
 * Panneau "Accès PIN invité" de la colonne de droite — remplace la page
 * /spaces/:spaceId/guest-pin-access (orpheline, jamais reliée à aucun menu).
 * Se charge lui-même (fetchStatusBoard) : GuestPinBadge, sur chaque carte, lit
 * ensuite le même store réactivement, sans prop-drilling depuis la vue hôte.
 */
export default {
  name: 'GuestPinAccessPanel',
  components: { Info },

  props: {
    spaceId: { type: String, default: null },
    eventId: { type: String, default: null },
    phase: { type: String, required: true }, // 'pre-event' | 'post-event'
  },

  setup() {
    const { t } = useI18n();
    return { t };
  },

  computed: {
    phaseLabel() {
      return this.phase === 'post-event' ? this.t('pinLoginPhasePost') : this.t('pinLoginPhasePre');
    },
    window() {
      return this.$store.getters['guestPinAdmin/windowByPhase'](this.phase);
    },
    accesses() {
      return this.window?.accesses ?? [];
    },
    totalCount() {
      return this.accesses.length;
    },
    activeCount() {
      return this.accesses.filter((a) => a.status === 'active' && !a.submittedAt).length;
    },
    submittedCount() {
      return this.accesses.filter((a) => !!a.submittedAt).length;
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
  },
};
</script>

<style scoped>
.gpp-panel {
  background: #fff;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 12px;
  overflow: hidden;
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

.gpp-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
