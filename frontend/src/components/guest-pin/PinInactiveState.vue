<template>
  <!-- Page d'attente d'un responsable PDV : inventaire arrêté (ou pas encore démarré).
       Retour Bertrand 2026-10-07 : plus jamais la connexion staff, une page qui attend
       la reprise et propose de rescanner le QR code du PDV. La vérification périodique
       est portée par le parent (PinLoginView), qui connaît le slug. -->
  <PinLoginShell :icon="PauseCircle" icon-color="#f59e0b" :title="t('pinLoginInactiveTitle')" :subtitle="subtitle">
    <PinQrScanner v-if="scanning" @scanned="onScanned" @close="scanning = false" />

    <div v-else class="pin-inactive">
      <span v-if="pdvName" class="pin-inactive__pdv">
        <MapPin :size="12" />
        {{ pdvName }}
      </span>

      <p v-if="canCheck" class="pin-inactive__live">
        <span class="pin-inactive__dot" aria-hidden="true" />
        {{ t('pinLoginInactiveAutoCheck') }}
      </p>

      <button type="button" class="pin-inactive__scan" @click="scanning = true">
        <ScanLine :size="18" />
        {{ t('pinScanOpen') }}
      </button>

      <button
        v-if="canCheck"
        type="button"
        class="pin-inactive__check"
        :disabled="checking"
        @click="$emit('check')"
      >
        <RefreshCw :size="16" :class="{ 'pin-inactive__spin': checking }" />
        {{ t('pinLoginInactiveCheckNow') }}
      </button>

      <p class="pin-inactive__note">{{ t('pinLoginInactiveContact') }}</p>
    </div>
  </PinLoginShell>
</template>

<script>
import { PauseCircle, MapPin, ScanLine, RefreshCw } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import PinLoginShell from './PinLoginShell.vue';
import PinQrScanner from './PinQrScanner.vue';

export default {
  name: 'PinInactiveState',

  components: { PinLoginShell, PinQrScanner, MapPin, ScanLine, RefreshCw },

  props: {
    /** Nom du PDV scanné ; null si la page est ouverte sans QR (lien perdu). */
    pdvName: { type: String, default: null },
    /** Vrai si un PDV est connu : la page peut revérifier la reprise toute seule. */
    canCheck: { type: Boolean, default: false },
    checking: { type: Boolean, default: false },
  },

  emits: ['check', 'scanned'],

  setup() {
    const { t } = useI18n();
    return { t, PauseCircle };
  },

  data() {
    return { scanning: false };
  },

  computed: {
    subtitle() {
      return this.canCheck ? this.t('pinLoginInactiveMessage') : this.t('pinLoginInactiveNoPdv');
    },
  },

  methods: {
    onScanned(slug) {
      this.scanning = false;
      this.$emit('scanned', slug);
    },
  },
};
</script>

<style scoped>
.pin-inactive {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
}

.pin-inactive__pdv {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 100px;
  padding: 5px 12px;
  color: #f59e0b;
  font-size: 0.75rem;
  font-weight: 700;
}

.pin-inactive__live {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: #94a3b8;
  font-size: 0.8125rem;
}

.pin-inactive__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.18);
  animation: pin-inactive-pulse 1.6s ease-in-out infinite;
}

@keyframes pin-inactive-pulse {
  50% { box-shadow: 0 0 0 7px rgba(245, 158, 11, 0); }
}

.pin-inactive__scan,
.pin-inactive__check {
  width: 100%;
  height: 52px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 700;
  font-size: 0.9375rem;
  cursor: pointer;
}

.pin-inactive__scan {
  margin-top: 6px;
  background: #ff3131;
  border: 0;
  color: #fff;
}

.pin-inactive__check {
  background: transparent;
  border: 1px solid rgba(51, 65, 85, 0.9);
  color: #e2e8f0;
}

.pin-inactive__check:disabled {
  opacity: 0.6;
  cursor: default;
}

.pin-inactive__spin {
  animation: pin-inactive-spin 0.9s linear infinite;
}

@keyframes pin-inactive-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .pin-inactive__dot,
  .pin-inactive__spin { animation: none; }
}

.pin-inactive__note {
  width: 100%;
  margin: 4px 0 0;
  padding: 14px 16px;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(51, 65, 85, 0.7);
  color: #94a3b8;
  font-size: 0.8125rem;
  line-height: 1.5;
  text-align: left;
}
</style>
