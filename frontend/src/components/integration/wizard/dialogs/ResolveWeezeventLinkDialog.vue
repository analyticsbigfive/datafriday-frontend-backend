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
.rwl { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.18); display: flex; flex-direction: column; max-height: 90vh; }

/* Header rouge charte */
.rwl__header { display: flex; align-items: center; gap: 12px; padding: 16px 18px; background: #ff3131; flex-shrink: 0; }
.rwl__icon { width: 38px; height: 38px; border-radius: 11px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.rwl__title { flex: 1; min-width: 0; color: #fff; font-size: var(--fs-md); font-weight: 700; }
.rwl__close { width: 30px; height: 30px; border: none; border-radius: 8px; background: rgba(255,255,255,.18); color: rgba(255,255,255,.9); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background .18s; flex-shrink: 0; }
.rwl__close:hover { background: rgba(255,255,255,.3); }

/* Body */
.rwl__body { padding: 18px; overflow-y: auto; flex: 1; min-height: 0; }
.rwl__desc { font-size: var(--fs-md); color: #6b7280; line-height: 1.55; margin: 0 0 16px; }

/* Carte par match */
.rwl__card { padding: 14px; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 12px; }
.rwl__card:last-child { margin-bottom: 0; }
.rwl__card-info { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
.rwl__card-name { font-size: var(--fs-base); color: #111827; font-weight: 700; }
.rwl__card-date { font-size: var(--fs-sm); color: #9ca3af; }

/* Select Bootstrap stylé charte */
.rwl__select { border-radius: 10px; border: 1.5px solid #e5e7eb; font-size: var(--fs-base); margin-bottom: 10px; }
.rwl__select:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255,49,49,.12); }

/* Bouton de confirmation (pilule rouge) */
.rwl__confirm { display: inline-flex; align-items: center; padding: 7px 16px; border-radius: 100px; font-size: var(--fs-sm); font-weight: 700; cursor: pointer; border: none; background: #ff3131; color: #fff; transition: all .2s; }
.rwl__confirm:hover:not(:disabled) { box-shadow: 0 4px 14px rgba(255,49,49,.35); transform: translateY(-1px); }
.rwl__confirm:disabled { opacity: .5; cursor: not-allowed; }

/* Footer */
.rwl__footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 18px; border-top: 1px solid #f0f0f0; background: #fafafa; flex-shrink: 0; }
.rwl__btn { display: inline-flex; align-items: center; padding: 8px 18px; border-radius: 100px; font-size: var(--fs-base); font-weight: 600; cursor: pointer; border: none; transition: all .2s; }
.rwl__btn--cancel { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.rwl__btn--cancel:hover { background: #f3f4f6; color: #374151; }

/* Dark */
.rwl--dark { background: #1e293b; }
.rwl--dark .rwl__body { background: #1e293b; }
.rwl--dark .rwl__desc { color: #94a3b8; }
.rwl--dark .rwl__card { border-color: rgba(255,255,255,.08); background: #0f172a; }
.rwl--dark .rwl__card-name { color: #f9fafb; }
.rwl--dark .rwl__card-date { color: #64748b; }
.rwl--dark .rwl__select {
  background-color: #0f172a; border-color: rgba(255,255,255,.14); color: #e5e7eb;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3E%3C/svg%3E");
}
.rwl--dark .rwl__footer { background: #111827; border-top-color: rgba(255,255,255,.08); }
.rwl--dark .rwl__btn--cancel { background: transparent; border-color: rgba(255,255,255,.14); color: #cbd5e1; }
.rwl--dark .rwl__btn--cancel:hover { background: #374151; color: #fff; }
</style>
