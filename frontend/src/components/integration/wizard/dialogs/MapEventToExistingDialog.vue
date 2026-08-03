<template>
  <v-dialog :model-value="modelValue" max-width="440" persistent @update:model-value="$emit('update:modelValue', $event)">
    <div class="mee" :class="{ 'mee--dark': isDark }">
      <!-- Header charte (rouge) -->
      <div class="mee__header">
        <div class="mee__icon"><v-icon size="20" color="white">mdi-link-variant</v-icon></div>
        <div class="mee__title">{{ t('intgMapEvtTitle') }}</div>
        <button
          type="button"
          class="mee__close"
          :aria-label="t('intgMapEvtCancel')"
          @click="$emit('update:modelValue', false)"
        >
          <v-icon size="18">mdi-close</v-icon>
        </button>
      </div>

      <!-- Body -->
      <div class="mee__body">
        <p class="mee__text">
          {{ t('intgMapEvtDescBefore') }} <strong>{{ formattedDate }}</strong>
          {{ t('intgMapEvtDescAfter') }}
        </p>

        <label class="mee__label" for="mee-event-select">{{ t('intgMapEvtSelectLabel') }}</label>
        <select id="mee-event-select" v-model="selectedEventId" class="mee__select">
          <option value="" disabled>{{ t('intgMapEvtSelectLabel') }}</option>
          <option v-for="e in events" :key="e.id" :value="e.id">
            {{ e.name }} · {{ formattedItemDate(e.startDate || e.endDate) }}
          </option>
        </select>
      </div>

      <!-- Footer -->
      <div class="mee__footer">
        <button type="button" class="mee__btn mee__btn--cancel" @click="$emit('update:modelValue', false)">
          {{ t('intgMapEvtCancel') }}
        </button>
        <button
          type="button"
          class="mee__btn mee__btn--confirm"
          :disabled="!selectedEventId || loading"
          @click="$emit('confirm', selectedEventId)"
        >
          <v-progress-circular v-if="loading" indeterminate size="14" width="2" color="white" class="mr-1" />
          {{ t('intgMapEvtConfirm') }}
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
  name: 'MapEventToExistingDialog',
  setup() {
    const { t } = useI18n()
    const theme = useTheme()
    const isDark = computed(() => !!theme.global.current.value.dark)
    return { t, isDark }
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
      selectedEventId: '',
    }
  },
  watch: {
    modelValue(val) {
      if (val) this.selectedEventId = ''
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
.mee { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.18); }

/* Header rouge charte */
.mee__header { display: flex; align-items: center; gap: 12px; padding: 16px 18px; background: #ff3131; }
.mee__icon { width: 38px; height: 38px; border-radius: 11px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.mee__title { flex: 1; min-width: 0; color: #fff; font-size: var(--fs-md); font-weight: 700; }
.mee__close { width: 30px; height: 30px; border: none; border-radius: 8px; background: rgba(255,255,255,.18); color: rgba(255,255,255,.9); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background .18s; flex-shrink: 0; }
.mee__close:hover { background: rgba(255,255,255,.3); }

/* Body */
.mee__body { padding: 20px 18px; }
.mee__text { font-size: var(--fs-md); color: #374151; line-height: 1.6; margin: 0 0 16px; }
.mee__text strong { color: #111827; font-weight: 700; }
.mee__label { display: block; font-size: var(--fs-sm); font-weight: 600; color: #374151; margin-bottom: 6px; }
.mee__select { width: 100%; padding: 9px 12px; border-radius: 10px; border: 1.5px solid #e5e7eb; background: #f9fafb; font-size: var(--fs-base); color: #111827; outline: none; cursor: pointer; transition: border-color .18s, box-shadow .18s; }
.mee__select:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255,49,49,.12); }

/* Footer */
.mee__footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 18px; border-top: 1px solid #f0f0f0; background: #fafafa; }
.mee__btn { display: inline-flex; align-items: center; padding: 8px 18px; border-radius: 100px; font-size: var(--fs-base); font-weight: 600; cursor: pointer; border: none; transition: all .2s; }
.mee__btn:disabled { opacity: .55; cursor: not-allowed; }
.mee__btn--cancel { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.mee__btn--cancel:hover:not(:disabled) { background: #f3f4f6; color: #374151; }
.mee__btn--confirm { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255,49,49,.3); }
.mee__btn--confirm:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(255,49,49,.4); transform: translateY(-1px); }

/* Dark */
.mee--dark { background: #1f2937; }
.mee--dark .mee__body { background: #1f2937; }
.mee--dark .mee__text { color: #d1d5db; }
.mee--dark .mee__text strong { color: #f3f4f6; }
.mee--dark .mee__label { color: #cbd5e1; }
.mee--dark .mee__select {
  background: #111827; border-color: rgba(255,255,255,.14); color: #e5e7eb;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3E%3C/svg%3E");
}
.mee--dark .mee__footer { background: #111827; border-top-color: rgba(255,255,255,.08); }
.mee--dark .mee__btn--cancel { background: transparent; border-color: rgba(255,255,255,.14); color: #cbd5e1; }
.mee--dark .mee__btn--cancel:hover:not(:disabled) { background: #374151; color: #fff; }
</style>
