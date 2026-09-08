<template>
  <v-dialog :model-value="modelValue" max-width="380" @update:model-value="onClose">
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center gap-2">
        <KeyRound :size="18" color="#ff3131" />
        {{ pin ? t('guestPinAdminPinOneShotTitle') : t('guestPinAdminGeneratePin') }}
      </v-card-title>

      <v-card-text>
        <p class="spd-hint">{{ t('guestPinAdminWindowPinHint') }}</p>

        <template v-if="pin">
          <p class="spd-pin">{{ pin }}</p>
          <v-btn variant="tonal" color="#ff3131" size="small" rounded="lg" block @click="copyPin">
            <Check v-if="copied" :size="15" class="mr-1" />
            <Copy v-else :size="15" class="mr-1" />
            {{ copied ? t('guestPinAdminCopied') : t('guestPinAdminCopyPin') }}
          </v-btn>
          <v-alert type="warning" variant="tonal" density="compact" rounded="lg" class="mt-3">
            {{ t('guestPinAdminPinOneShotWarning') }}
          </v-alert>
        </template>

        <template v-else-if="!generating">
          <v-alert type="error" variant="tonal" density="compact" rounded="lg">
            {{ error }}
          </v-alert>
        </template>
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
import { KeyRound, Copy, Check } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

/**
 * Génère LE PIN partagé d'une fenêtre — vaut pour TOUS les PDV de cette fenêtre
 * (décision produit 2026-09-08, revenue sur "un PIN par PDV"). Un seul dialog par
 * fenêtre (pré/post-event), déclenché depuis GuestPinAccessPanel.vue — plus depuis
 * chaque carte PDV (GuestPinBadge.vue ne génère plus rien, juste le statut par PDV).
 */
export default {
  name: 'SetWindowPinDialog',
  components: { KeyRound, Copy, Check },

  props: {
    modelValue: { type: Boolean, default: false },
    windowId: { type: String, required: true },
  },

  emits: ['update:modelValue', 'generated'],

  setup() {
    const { t } = useI18n();
    return { t };
  },

  data() {
    return {
      pin: null,
      generating: false,
      copied: false,
      error: '',
    };
  },

  watch: {
    modelValue(open) {
      if (open) {
        this.pin = null;
        this.copied = false;
        this.error = '';
        this.generate();
      }
    },
  },

  methods: {
    async generate() {
      this.generating = true;
      try {
        const result = await this.$store.dispatch('guestPinAdmin/generateWindowPin', this.windowId);
        this.pin = result.pin;
        this.$emit('generated', result);
      } catch (e) {
        this.error = e?.response?.data?.message || this.t('guestPinAdminGenerateError');
      } finally {
        this.generating = false;
      }
    },

    async copyPin() {
      try {
        await navigator.clipboard.writeText(this.pin);
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 1500);
      } catch {
        /* clipboard indisponible (contexte non sécurisé) : le PIN reste affiché à l'écran */
      }
    },

    onClose(value) {
      this.$emit('update:modelValue', value === true);
    },
  },
};
</script>

<style scoped>
.spd-hint {
  margin: 0 0 12px 0;
  font-size: 0.8125rem;
  color: #6b7280;
}

.spd-pin {
  margin: 0 0 12px 0;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: 4px;
  color: #ff3131;
  text-align: center;
}
</style>
