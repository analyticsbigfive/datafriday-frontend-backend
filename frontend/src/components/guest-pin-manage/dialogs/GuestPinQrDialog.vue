<template>
  <v-dialog :model-value="modelValue" max-width="360" @update:model-value="onClose">
    <v-card rounded="lg" class="gqd-card">
      <v-card-title class="d-flex align-center gap-2">
        <QrCode :size="18" color="#ff3131" />
        {{ t('guestPinQrTitle') }}
      </v-card-title>

      <v-card-text>
        <p class="gqd-element">{{ elementName }}</p>

        <div class="gqd-canvas-wrap">
          <canvas ref="canvasEl" class="gqd-canvas" width="240" height="240" />
        </div>

        <p class="gqd-link">{{ loginUrl }}</p>

        <v-btn variant="tonal" color="#ff3131" size="small" rounded="lg" block @click="copyLink">
          <Check v-if="copied" :size="15" class="mr-1" />
          <Copy v-else :size="15" class="mr-1" />
          {{ copied ? t('guestPinAdminCopied') : t('guestPinQrCopyLink') }}
        </v-btn>

        <p class="gqd-hint">{{ t('guestPinQrHint') }}</p>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn color="#ff3131" rounded="lg" elevation="0" @click="onClose(false)">
          {{ t('close') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import QRCode from 'qrcode';
import { QrCode, Copy, Check } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import datafridayMark from '@/assets/datafriday.png';

/**
 * QR code du lien de connexion invité (/login/pin/:slug) pour UN PDV — logo
 * DataFriday incrusté au centre. Génération et rendu 100% client (lib `qrcode`,
 * canvas), rien à charger côté serveur. `errorCorrectionLevel: 'H'` (~30% de
 * redondance) : seule marge qui autorise un logo au centre sans casser le scan
 * (un centre couvert à un niveau de correction inférieur rendrait le code illisible).
 */
export default {
  name: 'GuestPinQrDialog',
  components: { QrCode, Copy, Check },

  props: {
    modelValue: { type: Boolean, default: false },
    slug: { type: String, default: null },
    elementName: { type: String, default: '' },
  },

  emits: ['update:modelValue'],

  setup() {
    const { t } = useI18n();
    return { t };
  },

  data() {
    return {
      copied: false,
    };
  },

  computed: {
    loginUrl() {
      if (!this.slug) return '';
      return `${window.location.origin}/login/pin/${this.slug}`;
    },
  },

  watch: {
    modelValue(open) {
      if (open) {
        this.copied = false;
        this.$nextTick(() => this.render());
      }
    },
  },

  methods: {
    async render() {
      if (!this.loginUrl || !this.$refs.canvasEl) return;
      const canvas = this.$refs.canvasEl;
      await QRCode.toCanvas(canvas, this.loginUrl, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 240,
        color: { dark: '#111827', light: '#ffffff' },
      });

      const ctx = canvas.getContext('2d');
      const size = canvas.width;
      // Fond blanc arrondi derrière le logo — sans lui, les modules QR sombres
      // juste sous le logo réduiraient le contraste du logo et pourraient gêner
      // des scanners bas de gamme.
      const badge = size * 0.24;
      const cx = size / 2;
      const cy = size / 2;
      const radius = badge * 0.22;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(cx - badge / 2, cy - badge / 2, badge, badge, radius);
      ctx.fill();

      const logo = new Image();
      logo.onload = () => {
        const logoSize = badge * 0.74;
        const ratio = logo.width / logo.height;
        const w = ratio >= 1 ? logoSize : logoSize * ratio;
        const h = ratio >= 1 ? logoSize / ratio : logoSize;
        ctx.drawImage(logo, cx - w / 2, cy - h / 2, w, h);
      };
      logo.src = datafridayMark;
    },

    async copyLink() {
      try {
        await navigator.clipboard.writeText(this.loginUrl);
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 1500);
      } catch {
        /* clipboard indisponible (contexte non sécurisé) : le lien reste affiché à l'écran */
      }
    },

    onClose(value) {
      this.$emit('update:modelValue', value === true);
    },
  },
};
</script>

<style scoped>
.gqd-element {
  margin: 0 0 12px 0;
  font-size: 0.875rem;
  font-weight: 600;
  text-align: center;
}

.gqd-canvas-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
  padding: 12px;
  background: #fff;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 14px;
}

.gqd-canvas {
  width: 200px;
  height: 200px;
  display: block;
}

.gqd-link {
  margin: 0 0 12px 0;
  font-size: 0.6875rem;
  color: #6b7280;
  text-align: center;
  word-break: break-all;
}

.gqd-hint {
  margin: 10px 0 0 0;
  font-size: 0.6875rem;
  color: #9aa1ac;
  text-align: center;
}
</style>
