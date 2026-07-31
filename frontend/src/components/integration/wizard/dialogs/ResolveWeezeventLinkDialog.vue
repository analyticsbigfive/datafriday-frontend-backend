<template>
  <v-dialog :model-value="modelValue" max-width="560" persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card rounded="xl">
      <v-card-title class="d-flex align-center ga-2 pt-5 px-5">
        <v-icon color="warning" size="20">mdi-link-variant-plus</v-icon>
        {{ t('intgResolveLinkDialogTitle') }}
      </v-card-title>
      <v-card-text class="px-5 pt-2">
        <p class="text-body-2 text-medium-emphasis mb-4">{{ t('intgResolveLinkDialogDesc') }}</p>
        <div v-for="match in matches" :key="match.eventId" class="rwl-row mb-4">
          <div class="rwl-row__info">
            <strong>{{ match.eventName }}</strong>
            <span class="text-caption text-medium-emphasis">{{ formattedItemDate(match.eventDate) }}</span>
          </div>
          <v-select
            v-model="selections[match.eventId]"
            :items="match.candidates || []"
            item-title="name"
            item-value="id"
            :label="t('intgResolveLinkSelectLabel')"
            variant="outlined"
            density="compact"
            hide-details
            class="mt-2"
            :item-props="c => ({ subtitle: formattedItemDate(c.startDate) })"
          />
          <v-btn
            color="warning"
            variant="tonal"
            size="small"
            class="mt-2"
            :loading="resolvingId === match.eventId"
            :disabled="!selections[match.eventId]"
            @click="$emit('resolve', { eventId: match.eventId, weezeventEventId: selections[match.eventId] })"
          >
            {{ t('intgResolveLinkConfirm') }}
          </v-btn>
        </div>
      </v-card-text>
      <v-card-actions class="px-5 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">{{ t('intgResolveLinkClose') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'
import { formatDateMedium } from '@/utils/dateFr'

export default {
  name: 'ResolveWeezeventLinkDialog',
  setup() {
    const { t } = useI18n()
    return { t }
  },
  props: {
    modelValue: { type: Boolean, default: false },
    matches: { type: Array, default: () => [] },
    resolvingId: { type: String, default: null },
  },
  emits: ['update:modelValue', 'resolve'],
  data() {
    return {
      selections: {},
    }
  },
  watch: {
    // Sans ce reset, une sélection faite lors d'une ouverture précédente du dialogue (ou pour un
    // eventId différent réutilisé entre-temps) restait affichée comme pré-sélectionnée à la
    // réouverture, alors qu'aucune correspondance automatique n'existe réellement (BUG-259-02).
    modelValue(isOpen) {
      if (isOpen) this.selections = {}
    },
  },
  methods: {
    formattedItemDate(dateStr) {
      return formatDateMedium(dateStr) || '—'
    },
  },
}
</script>

<style scoped>
.rwl-row {
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}
.rwl-row__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
