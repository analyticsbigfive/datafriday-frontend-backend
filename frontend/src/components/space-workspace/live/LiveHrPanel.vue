<template>
  <div class="hr-panel" :class="{ 'hr-panel--dark': isDark }">
    <div class="hr-head">
      <span class="hr-title">{{ t('liveHrTitle') }}</span>
      <span class="hr-sub">{{ t('liveHrSubtitle') }}</span>
    </div>

    <div v-if="staffError" class="hr-note hr-note--warn">{{ t('liveHrStaffError') }}</div>
    <div v-if="predictedError && canSeeRevenue" class="hr-note hr-note--warn">{{ t('liveHrPredictError') }}</div>
    <div v-else-if="!loading && canSeeRevenue && !hasPredicted && !predictedError" class="hr-note">{{ t('liveHrNoPredictVersion') }}</div>

    <div v-if="isUpcoming" class="hr-note">{{ t('liveHrUpcomingNote') }}</div>

    <div v-if="loading && !rows.length" class="hr-list">
      <div v-for="n in 4" :key="n" class="hr-card hr-skeleton" aria-hidden="true"></div>
    </div>

    <div v-else-if="!rows.length" class="hr-empty">
      <v-icon size="28" class="hr-empty__icon">mdi-account-group-outline</v-icon>
      <span>{{ t('liveHrEmpty') }}</span>
    </div>

    <div v-else class="hr-list" role="list">
      <div v-for="(row, idx) in rows" :key="row.shopId" class="hr-card" :class="{ 'hr-card--no-rev': !canSeeRevenue }" role="listitem">
        <div class="hr-cell hr-cell--name">
          <v-avatar size="24" :color="rankColor(idx + 1)" class="hr-rank">
            <span class="hr-rank__num">{{ idx + 1 }}</span>
          </v-avatar>
          <span class="hr-name">{{ row.name }}</span>
        </div>

        <div class="hr-cell hr-cell--tx">
          <div class="hr-tx">
            <span class="hr-tx__value">{{ formatRate(row.avg) }}</span>
            <span class="hr-tx__unit">{{ t('liveHrTxMin') }}</span>
          </div>
          <div class="hr-spark" :aria-label="t('liveHrLast3')">
            <div v-for="(count, i) in row.perMinute" :key="i" class="hr-spark__col">
              <div class="hr-spark__track"><i :style="{ height: sparkHeight(count, row.perMinute) }"></i></div>
              <span class="hr-spark__count">{{ count }}</span>
              <span class="hr-spark__label">{{ minuteLabel(minutes[i]) }}</span>
            </div>
          </div>
        </div>

        <div class="hr-cell hr-cell--staff">
          <template v-if="row.hasStaff">
            <span class="hr-staff-total">{{ staffLabel(row.staffTotal) }}</span>
            <div class="hr-pills">
              <span v-for="role in row.roles" :key="role.roleName" class="hr-pill">
                <span class="hr-pill__name">{{ role.roleName || t('liveHrRoleUnknown') }}</span>
                <span class="hr-pill__count">{{ role.count }}</span>
              </span>
            </div>
          </template>
          <span v-else class="hr-muted">{{ t('liveHrNoStaff') }}</span>
        </div>

        <div v-if="canSeeRevenue" class="hr-cell hr-cell--rev">
          <template v-if="row.percent !== null">
            <div class="hr-rev-top">
              <span class="hr-rev-pct" :class="{ 'hr-rev-pct--over': row.percent > 100 }">{{ formatPercent(row.percent, 0) }}</span>
              <span class="hr-rev-amounts">{{ formatCurrency(row.realizedRevenue) }} / {{ formatCurrency(row.predictedRevenue) }}</span>
            </div>
            <div
              class="hr-meter"
              :class="{ 'hr-meter--over': row.percent > 100 }"
              role="progressbar"
              :aria-valuenow="Math.round(row.percent)"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <i :style="{ width: meterWidth(row.percent) }"></i>
            </div>
          </template>
          <template v-else>
            <div class="hr-rev-top">
              <span class="hr-muted">{{ t('liveHrNoPredict') }}</span>
              <span v-if="row.realizedRevenue > 0" class="hr-rev-amounts">{{ formatCurrency(row.realizedRevenue) }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import { formatCurrency, formatPercent } from '@/composables/useFormatters'
import { RANK_COLORS } from '@/constants/analyseColors'

const { t } = useI18n()

defineProps({
  rows: { type: Array, default: () => [] },
  minutes: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  staffError: { type: Boolean, default: false },
  predictedError: { type: Boolean, default: false },
  hasPredicted: { type: Boolean, default: false },
  canSeeRevenue: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  isUpcoming: { type: Boolean, default: false },
})

function rankColor(rank) {
  if (rank === 1) return RANK_COLORS[1]
  if (rank === 2) return RANK_COLORS[2]
  return RANK_COLORS.default
}
function formatRate(v) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v)
}
function staffLabel(n) {
  return `${n} ${n > 1 ? t('liveHrPersonMany') : t('liveHrPersonOne')}`
}
// « 2026-10-23T19:42 » devient « 19:42 ».
function minuteLabel(m) {
  return m ? m.slice(11, 16) : ''
}
function sparkHeight(count, all) {
  const max = Math.max(...all, 0)
  if (max <= 0) return '0%'
  return `${Math.max(count > 0 ? 12 : 0, (count / max) * 100)}%`
}
// La barre est bornée à 100 % ; le dépassement se lit sur le pourcentage et la couleur.
function meterWidth(percent) {
  return `${Math.max(2, Math.min(100, percent))}%`
}
</script>

