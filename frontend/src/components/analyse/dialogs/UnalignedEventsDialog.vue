<template>
  <v-dialog
    :model-value="modelValue"
    max-width="560"
    scrollable
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card rounded="lg" class="pa-4 uae-card" :class="{ 'uae-card--dark': isDark }">
      <v-card-title class="d-flex align-center pa-0 mb-2">
        <v-icon color="#F59E0B" class="mr-2">mdi-clock-alert-outline</v-icon>
        <span class="text-h6">{{ t('anUnalignedDialogTitle') }}</span>
      </v-card-title>

      <div class="mb-3 text-body-2 text-medium-emphasis">
        {{ t('anUnalignedDialogSubtitle') }}
      </div>

      <v-divider class="mb-2" />

      <div class="uae-list">
        <div
          v-for="ev in events"
          :key="ev.id"
          class="uae-row d-flex align-center justify-space-between"
        >
          <div class="d-flex align-center ga-2 min-w-0">
            <v-icon size="16" color="#9CA3AF">mdi-calendar-remove-outline</v-icon>
            <span class="uae-name text-truncate">{{ ev.name }}</span>
          </div>
          <v-btn
            size="small"
            variant="tonal"
            color="#F59E0B"
            class="flex-shrink-0 ml-3"
            @click="$emit('edit-event', ev)"
          >
            <v-icon start size="16">mdi-pencil</v-icon>
            {{ t('anUnalignedDialogAddTime') }}
          </v-btn>
        </div>
      </div>

      <div class="d-flex justify-end mt-4">
        <v-btn variant="text" @click="$emit('update:modelValue', false)">
          {{ t('anUnalignedDialogClose') }}
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'

defineProps({
  modelValue: { type: Boolean, default: false },
  // Events écartés de la moyenne : `[{ id, name }]`.
  events: { type: Array, default: () => [] },
})
defineEmits(['update:modelValue', 'edit-event'])

const { t } = useI18n()

// Dark mode autonome : v-dialog téléporté → classe --dark sur la racine propre
// du contenu (la v-card).
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)
</script>

<style scoped>
.uae-list {
  max-height: 340px;
  overflow-y: auto;
}
.uae-row {
  padding: 8px 4px;
  border-bottom: 1px solid #f1f5f9;
}
.uae-row:last-child {
  border-bottom: 0;
}
.uae-name {
  font-size: var(--fs-md);
  font-weight: 500;
  color: #212121;
}

/* ── Dark mode ── */
.uae-card--dark .uae-row {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}
.uae-card--dark .uae-name {
  color: #f9fafb;
}
</style>
