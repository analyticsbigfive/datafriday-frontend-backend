<template>
  <v-dialog :model-value="modelValue" max-width="560" persistent @update:model-value="$emit('update:modelValue', $event)">
    <div class="rwl" :class="{ 'rwl--dark': isDark }">
      <!-- Header charte -->
      <div class="rwl__header">
        <div class="rwl__icon"><v-icon size="20" color="white">mdi-link-variant-plus</v-icon></div>
        <div class="rwl__title">{{ t('intgResolveLinkDialogTitle') }}</div>
        <button
          type="button"
          class="rwl__close"
          :aria-label="t('intgResolveLinkClose')"
          @click="$emit('update:modelValue', false)"
        >
          <v-icon size="18">mdi-close</v-icon>
        </button>
      </div>

      <!-- Body -->
      <div class="rwl__body">
        <p class="rwl__desc">{{ t('intgResolveLinkDialogDesc') }}</p>

        <div v-for="match in matches" :key="match.eventId" class="rwl__card">
          <div class="rwl__card-info">
            <strong class="rwl__card-name">{{ match.eventName }}</strong>
            <span class="rwl__card-date">{{ formattedItemDate(match.eventDate) }}</span>
          </div>

          <select
            v-model="selections[match.eventId]"
            class="form-select form-select-sm rwl__select"
            :aria-label="t('intgResolveLinkSelectLabel')"
          >
            <option value="" disabled>{{ t('intgResolveLinkSelectLabel') }}</option>
            <option v-for="c in (match.candidates || [])" :key="c.id" :value="c.id">
              {{ c.name }} · {{ formattedItemDate(c.startDate) }}
            </option>
          </select>

          <button
            type="button"
            class="rwl__confirm"
            :disabled="!selections[match.eventId] || resolvingId === match.eventId"
            @click="$emit('resolve', { eventId: match.eventId, weezeventEventId: selections[match.eventId] })"
          >
            <v-progress-circular v-if="resolvingId === match.eventId" indeterminate size="14" width="2" color="white" class="mr-1" />
            {{ t('intgResolveLinkConfirm') }}
          </button>
        </div>
      </div>

      <!-- Footer -->
      <div class="rwl__footer">
        <button type="button" class="rwl__btn rwl__btn--cancel" @click="$emit('update:modelValue', false)">
          {{ t('intgResolveLinkClose') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'
import { formatDateMedium } from '@/utils/dateFr'

export default {
  name: 'ResolveWeezeventLinkDialog',
  setup() {
    const { t } = useI18n()
    const theme = useTheme()
    const isDark = computed(() => !!theme.global.current.value.dark)
    return { t, isDark }
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
/* BUG-282 : seule couleur en dur du fichier (le reste = v-card/typo Vuetify,
   déjà thémés) — v-dialog téléporté, donc .dark (<html>). */
.dark .rwl-row {
  border-color: #374151;
}
.rwl-row__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rwl--dark .rwl__footer { background: #111827; border-top-color: rgba(255,255,255,.08); }
.rwl--dark .rwl__btn--cancel { background: transparent; border-color: rgba(255,255,255,.14); color: #cbd5e1; }
.rwl--dark .rwl__btn--cancel:hover { background: #374151; color: #fff; }
</style>
