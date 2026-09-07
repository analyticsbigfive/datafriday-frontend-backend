<template>
  <div class="gpa-root">
    <div class="gpa-header">
      <div class="d-flex align-center gap-3">
        <div class="gpa-header__icon">
          <KeyRound :size="22" color="#fff" />
        </div>
        <div>
          <p class="gpa-header__title">{{ t('guestPinAdminTitle') }}</p>
        </div>
      </div>

      <v-select
        v-model="selectedEventId"
        :items="events"
        item-title="name"
        item-value="id"
        density="compact"
        variant="outlined"
        hide-details
        style="max-width: 320px"
        @update:model-value="onEventChange"
      />
    </div>

    <div v-if="selectedEventId" class="gpa-phases">
      <div v-for="phase in phases" :key="phase.key" class="gpa-phase-card">
        <div class="gpa-phase-card__head">
          <p class="gpa-phase-card__title">{{ phase.label }}</p>
          <v-chip v-if="windowFor(phase.key)" size="small" :color="windowFor(phase.key).status === 'open' ? 'success' : 'default'" variant="tonal">
            {{ windowFor(phase.key).status === 'open' ? t('guestPinAdminStatusActive') : t('guestPinAdminStatusRevoked') }}
          </v-chip>
        </div>

        <v-btn
          v-if="!windowFor(phase.key) || windowFor(phase.key).status !== 'open'"
          color="#ff3131"
          rounded="lg"
          elevation="0"
          size="small"
          @click="startWindow(phase.key)"
        >
          {{ phase.startLabel }}
        </v-btn>

        <template v-else>
          <table class="gpa-table">
            <tbody>
              <tr v-for="access in windowFor(phase.key).accesses" :key="access.id">
                <td>{{ access.elementName || access.elementId }}</td>
                <td>
                  <v-chip size="x-small" :color="access.bound ? 'success' : 'default'" variant="tonal">
                    {{ access.bound ? t('guestPinAdminBound') : t('guestPinAdminNotBound') }}
                  </v-chip>
                </td>
                <td class="gpa-table__actions">
                  <v-btn icon size="x-small" variant="text" :title="t('guestPinAdminResetPin')" @click="regeneratePin(access.id)">
                    <RefreshCw :size="15" />
                  </v-btn>
                  <v-btn icon size="x-small" variant="text" :title="t('guestPinAdminUnbindDevice')" @click="unbind(access.id)">
                    <Unlink :size="15" />
                  </v-btn>
                  <v-btn icon size="x-small" variant="text" :title="t('guestPinAdminRevoke')" @click="revoke(access.id)">
                    <Ban :size="15" />
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </table>

          <v-btn variant="tonal" rounded="lg" size="small" @click="openSetPin(phase.key)">
            {{ t('guestPinAdminGeneratePin') }}
          </v-btn>
          <v-btn color="#ff3131" rounded="lg" elevation="0" size="small" @click="openCloseConfirm(phase.key)">
            {{ t('guestPinAdminCloseWindow') }}
          </v-btn>
        </template>
      </div>
    </div>

    <SetPinDialog
      v-model="setPinDialogOpen"
      :window-id="activeWindowId"
      :elements="unassignedElements"
    />
    <CloseWindowConfirmDialog v-model="closeDialogOpen" :window-id="activeWindowId" />
  </div>
</template>

<script>
import { KeyRound, RefreshCw, Unlink, Ban } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import SetPinDialog from '../dialogs/SetPinDialog.vue';
import CloseWindowConfirmDialog from '../dialogs/CloseWindowConfirmDialog.vue';

export default {
  name: 'InventoryWindowStatusView',
  components: { KeyRound, RefreshCw, Unlink, Ban, SetPinDialog, CloseWindowConfirmDialog },

  setup() {
    const { t } = useI18n();
    return { t };
  },

  data() {
    return {
      selectedEventId: null,
      setPinDialogOpen: false,
      closeDialogOpen: false,
      activeWindowId: null,
      shops: [],
    };
  },

  computed: {
    phases() {
      return [
        { key: 'pre-event', label: 'Pré-événement', startLabel: this.t('guestPinAdminStartPre') },
        { key: 'post-event', label: 'Post-événement', startLabel: this.t('guestPinAdminStartPost') },
      ];
    },
    spaceId() {
      return this.$route.params.spaceId;
    },
    events() {
      return (this.$store.getters['events/events'] || []).filter((e) => e.spaceId === this.spaceId);
    },
    windows() {
      return this.$store.getters['guestPinAdmin/windows'];
    },
    unassignedElements() {
      const win = this.windows.find((w) => w.id === this.activeWindowId);
      const assignedIds = new Set((win?.accesses || []).map((a) => a.elementId));
      return this.shops.filter((s) => !assignedIds.has(s.id));
    },
  },

  async mounted() {
    await this.$store.dispatch('events/fetchEvents');
    this.shops = await this.$store.dispatch('spaceShops/fetchForSpace', { spaceId: this.spaceId });
  },

  methods: {
    windowFor(phase) {
      return this.windows.find((w) => w.phase === phase) ?? null;
    },

    async onEventChange() {
      if (!this.selectedEventId) return;
      await this.$store.dispatch('guestPinAdmin/fetchStatusBoard', {
        spaceId: this.spaceId,
        eventId: this.selectedEventId,
      });
    },

    async startWindow(phase) {
      await this.$store.dispatch('guestPinAdmin/openWindow', {
        spaceId: this.spaceId,
        eventId: this.selectedEventId,
        phase,
      });
    },

    openSetPin(phase) {
      this.activeWindowId = this.windowFor(phase)?.id ?? null;
      this.setPinDialogOpen = true;
    },

    openCloseConfirm(phase) {
      this.activeWindowId = this.windowFor(phase)?.id ?? null;
      this.closeDialogOpen = true;
    },

    regeneratePin(accessId) {
      this.$store.dispatch('guestPinAdmin/regeneratePin', accessId);
    },

    unbind(accessId) {
      this.$store.dispatch('guestPinAdmin/unbindAccessDevice', accessId);
    },

    revoke(accessId) {
      this.$store.dispatch('guestPinAdmin/revoke', accessId);
    },
  },
};
</script>

<style scoped>
.gpa-root {
  padding: 24px;
}

.gpa-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.gpa-header__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #ff3131;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gpa-header__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.gpa-phases {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
}

.gpa-phase-card {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gpa-phase-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gpa-phase-card__title {
  margin: 0;
  font-weight: 600;
}

.gpa-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.gpa-table td {
  padding: 6px 4px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.gpa-table__actions {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
}
</style>
