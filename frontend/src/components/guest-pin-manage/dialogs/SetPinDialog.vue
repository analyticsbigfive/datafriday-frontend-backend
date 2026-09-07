<template>
  <v-dialog :model-value="modelValue" max-width="440" @update:model-value="onClose">
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center gap-2">
        <KeyRound :size="18" color="#ff3131" />
        {{ pin ? t('guestPinAdminPinOneShotTitle') : t('guestPinAdminGeneratePin') }}
      </v-card-title>

      <v-card-text>
        <template v-if="!pin">
          <v-select
            v-model="selectedElementId"
            :items="elements"
            item-title="name"
            item-value="id"
            :label="t('guestPinAdminGeneratePin')"
            variant="outlined"
            density="comfortable"
            hide-details
          />
        </template>

        <template v-else>
          <p class="spd-element">{{ elementName }}</p>
          <p class="spd-pin">{{ pin }}</p>
          <v-alert type="warning" variant="tonal" density="compact" rounded="lg">
            {{ t('guestPinAdminPinOneShotWarning') }}
          </v-alert>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn v-if="!pin" variant="text" @click="onClose(false)">{{ t('cancel') }}</v-btn>
        <v-btn
          v-if="!pin"
          color="#ff3131"
          rounded="lg"
          elevation="0"
          :disabled="!selectedElementId"
          :loading="generating"
          @click="generate"
        >
          {{ t('guestPinAdminGeneratePin') }}
        </v-btn>
        <v-btn v-else color="#ff3131" rounded="lg" elevation="0" @click="onClose(false)">
          {{ t('cancel') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { KeyRound } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'SetPinDialog',
  components: { KeyRound },

  props: {
    modelValue: { type: Boolean, default: false },
    windowId: { type: String, default: null },
    elements: { type: Array, default: () => [] },
  },

  emits: ['update:modelValue', 'generated'],

  setup() {
    const { t } = useI18n();
    return { t };
  },

  data() {
    return {
      selectedElementId: null,
      pin: null,
      elementName: '',
      generating: false,
    };
  },

  watch: {
    modelValue(open) {
      if (open) {
        this.selectedElementId = null;
        this.pin = null;
      }
    },
  },

  methods: {
    async generate() {
      this.generating = true;
      try {
        const result = await this.$store.dispatch('guestPinAdmin/generatePin', {
          windowId: this.windowId,
          elementId: this.selectedElementId,
        });
        this.pin = result.pin;
        this.elementName = this.elements.find((e) => e.id === this.selectedElementId)?.name ?? '';
        this.$emit('generated', result);
      } finally {
        this.generating = false;
      }
    },

    onClose(value) {
      this.$emit('update:modelValue', value === true);
    },
  },
};
</script>

<style scoped>
.spd-element {
  margin: 0 0 4px 0;
  font-size: 0.875rem;
  font-weight: 600;
}

.spd-pin {
  margin: 0 0 12px 0;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: 4px;
  color: #ff3131;
}
</style>
