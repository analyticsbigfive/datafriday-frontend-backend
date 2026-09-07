<template>
  <v-dialog :model-value="modelValue" max-width="440" @update:model-value="onClose">
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center gap-2">
        <AlertTriangle :size="18" color="#ff3131" />
        {{ t('guestPinAdminCloseWindowConfirmTitle') }}
      </v-card-title>
      <v-card-text>{{ t('guestPinAdminCloseWindowConfirmMessage') }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onClose(false)">{{ t('cancel') }}</v-btn>
        <v-btn color="#ff3131" rounded="lg" elevation="0" :loading="closing" @click="confirm">
          {{ t('guestPinAdminCloseWindow') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { AlertTriangle } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'CloseWindowConfirmDialog',
  components: { AlertTriangle },

  props: {
    modelValue: { type: Boolean, default: false },
    windowId: { type: String, default: null },
  },

  emits: ['update:modelValue', 'closed'],

  setup() {
    const { t } = useI18n();
    return { t };
  },

  data() {
    return { closing: false };
  },

  methods: {
    async confirm() {
      this.closing = true;
      try {
        const result = await this.$store.dispatch('guestPinAdmin/close', this.windowId);
        this.$emit('closed', result);
        this.onClose(false);
      } finally {
        this.closing = false;
      }
    },

    onClose(value) {
      this.$emit('update:modelValue', value === true);
    },
  },
};
</script>
