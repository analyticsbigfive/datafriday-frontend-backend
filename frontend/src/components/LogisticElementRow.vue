<template>
  <div class="lg-row" :class="{ 'lg-row-empty': totalItems === 0 }">
    <span v-if="ruptureCount || lowCount" class="lg-row-stripe" :class="ruptureCount ? 'lg-stripe-bad' : 'lg-stripe-warn'"></span>
    <div class="lg-row-main">
      <span class="lg-row-name">
        {{ element?.name }}
        <span v-if="ruptureCount" class="lg-status-badge lg-status-bad">
          {{ ruptureCount }} {{ t('logiRowRuptures') }}
        </span>
        <span v-else-if="lowCount" class="lg-status-badge lg-status-warn">
          {{ lowCount }} {{ t('logiRowLowStock') }}
        </span>
      </span>
      <span class="lg-row-meta">{{ totalItems }} {{ t('logiRowItemsSuffix') }}</span>
    </div>

    <div class="lg-row-stats">
      <div class="lg-row-stat">
        <span class="lg-row-stat-num">{{ totalPacked }}</span>
        <span class="lg-row-stat-lbl">{{ t('logiPackedShort') }}</span>
      </div>
      <div class="lg-row-stat">
        <span class="lg-row-stat-num">{{ totalLoose }}</span>
        <span class="lg-row-stat-lbl">{{ t('logiLooseShort') }}</span>
      </div>
    </div>

    <div class="lg-row-actions">
      <v-btn variant="outlined" size="small" class="lg-row-history" @click="$emit('open-history', element)">
        <v-icon size="15" class="mr-1">mdi-history</v-icon>
        {{ t('logiHistoryBtn') }}
      </v-btn>
      <v-btn color="primary" variant="flat" size="small" class="lg-row-open" @click="$emit('open', element)">
        {{ t('logiManageStock') }}
        <v-icon size="15" class="ml-1">mdi-arrow-right</v-icon>
      </v-btn>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

defineProps({
  element: { type: Object, required: true },
  totalItems: { type: Number, default: 0 },
  totalPacked: { type: Number, default: 0 },
  totalLoose: { type: Number, default: 0 },
  /** Nb de denrées en rupture (0 packed + 0 loose) / en stock bas (0 pack, vrac entamé). */
  ruptureCount: { type: Number, default: 0 },
  lowCount: { type: Number, default: 0 },
})

defineEmits(['open', 'open-history'])
</script>

<style scoped>
.lg-row {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 66px;
  padding: 10px 16px;
  background: var(--fb-surface, #ffffff);
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-panel, 10px);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}
.lg-row:hover {
  border-color: rgba(214, 48, 49, 0.26);
  box-shadow: var(--fb-shadow-hover, 0 4px 16px rgba(15, 23, 42, 0.08));
  transform: translateY(-1px);
}
.lg-row-empty { opacity: 0.65; }
.lg-row-stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.lg-stripe-bad { background: var(--fb-danger, #dc2626); }
.lg-stripe-warn { background: var(--fb-warning, #d97706); }
.lg-status-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.66rem;
  font-weight: 700;
  border-radius: 999px;
  padding: 2px 8px;
  margin-left: 8px;
  white-space: nowrap;
  vertical-align: middle;
}
.lg-status-bad { background: var(--fb-danger-soft, #fef2f2); color: var(--fb-danger, #dc2626); }
.lg-status-warn { background: var(--fb-warning-soft, #fffbeb); color: var(--fb-warning, #d97706); }
.lg-row-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 30%;
}
.lg-row-name {
  font-weight: 700;
  font-size: 0.92rem;
  color: var(--fb-text, #212121);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lg-row-meta { font-size: 0.75rem; color: var(--fb-faint, #9ca3af); }
.lg-row-stats { display: flex; gap: 22px; flex: 1 1 200px; }
.lg-row-stat { display: flex; flex-direction: column; }
.lg-row-stat-num { font-weight: 800; font-size: 0.95rem; color: var(--fb-text, #212121); }
.lg-row-stat-lbl { font-size: 0.7rem; color: var(--fb-muted, #6b7280); }
.lg-row-actions { display: flex; gap: 8px; flex-shrink: 0; }
.lg-row-history,
.lg-row-open {
  border-radius: var(--fb-radius-control, 8px);
  text-transform: none;
  font-weight: 700;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .lg-row { flex-wrap: wrap; gap: 10px 12px; }
  .lg-row-main { flex-basis: 100%; }
  .lg-row-stats { flex-basis: 100%; }
  .lg-row-actions { margin-left: auto; }
}
</style>
