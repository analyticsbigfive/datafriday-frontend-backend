<template>
  <div v-if="line" class="dc" role="timer" :aria-label="line">
    <v-icon size="16" class="dc__icon">mdi-timer-sand</v-icon>
    <span class="dc__text">
      <span class="dc__name">{{ prefix }} {{ eventName }}</span>
      <template v-if="countdown.visible.value">
        <span class="dc__sep" aria-hidden="true">·</span>
        <span class="dc__label">{{ t('liveCountdownLabel') }}</span>
        <strong class="dc__value">{{ countdown.text.value }}</strong>
      </template>
      <span v-else-if="dateText" class="dc__label dc__date">{{ dateText }}</span>
    </span>
  </div>
</template>

<script setup>
import { computed, toRef } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useDoorsCountdown } from '@/composables/useDoorsCountdown'
import { formatDateShort } from '@/utils/dateFr'

const { t } = useI18n()

const props = defineProps({
  event: { type: Object, default: null },
  doorsOpenAt: { type: Date, default: null },
  isUpcoming: { type: Boolean, default: false },
})

const units = computed(() => ({ d: t('liveCountdownUnitD'), h: t('liveCountdownUnitH'), m: t('liveCountdownUnitM') }))
const countdown = useDoorsCountdown(toRef(props, 'doorsOpenAt'), toRef(props, 'isUpcoming'), units)

const eventName = computed(() => props.event?.name || props.event?.eventName || '')
// Avec compte à rebours : « Prochain : X ». Sans heure de portes : « Prochain événement : X <date> ».
const prefix = computed(() => (props.doorsOpenAt ? `${t('liveCountdownNext')} :` : `${t('liveCountdownNextEvent')} :`))
const dateText = computed(() => formatDateShort(props.event?.eventStartDate || props.event?.eventDate || props.event?.date))
const line = computed(() => {
  if (!props.isUpcoming || !props.event || !eventName.value) return ''
  // Portes déjà ouvertes d'après l'heure (la bascule live arrive au prochain signal) : rien à compter.
  if (props.doorsOpenAt && !countdown.visible.value) return ''
  return `${prefix.value} ${eventName.value}`
})
</script>

<style scoped>
.dc {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 6px 12px;
  width: fit-content;
  max-width: 100%;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  color: #fff;
  font-size: var(--fs-sm);
}
.dc__icon { color: rgba(255, 255, 255, 0.9); flex: none; }
.dc__text { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; min-width: 0; }
.dc__name { font-weight: var(--fw-semibold); overflow-wrap: anywhere; }
.dc__sep { opacity: 0.7; }
.dc__label { opacity: 0.9; }
.dc__value { font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; white-space: nowrap; }
@media (max-width: 600px) {
  .dc { border-radius: 14px; }
}
</style>