<style scoped>
.hr-panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  padding: 16px;
  margin-bottom: 16px;
}
.hr-panel--dark { background: #1e293b; border-color: rgba(255, 255, 255, 0.10); }
.hr-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 12px; }
.hr-title {
  font-size: var(--fs-xs); font-weight: var(--fw-bold); color: #64748b;
  text-transform: uppercase; letter-spacing: 0.08em;
}
.hr-sub { font-size: var(--fs-sm); color: #6b7280; }
.hr-panel--dark .hr-sub { color: #94a3b8; }
.hr-note {
  font-size: var(--fs-sm); color: #475569; background: #f1f5f9;
  border-radius: 10px; padding: 8px 12px; margin-bottom: 10px;
}
.hr-note--warn { background: #fef3c7; color: #92400e; }
.hr-panel--dark .hr-note { background: #0f172a; color: #cbd5e1; }
.hr-panel--dark .hr-note--warn { background: rgba(245, 158, 11, 0.15); color: #fcd34d; }

.hr-list { display: flex; flex-direction: column; gap: 8px; container-type: inline-size; }
.hr-card {
  position: relative; overflow: hidden;
  display: grid; grid-template-columns: 1fr; gap: 12px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
  padding: 12px 14px 12px 17px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.hr-card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: #0284c7; }
.hr-panel--dark .hr-card { background: #0f172a; border-color: rgba(255, 255, 255, 0.10); }
.hr-skeleton { height: 96px; background: linear-gradient(90deg, #f1f5f9, #e2e8f0, #f1f5f9); background-size: 200% 100%; animation: hr-shimmer 1.4s ease infinite; }
.hr-panel--dark .hr-skeleton { background: linear-gradient(90deg, #1e293b, #334155, #1e293b); background-size: 200% 100%; }
@keyframes hr-shimmer { to { background-position: -200% 0; } }

.hr-cell { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.hr-cell--name { flex-direction: row; align-items: center; gap: 10px; }
.hr-rank { color: #fff; flex: none; }
.hr-rank__num { font-size: var(--fs-xs); font-weight: var(--fw-bold); }
.hr-name {
  font-size: var(--fs-md); font-weight: var(--fw-bold); color: #212121;
  overflow-wrap: anywhere; line-height: 1.25;
}
.hr-panel--dark .hr-name { color: #f9fafb; }

.hr-cell--tx { flex-direction: row; align-items: flex-end; justify-content: space-between; gap: 16px; }
.hr-tx { display: flex; align-items: baseline; gap: 4px; }
.hr-tx__value {
  font-size: var(--fs-xl); font-weight: var(--fw-bold); color: #212121;
  font-variant-numeric: tabular-nums; letter-spacing: -0.3px;
}
.hr-panel--dark .hr-tx__value { color: #f9fafb; }
.hr-tx__unit { font-size: var(--fs-sm); color: #6b7280; }
.hr-spark { display: flex; gap: 10px; }
.hr-spark__col { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 38px; }
.hr-spark__track {
  width: 100%; height: 28px; display: flex; align-items: flex-end;
  background: #eef2f7; border-radius: 4px; overflow: hidden;
}
.hr-panel--dark .hr-spark__track { background: #1e293b; }
.hr-spark__track > i { display: block; width: 100%; background: #0284c7; border-radius: 4px 4px 0 0; transition: height 0.3s ease; }
.hr-spark__count { font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: #212121; font-variant-numeric: tabular-nums; }
.hr-panel--dark .hr-spark__count { color: #f9fafb; }
.hr-spark__label { font-size: var(--fs-xs); color: #9ca3af; font-variant-numeric: tabular-nums; }

.hr-staff-total { font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: #475569; }
.hr-panel--dark .hr-staff-total { color: #cbd5e1; }
.hr-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.hr-pill {
  display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
  background: #f1f5f9; border-radius: 999px; padding: 3px 4px 3px 10px;
  font-size: var(--fs-sm); color: #334155;
}
.hr-panel--dark .hr-pill { background: #1e293b; color: #e2e8f0; }
.hr-pill__name { overflow-wrap: anywhere; }
.hr-pill__count {
  min-width: 20px; text-align: center; padding: 0 6px; border-radius: 999px;
  background: #0284c7; color: #fff; font-size: var(--fs-xs); font-weight: var(--fw-bold);
}
.hr-muted { font-size: var(--fs-sm); color: #9ca3af; }

.hr-rev-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.hr-rev-pct { font-size: var(--fs-lg); font-weight: var(--fw-bold); color: #212121; font-variant-numeric: tabular-nums; }
.hr-panel--dark .hr-rev-pct { color: #f9fafb; }
.hr-rev-pct--over { color: #059669; }
.hr-rev-amounts { font-size: var(--fs-sm); color: #6b7280; font-variant-numeric: tabular-nums; }
.hr-meter { height: 6px; border-radius: 4px; background: #eef2f7; overflow: hidden; }
.hr-panel--dark .hr-meter { background: #1e293b; }
.hr-meter > i { display: block; height: 100%; border-radius: 4px; background: #0284c7; transition: width 0.3s ease; }
.hr-meter--over > i { background: #059669; }

.hr-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 28px 12px; text-align: center; font-size: var(--fs-base); color: #9ca3af;
}
.hr-empty__icon { color: #cbd5e1; }

@container (min-width: 720px) {
  .hr-card.hr-card--no-rev { grid-template-columns: minmax(150px, 1.1fr) minmax(190px, 1.1fr) minmax(150px, 1.2fr); }
  .hr-card {
    grid-template-columns: minmax(150px, 1.1fr) minmax(190px, 1.1fr) minmax(150px, 1.2fr) minmax(170px, 1fr);
    align-items: center; gap: 16px;
  }
  .hr-cell--tx { flex-direction: column; align-items: flex-start; gap: 6px; }
}
@media (max-width: 600px) {
  .hr-panel { padding: 12px; }
}
</style>
