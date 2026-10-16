<template>
  <GuestPosModalShell :title="t('guestPosHistoryTitle')" width="920px" @close="$emit('close')">
    <div class="pos-history">
      <div class="pos-history__head">
        <div>
          <div class="pos-history__title">{{ t('guestPosHistoryTitle') }}</div>
          <div class="pos-history__summary">{{ history.summary.value }}</div>
        </div>
        <button type="button" class="pos-history__close" :aria-label="t('guestPosClose')" @click="$emit('close')"><X :size="16" aria-hidden="true" /></button>
      </div>
      <div class="pos-history__body">
        <GuestPosHistoryList
          v-model:filter="history.filter.value"
          v-model:search="history.search.value"
          :chips="history.chips.value"
          :rows="history.rows.value"
          :selected-key="history.selectedRowKey.value"
          :loading="history.loading.value"
          :has-more="history.hasMore.value"
          @select="history.select"
          @load-more="history.loadMore"
        />
        <GuestPosHistoryDetail :detail="history.detail.value" :busy="history.busy.value" :error-key="history.errorKey.value" @toggle-cancel="history.toggleCancel" @dismiss="history.dismissRejected" />
      </div>
    </div>
  </GuestPosModalShell>
</template>

<script setup>
import { onMounted } from 'vue'
import { X } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { useGuestPosHistory } from '@/composables/useGuestPosHistory'
import GuestPosModalShell from './GuestPosModalShell.vue'
import GuestPosHistoryList from './GuestPosHistoryList.vue'
import GuestPosHistoryDetail from './GuestPosHistoryDetail.vue'

defineEmits(['close'])

const { t } = useI18n()
const history = useGuestPosHistory()
onMounted(() => history.load())
</script>

<style scoped>
.pos-history { height: min(640px, 100%); min-height: 420px; display: flex; flex-direction: column; }
.pos-history__head { padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--pos-border); }
.pos-history__title { font-size: var(--fs-xl); font-weight: var(--fw-bold); }
.pos-history__summary { font-size: var(--fs-base); color: var(--pos-muted); margin-top: 2px; }
.pos-history__close { width: 44px; height: 44px; border-radius: 8px; border: 1px solid var(--pos-border-strong); background: var(--pos-surface); color: var(--pos-text); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.pos-history__body { flex: 1; min-height: 0; display: flex; }
</style>
