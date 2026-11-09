<template>
  <section v-if="hasContent" class="lgvt-root" data-test="ventilation-transfers">
    <header class="lgvt-head">
      <v-icon size="16">mdi-truck-delivery-outline</v-icon>
      <span class="lgvt-title">{{ t('lgvtTitle') }}</span>
    </header>

    <div class="lgvt-controls">
      <label class="lgvt-field">
        <span class="lgvt-label">{{ t('lgvtSource') }}</span>
        <select v-model="ctl.sourceId.value" class="lgvt-select" data-test="transfer-source">
          <option v-for="s in ctl.sourceOptions.value" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>
      <label class="lgvt-field">
        <span class="lgvt-label">{{ t('lgvtAssignAll') }}</span>
        <select v-model="ctl.batchAssignee.value" class="lgvt-select" data-test="transfer-batch-assignee">
          <option :value="null">{{ t('lgvtChoose') }}</option>
          <option v-for="u in ctl.staff.value" :key="u.id" :value="u.id">{{ u.fullName }}</option>
        </select>
      </label>
    </div>

    <label class="lgvt-check" data-test="transfer-reserve">
      <input v-model="ctl.reserveOwnNeed.value" type="checkbox" />
      <span>{{ t('lgvtReserve') }}</span>
    </label>

    <ul v-if="ctl.sourceSummary.value.length" class="lgvt-list" data-test="transfer-source-summary">
      <li v-for="s in ctl.sourceSummary.value" :key="s.itemKey" class="lgvt-sum">
        <span class="lgvt-item">{{ s.itemName }}</span>
        <span class="lgvt-meta">{{ t('lgvtSumStock') }} {{ count(s, s.stock) }}</span>
        <span v-if="s.reserved" class="lgvt-meta">{{ t('lgvtSumReserved') }} {{ count(s, s.reserved) }}</span>
        <span class="lgvt-meta">{{ t('lgvtSumAvailable') }} {{ count(s, s.available) }}</span>
        <span class="lgvt-meta">{{ t('lgvtSumDeposited') }} {{ count(s, s.deposited) }}</span>
        <span class="lgvt-meta">{{ t('lgvtSumLeft') }} {{ count(s, s.left) }}</span>
      </li>
    </ul>

    <ul v-if="ctl.rows.value.length" class="lgvt-list">
      <li v-for="tr in ctl.rows.value" :key="key(tr)" class="lgvt-row">
        <div class="lgvt-copy">
          <span class="lgvt-item">{{ tr.itemName }} · {{ tr.shopName }}</span>
          <span v-if="tr.taken && isShop(tr)" class="lgvt-meta" data-test="transfer-from-shop">
            <span class="lgvt-badge">{{ t('lgvtBadgeShop') }}</span>
            {{ t('lgvtFromShop').replace('{shop}', tr.fromShopName).replace('{n}', packLabel({ ...tr, packs: tr.taken })) }}
          </span>
          <span v-else-if="tr.taken" class="lgvt-meta">
            {{ t('lgvtTaken').replace('{source}', sourceName).replace('{n}', packLabel({ ...tr, packs: tr.taken })) }}
          </span>
          <span v-if="tr.short" class="lgvt-short" data-test="transfer-short">
            {{ t('lgvtShort').replace('{n}', packLabel({ ...tr, packs: tr.short })) }}
          </span>
        </div>
        <select
          v-if="tr.taken"
          class="lgvt-select lgvt-select--row"
          :value="ctl.assigneeFor(tr) || ''"
          @change="ctl.setAssignee(tr, $event.target.value)"
        >
          <option value="">{{ t('lgvtChoose') }}</option>
          <option v-for="u in ctl.staff.value" :key="u.id" :value="u.id">{{ u.fullName }}</option>
        </select>
      </li>
    </ul>

    <div v-if="result.unverified.length" class="lgvt-block" data-test="transfer-unverified">
      <strong>{{ t('lgvtUnverified') }}</strong>
      <span class="lgvt-line">{{ t('lgvtUnverifiedHint') }}</span>
      <span v-for="u in result.unverified" :key="key(u)" class="lgvt-line">
        {{ t('lgvtUnverifiedLine').replace('{item}', u.itemName).replace('{from}', u.fromShopName).replace('{to}', u.shopName).replace('{n}', packLabel(u)) }}
      </span>
    </div>

    <div v-if="result.unknown.length" class="lgvt-block" data-test="transfer-unknown">
      <strong>{{ t('lgvtUnknown') }}</strong>
      <span v-for="u in result.unknown" :key="u.itemKey" class="lgvt-line">
        {{ u.itemName }} · {{ u.reason === 'no-stock' ? t('lgvtNoStock') : t('lgvtNoPack') }}
      </span>
    </div>

    <p v-if="ctl.error.value" class="lgvt-error">{{ ctl.error.value }}</p>

    <footer v-if="result.transfers.length" class="lgvt-foot">
      <span v-if="ctl.missingAssignee.value" class="lgvt-hint">{{ t('lgvtNeedAssignee') }}</span>
      <button
        type="button"
        class="lgvt-btn"
        :disabled="!ctl.canGenerate.value"
        data-test="transfer-generate"
        @click="ctl.generate()"
      >
        <v-progress-circular v-if="ctl.generating.value" size="14" width="2" indeterminate />
        <template v-else>{{ t('lgvtGenerate').replace('{n}', result.transfers.length) }}</template>
      </button>
    </footer>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { transferKey, isShopTransfer } from '@/utils/ventilationTransfers'
