<template>
  <!-- Pastille de statut de comptage : rouge (rien compté), orange (en partie),
       verte (tout compté). Document Bertrand 2026-10-06, pages 5 et 6. -->
  <span
    class="inv-status-dot"
    :class="`inv-status-dot--${status}`"
    role="img"
    :aria-label="t(labelKey)"
    :title="t(labelKey)"
  />
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { COUNTING_STATUS_LABEL_KEYS, COUNTING_STATUS_TO_COUNT } from '@/utils/inventoryCountingStatus'

const { t } = useI18n()

const props = defineProps({
  status: { type: String, default: COUNTING_STATUS_TO_COUNT },
})

const labelKey = computed(() => COUNTING_STATUS_LABEL_KEYS[props.status] || 'invStatusToCount')
</script>

<style scoped>
.inv-status-dot {
  display: inline-block;
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  vertical-align: 1px;
  background: #ef4444;
}
.inv-status-dot--in-progress { background: #f59e0b; }
.inv-status-dot--counted { background: #22c55e; }
</style>
