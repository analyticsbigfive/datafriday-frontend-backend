<template>
  <div v-if="notices.length" class="cn">
    <div v-for="n in notices" :key="n.key" class="cn__alert" :class="`cn__alert--${n.tone}`" role="status">
      <v-icon size="16" class="cn__ico" aria-hidden="true">{{ n.icon }}</v-icon>
      <span>{{ n.text }}</span>
    </div>
  </div>
</template>

<script setup>
// Alertes du rapport de comparaison : events Predict exclus, mêmes events que le principal,
// plafond atteint, plage horaire du principal non reprise.
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { excludedNamesText } from '@/utils/comparisonReportView'

const props = defineProps({
  // [{ id, name, date, reason }] (Predict uniquement)
  excludedEvents: { type: Array, default: () => [] },
  sameAsMain: { type: Boolean, default: false },
  // { truncated, total, kept, cap }
  truncation: { type: Object, default: null },
  intraEventRangeIgnored: { type: Boolean, default: false },
})

const { t } = useI18n()

const notices = computed(() => {
  const out = []
  if (props.sameAsMain) {
    out.push({ key: 'same', tone: 'warn', icon: 'mdi-alert-outline', text: t('anCmpAlertSame') })
  }
  if (props.excludedEvents.length) {
    out.push({
      key: 'excluded',
      tone: 'warn',
      icon: 'mdi-information-outline',
      text: t('anCmpNoticeExcluded')
        .replace('{n}', String(props.excludedEvents.length))
        .replace('{names}', excludedNamesText(props.excludedEvents)),
    })
  }
  if (props.truncation?.truncated) {
    out.push({
      key: 'truncated',
      tone: 'warn',
      icon: 'mdi-information-outline',
      text: t('anCmpNoticeTruncated')
        .replace('{kept}', String(props.truncation.kept))
        .replace('{total}', String(props.truncation.total)),
    })
  }
  if (props.intraEventRangeIgnored) {
    out.push({ key: 'range', tone: 'info', icon: 'mdi-clock-outline', text: t('anCmpNoticeRange') })
  }
  return out
})
</script>

<style scoped>
.cn { display: flex; flex-direction: column; gap: 8px; }
.cn__alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: var(--fs-base);
  line-height: 1.35;
}
.cn__alert--warn { background: var(--cr-warn-bg); color: var(--cr-warn); }
.cn__alert--info { background: var(--cr-cmp-bg); color: var(--cr-cmp); }
.cn__ico { flex: none; margin-top: 1px; }
</style>
