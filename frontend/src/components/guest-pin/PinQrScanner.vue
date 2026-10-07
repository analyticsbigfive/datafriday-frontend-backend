<template>
  <!-- Scanner du QR code d'un PDV, caméra arrière dans la page (page d'attente invité).
       Émet `scanned` avec le slug du lien de connexion lu, `close` à l'annulation. -->
  <div class="pin-scanner" role="dialog" :aria-label="t('pinScanTitle')">
    <p class="pin-scanner__title">{{ t('pinScanTitle') }}</p>

    <div class="pin-scanner__view">
      <video ref="video" class="pin-scanner__video" playsinline muted />
      <div v-if="!error" class="pin-scanner__frame" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <div v-if="error" class="pin-scanner__error">
        <CameraOff :size="28" color="#94a3b8" />
        <span>{{ error }}</span>
      </div>
    </div>

    <p class="pin-scanner__hint" :class="{ 'pin-scanner__hint--warn': unknownCode }">
      {{ unknownCode ? t('pinScanUnknownCode') : t('pinScanHint') }}
    </p>

    <button type="button" class="pin-scanner__cancel" @click="$emit('close')">
      {{ t('cancel') }}
    </button>
  </div>
</template>

<script>
import { CameraOff } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { slugFromGuestPinUrl } from '@/utils/guestPinLanding';

export default {
  name: 'PinQrScanner',

  components: { CameraOff },

  emits: ['scanned', 'close'],

  setup() {
    const { t } = useI18n();
    return { t };
  },

  data() {
    return {
      error: '',
      unknownCode: false,
    };
  },

  async mounted() {
    try {
      // Chargé à la demande : la librairie (et son worker) ne pèse que sur cette page.
      const { default: QrScanner } = await import('qr-scanner');
      if (this.unmounted) return;
      this.scanner = new QrScanner(this.$refs.video, (result) => this.onDecode(result?.data), {
        preferredCamera: 'environment',
        maxScansPerSecond: 5,
        returnDetailedScanResult: true,
      });
      await this.scanner.start();
    } catch (e) {
      // Refus d'accès, pas de caméra, ou page hors HTTPS.
      console.warn('[pin-scanner] caméra indisponible:', e?.message || e);
      this.error = this.t('pinScanCameraError');
    }
  },

  beforeUnmount() {
    this.unmounted = true;
    this.scanner?.destroy();
    this.scanner = null;
  },

  methods: {
    onDecode(text) {
      const slug = slugFromGuestPinUrl(text);
      if (!slug) {
        this.unknownCode = true;
        return;
      }
      this.scanner?.stop();
      this.$emit('scanned', slug);
    },
  },
};
</script>

<style scoped>
.pin-scanner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
}

.pin-scanner__title {
  margin: 0;
  color: #f1f5f9;
  font-size: 1rem;
  font-weight: 700;
}

.pin-scanner__view {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 16px;
  overflow: hidden;
  background: #0b1220;
  border: 1px solid rgba(51, 65, 85, 0.7);
}

.pin-scanner__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pin-scanner__frame {
  position: absolute;
  inset: 18%;
  pointer-events: none;
}

.pin-scanner__frame i {
  position: absolute;
  width: 28px;
  height: 28px;
  border: 3px solid #fff;
}
.pin-scanner__frame i:nth-child(1) { top: 0; left: 0; border-right: 0; border-bottom: 0; border-radius: 8px 0 0 0; }
.pin-scanner__frame i:nth-child(2) { top: 0; right: 0; border-left: 0; border-bottom: 0; border-radius: 0 8px 0 0; }
.pin-scanner__frame i:nth-child(3) { bottom: 0; left: 0; border-right: 0; border-top: 0; border-radius: 0 0 0 8px; }
.pin-scanner__frame i:nth-child(4) { bottom: 0; right: 0; border-left: 0; border-top: 0; border-radius: 0 0 8px 0; }

.pin-scanner__error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  color: #94a3b8;
  font-size: 0.8125rem;
  text-align: center;
}

.pin-scanner__hint {
  margin: 0;
  color: #94a3b8;
  font-size: 0.8125rem;
  text-align: center;
}

.pin-scanner__hint--warn {
  color: #ff6e4a;
  font-weight: 600;
}

.pin-scanner__cancel {
  width: 100%;
  height: 48px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid rgba(51, 65, 85, 0.9);
  color: #e2e8f0;
  font-weight: 700;
  font-size: 0.9375rem;
  cursor: pointer;
}
</style>
