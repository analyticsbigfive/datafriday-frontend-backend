<template>
  <v-dialog :model-value="modelValue" max-width="440" persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card rounded="xl">
      <v-card-title class="d-flex align-center ga-2 pt-5 px-5">
        <v-icon color="info" size="20">mdi-link-variant</v-icon>
        {{ t('intgMapEvtTitle') }}
      </v-card-title>
      <v-card-text class="px-5 pt-2">
        <p class="text-body-2 text-medium-emphasis mb-4">
          {{ t('intgMapEvtDescBefore') }} <strong>{{ formattedDate }}</strong>
          {{ t('intgMapEvtDescAfter') }}
        </p>
        <v-select
          v-model="selectedEventId"
          :items="events"
          item-title="name"
          item-value="id"
          :label="t('intgMapEvtSelectLabel')"
          variant="outlined"
          density="comfortable"
          :item-props="e => ({ subtitle: formattedItemDate(e.startDate || e.endDate) })"
        />
      </v-card-text>
      <v-card-actions class="px-5 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">{{ t('intgMapEvtCancel') }}</v-btn>
        <v-btn
          color="info"
          variant="tonal"
          :loading="loading"
          :disabled="!selectedEventId"
          @click="$emit('confirm', selectedEventId)"
        >
          {{ t('intgMapEvtConfirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'
import { formatDateMedium } from '@/utils/dateFr'

export default {
  name: 'MapEventToExistingDialog',
  setup() {
    const { t } = useI18n()
    return { t }
  },
  props: {
    modelValue: { type: Boolean, default: false },
    item: { type: Object, default: null },
    formattedDate: { type: String, default: '' },
    events: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'confirm'],
  data() {
    return {
      selectedEventId: null,
    }
  },
  watch: {
    modelValue(val) {
      if (val) this.selectedEventId = null
    },
  },
  methods: {
    formattedItemDate(dateStr) {
      return formatDateMedium(dateStr) || '—'
    },
  },
}
</script>