import { conditionnementText } from '@/utils/packQuantityText'

const props = defineProps({
  /** Retour de useVentilationTransfers. */
  controller: { type: Object, required: true },
})
const { t, locale } = useI18n()
const ctl = props.controller
const result = computed(() => ctl.result.value)
const hasContent = computed(
  () => result.value.transfers.length || result.value.shortages.length || result.value.unknown.length || result.value.unverified.length,
)
const key = transferKey
const isShop = isShopTransfer
const sourceName = computed(() => (ctl.sourceOptions.value.find((o) => o.id === ctl.sourceId.value) || {}).name || '')
// Colis en conditionnement (« 10 fûts de 30 L »), sans type : en unité réelle (« 300 L »).
const count = (s, n) =>
  conditionnementText({ count: n, packagingType: s.packagingType, unitsPerPack: s.unitsPerPack, unit: s.unit }, t, locale.value)
const packLabel = (tr) => count(tr, tr.packs)
</script>

<style scoped>
.lgvt-root { border: 1px solid var(--fb-border, #e5e7eb); border-radius: 14px; background: var(--fb-surface, #fff); padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
.lgvt-head { display: flex; align-items: center; gap: 8px; color: var(--fb-text, #212121); }
.lgvt-title { font-size: var(--fs-base); font-weight: var(--fw-bold); }
.lgvt-controls { display: flex; flex-wrap: wrap; gap: 10px; }
.lgvt-field { display: flex; flex-direction: column; gap: 4px; min-width: 200px; flex: 1; }
.lgvt-label { font-size: var(--fs-xs); color: var(--fb-muted, #6b7280); }
.lgvt-select { min-height: 44px; border: 1px solid var(--fb-border, #e5e7eb); border-radius: 10px; padding: 0 10px; background: var(--fb-surface, #fff); font: inherit; font-size: var(--fs-base); color: var(--fb-text, #212121); }
.lgvt-select--row { min-width: 180px; }
.lgvt-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.lgvt-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--fb-subtle, #fafafa); }
.lgvt-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.lgvt-item { font-size: var(--fs-base); font-weight: var(--fw-bold); color: var(--fb-text, #212121); }
.lgvt-meta { font-size: var(--fs-sm); color: var(--fb-muted, #6b7280); }
.lgvt-check { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: var(--fs-sm); color: var(--fb-muted, #6b7280); cursor: pointer; }
.lgvt-sum { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; padding: 8px 10px; border-radius: 10px; background: var(--fb-subtle, #fafafa); }
.lgvt-badge { display: inline-block; margin-right: 6px; padding: 1px 8px; border-radius: 999px; background: var(--fb-primary-soft, #eff6ff); color: var(--fb-primary, #1d4ed8); font-size: var(--fs-xs); font-weight: var(--fw-bold); }
.lgvt-short { font-size: var(--fs-sm); color: var(--fb-danger, #dc2626); }
.lgvt-block { display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; border-radius: 10px; background: var(--fb-subtle, #fafafa); font-size: var(--fs-sm); color: var(--fb-muted, #6b7280); }
.lgvt-block--warn { background: var(--fb-danger-soft, #fef2f2); color: var(--fb-danger, #dc2626); }
.lgvt-error { margin: 0; font-size: var(--fs-sm); color: var(--fb-danger, #dc2626); }
.lgvt-foot { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.lgvt-hint { font-size: var(--fs-sm); color: var(--fb-muted, #6b7280); }
.lgvt-btn { min-height: 44px; padding: 0 18px; border: 0; border-radius: 10px; font: inherit; font-size: var(--fs-base); font-weight: var(--fw-bold); background: var(--fb-primary, #1d4ed8); color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.lgvt-btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
